# NE-P1-S2: RequestContext + Tenant-Scoped Tool Handlers

## Type: Security Hardening
## Risk: high
## Phase: P1b
## Codex Findings Addressed: Rev1 #1 (user_id spoofing), #2 (tenant context not at tool boundary), #4 (user_id predicates missing); Rev2 #1 (cache key leakage), #2 (handoff scoping)

## Description
Introduce a trusted `RequestContext` object that flows from auth middleware into every tool handler invocation. This is the ONLY source of truth for tenant_id and user_id — tool args MUST NOT be trusted for identity. Wire tenant_id (and user_id where applicable) into all data-touching read/write paths. Update in-memory cache keys to be tenant-aware.

## Isolation Policy (codex Rev1 #4, Rev2 #2, Rev3 #1)
- **Tenant isolation: MANDATORY** — every data query includes `WHERE tenant_id = ?`
- **User isolation: PER-TOOL** — user profiles are user-scoped within tenant
- **Messages: TENANT + AGENT scoped** — filtered by (tenant_id, to_agent). Messages are NOT user-scoped — agents are shared resources within a tenant.
- **Handoffs: TENANT + PROJECT scoped** — filtered by (tenant_id, project_id). Any agent within the tenant can read/write handoffs for a project. Handoffs are NOT agent-scoped or user-scoped. The unique constraint is (tenant_id, project_id) WHERE active=1. user_id is stamped on write for audit trail but NOT used as a query predicate or isolation boundary.
- **Agent definitions: GLOBAL** — register_agent, set_agent_identity, get_agent_status are cross-tenant

## RequestContext Architecture (codex Rev1 #1, #2)
```typescript
interface RequestContext {
  tenantId: string;       // From auth middleware (req.tenant.id) — TRUSTED
  userId: string | null;  // From JWT claims or null for agent API keys — TRUSTED
  timezone: string | null; // From X-User-Timezone header — UNTRUSTED (informational)
  apiKeyId: string | null; // From auth middleware — TRUSTED
}
```

### Plumbing:
1. Auth middleware builds `RequestContext` from `req.tenant` + JWT claims
2. For legacy API keys without tenant: `tenantId = 'default'`, `userId = null`
3. `_handleToolCall(name, args, context: RequestContext)` — signature updated
4. All tool handlers receive context as third parameter
5. **No tool handler reads tenant_id or user_id from args for trust boundaries**
6. Tool args may still accept `agentId` (agents are global identifiers, not trust boundaries)

### Auth Binding (codex Rev1 #1):
- API key auth: tenant from key lookup, userId = null (service-to-service)
- JWT auth (future): tenant + userId from signed claims
- Until JWT is implemented: accept X-User-Id header ONLY in dev mode (ENABLE_DEV_HEADERS=1)
- Production: user_id comes exclusively from JWT claims

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
- [ ] RequestContext interface defined and exported
- [ ] Auth middleware builds RequestContext for every request
- [ ] _handleToolCall signature includes RequestContext parameter
- [ ] All data-touching handlers use context.tenantId (NOT args) for DB queries
- [ ] In-memory cache keys updated to tenantId:agentId composite format
- [ ] Agent tools (register, identity, status) remain global
- [ ] Legacy API keys default to tenantId='default', userId=null
- [ ] X-User-Id header only accepted when ENABLE_DEV_HEADERS=1
- [ ] Handoffs are tenant-scoped only (not user-scoped); user_id stamped for audit trail
- [ ] Contract tests pass (they use default tenant implicitly)
- [ ] New test: cross-tenant isolation — tenant1 data invisible to tenant2
- [ ] New test: verify tool args cannot override trusted tenant context
- [ ] New test: cache isolation — verify tenant1 cached data not returned for tenant2

## Files
- touches: src/unified-neural-mcp-server.ts (RequestContext, _handleToolCall, all handlers)
- touches: src/unified-server/memory/index.ts (tenant_id params on all query methods, cache key updates)
- touches: src/middleware/security.ts (build RequestContext)
- creates: tests/contract-tenant-isolation.test.ts
