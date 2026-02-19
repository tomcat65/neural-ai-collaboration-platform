# NE-P1-S2: RequestContext + Tenant-Scoped Tool Handlers

## Type: Security Hardening
## Risk: high
## Phase: P1b
## Codex Findings Addressed: Rev1 #1 (user_id spoofing), #2 (tenant context not at tool boundary), #4 (user_id predicates missing); Rev2 #1 (cache key leakage), #2 (handoff scoping)

## Description
Introduce a trusted `RequestContext` object that flows from auth middleware into every tool handler invocation. This is the ONLY source of truth for tenant_id and user_id — tool args MUST NOT be trusted for identity. Wire tenant_id (and user_id where applicable) into all data-touching read/write paths. Update in-memory cache keys to be tenant-aware.

## Provider Decision (2026-02-19)
- **Auth provider: Auth0**
- **Implementation style: provider-agnostic adapter (OIDC/JWT)**
- **Tenant model: `tenant_memberships` is canonical; `users.tenant_id` is temporary shadow/compatibility only**
- **API keys remain local to neural** (hashed, looked up in neural DB; not delegated to Auth0)
- **Pragmatic migration note:** if Task 900 shipped before `tenant_memberships` landed, Task 1000 includes a small prereq migration to add it before auth middleware wiring

## Isolation Policy (codex Rev1 #4, Rev2 #2, Rev3 #1)
- **Tenant isolation: MANDATORY** — every data query includes `WHERE tenant_id = ?`
- **User isolation: PER-TOOL** — user profiles are user-scoped within tenant
- **Messages: TENANT + AGENT scoped** — filtered by (tenant_id, to_agent). Messages are NOT user-scoped — agents are shared resources within a tenant.
- **Handoffs: TENANT + PROJECT scoped** — filtered by (tenant_id, project_id). Any agent within the tenant can read/write handoffs for a project. Handoffs are NOT agent-scoped or user-scoped. The unique constraint is (tenant_id, project_id) WHERE active=1. user_id is stamped on write for audit trail but NOT used as a query predicate or isolation boundary.
- **Agent definitions: GLOBAL** — register_agent, set_agent_identity, get_agent_status are cross-tenant

## RequestContext Architecture (codex Rev1 #1, #2)
```typescript
interface RequestContext {
  tenantId: string;                     // TRUSTED: resolved from verified identity (JWT/API key)
  userId: string | null;                // TRUSTED: resolved local user
  authType: 'jwt' | 'api_key' | 'dev'; // TRUSTED: auth path used
  apiKeyId: string | null;              // TRUSTED: for api_key path
  idpSub: string | null;                // JWT `sub` (Auth0 user id), null for api keys
  roles: string[];                      // Domain roles from tenant_memberships
  scopes: string[];                     // JWT permissions / API key scopes
  mfaLevel: string | null;              // Optional enriched claim (informational)
  timezoneHint: string | null;          // Optional claim/header (informational)
}
```

### Plumbing:
1. Auth middleware verifies JWT via OIDC/JWKS config (issuer, audience, jwksUrl are config-driven, not hardcoded).
2. For Auth0 JWTs, map claims:
   - `sub` -> `idpSub`
   - `https://neural-mcp.local/org_id` -> external org id (then resolve to local `tenantId`)
   - `permissions` + `https://neural-mcp.local/roles` -> `scopes` + `roles`
   - `https://neural-mcp.local/mfa_level` -> `mfaLevel`
3. Resolve tenant via local mapping (Auth0 org -> local tenant). Tool args NEVER define tenant identity.
4. Perform JIT upsert in neural middleware (not Auth0 Action): user + membership sync after token verification.
5. Build `RequestContext` from verified principal + local membership/role resolution.
6. `_handleToolCall(name, args, context: RequestContext)` — signature updated.
7. All tool handlers receive context as third parameter.
8. **No tool handler reads tenant_id or user_id from args for trust boundaries**.
9. Tool args may still accept `agentId` (agents are global identifiers, not trust boundaries).

### Auth Binding (codex Rev1 #1):
- JWT auth (Auth0): tenant + user from verified token + local membership resolution.
- API key auth: tenant/scopes from key lookup, userId nullable based on key owner context.
- API keys remain a neural-local auth path (no Auth0 M2M dependency for user-owned keys).
- Dev-only fallback: accept X-User-Id header ONLY when ENABLE_DEV_HEADERS=1.
- Production: identity context comes exclusively from verified JWT or verified API key.

## Provider-Agnostic Auth Contract (Task 1000 API)
```typescript
interface VerifiedPrincipal {
  provider: 'auth0' | string;
  iss: string;
  aud: string | string[];
  sub: string;
  orgId?: string;            // Auth0 org_id
  permissions?: string[];    // Auth0 permissions claim
  claims: Record<string, unknown>;
}

interface AuthAdapter {
  verifyBearer(token: string): Promise<VerifiedPrincipal>;
}

interface TenantResolver {
  resolve(input: {
    principal: VerifiedPrincipal;
    requestedTenantId?: string;
  }): Promise<{
    tenantId: string;
    userId: string;
    roles: string[];
    scopes: string[];
  }>;
}
```

## Membership Authority Rules (Auth0 + Neural)
- Auth0 is authoritative for external org membership existence at auth time.
- Neural is authoritative for domain role binding (`tenant_memberships.role`) and app authorization policy.
- On valid JWT with `https://neural-mcp.local/org_id`, middleware verifies/creates local membership (JIT sync) before handler dispatch.
- If JWT namespaced org claim cannot be mapped to a local tenant, reject with 403 (or 401 by policy) — never fall back to args.
- Optional requested tenant override is allowed only when membership-validated.

## JWKS + Availability Requirements
- JWKS URL is configurable: `https://{domain}/.well-known/jwks.json` for Auth0, but read from config.
- JWT verification uses local JWKS cache keyed by `kid`; no per-request Auth0 round-trip.
- Background JWKS refresh with bounded TTL and stale-if-error behavior to reduce IdP outage blast radius.

## Auth0 Actions Boundary
- Auth0 Actions are optional claim enrichment only (e.g., `mfaLevel`, optional timezone hint).
- JIT upsert and tenant/membership resolution happen in neural middleware, not in Auth0 Actions.

## In-Memory Cache Tenant Isolation (codex Rev2 #1)
MemoryManager uses in-memory caches keyed by agentId (e.g., individual memory cache, preferences cache). These MUST be updated:

### Current (UNSAFE):
```typescript
// Cache key: agentId only — leaks across tenants
this.cache.get(agentId)
```

### Required (SAFE):
```typescript
// Cache key: tenantId:agentId — tenant-isolated
const cacheKey = `${context.tenantId}:${agentId}`;
this.cache.get(cacheKey)
```

### Scope of cache key changes:
- Individual memory cache (getIndividualMemory, setPreferences)
- Any other in-memory lookup keyed by agentId
- Alternative: if cache complexity is high, bypass cache entirely for tenant-scoped reads and rely on SQLite (with indexes, performance is acceptable)
- Decision: prefer composite cache keys over cache bypass (lower latency)

## Scope: All Data-Touching Handlers
1. create_entities — INSERT with context.tenantId
2. search_entities — WHERE tenant_id = context.tenantId
3. add_observations — WHERE tenant_id on entity lookup + INSERT
4. create_relations — WHERE tenant_id on both entities + INSERT
5. read_graph — WHERE tenant_id on full graph export
6. send_ai_message — INSERT with context.tenantId
7. get_ai_messages — WHERE tenant_id on retrieval
8. register_agent — GLOBAL (no tenant filter)
9. set_agent_identity — GLOBAL
10. get_agent_status — GLOBAL
11. record_learning — INSERT with context.tenantId
12. get_individual_memory — WHERE tenant_id on retrieval (cache key: tenantId:agentId)
13. set_preferences — WHERE tenant_id on insert/update (cache key: tenantId:agentId)
14. begin_session — WHERE tenant_id on handoff + context queries (handoff NOT user-scoped)
15. end_session — INSERT with context.tenantId on handoff write (user_id stamped for audit only)

## Acceptance Criteria
- [ ] RequestContext interface defined/exported with fields: tenantId, userId, authType, apiKeyId, idpSub, roles, scopes, mfaLevel, timezoneHint
- [ ] Auth middleware builds RequestContext for every request
- [ ] Auth adapter contract implemented (`verifyBearer`) and tenant resolver contract implemented (`resolve`)
- [ ] `tenant_memberships` exists before handler wiring (from Task 900 or prereq migration in Task 1000)
- [ ] _handleToolCall signature includes RequestContext parameter
- [ ] All data-touching handlers use context.tenantId (NOT args) for DB queries
- [ ] In-memory cache keys updated to tenantId:agentId composite format
- [ ] Agent tools (register, identity, status) remain global
- [ ] Auth0 JWT claim mapping implemented:
  - `sub` -> idpSub
  - `https://neural-mcp.local/org_id` -> tenant resolution input
  - `permissions` + `https://neural-mcp.local/roles` -> scopes/roles
  - `https://neural-mcp.local/mfa_level` -> mfaLevel
- [ ] Tenant resolution uses local membership mapping; args cannot set/override tenant identity
- [ ] JIT upsert occurs in middleware after JWT verification (user + membership sync)
- [ ] API key path remains local to neural and yields same RequestContext shape as JWT path
- [ ] JWKS endpoint/config is not hardcoded; local cache + refresh behavior implemented
- [ ] Legacy API keys default to tenantId='default', userId=null (until key migration complete)
- [ ] X-User-Id header only accepted when ENABLE_DEV_HEADERS=1
- [ ] Handoffs are tenant-scoped only (not user-scoped); user_id stamped for audit trail
- [ ] Contract tests pass (they use default tenant implicitly)
- [ ] New test: cross-tenant isolation — tenant1 data invisible to tenant2
- [ ] New test: verify tool args cannot override trusted tenant context
- [ ] New test: cache isolation — verify tenant1 cached data not returned for tenant2
- [ ] New test: Auth0 JWT with unknown `https://neural-mcp.local/org_id` is rejected
- [ ] New test: requested tenant override without membership is rejected

## Files
- touches: src/unified-neural-mcp-server.ts (RequestContext, _handleToolCall, all handlers)
- touches: src/unified-server/memory/index.ts (tenant_id params on all query methods, cache key updates)
- touches: src/middleware/security.ts (build RequestContext)
- creates: tests/contract-tenant-isolation.test.ts
