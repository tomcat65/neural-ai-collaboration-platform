# BV-S1: Graph Export API

## Type: Core (backend)
## Risk: Medium
## Phase: P1
## Team: API
## Blocked-by: BV-S0

## Description
Add `GET /api/graph-export` endpoint to the neural MCP server (port 5174 inside Docker / 6174 on host). Policy-filtered, human-facing graph export — not raw tenant dump. Two response modes: full graph (default) and observations-only (when `entityName` is set). Role/scope-aware access control with deterministic server-side sensitivity classification. Tenant-isolated, audit-logged, content-hash ETag with policy fingerprint.

## User Story
**As** a human user viewing the Brain Visualization,
**I need** a secure, policy-filtered endpoint that exports the knowledge graph with role-appropriate content,
**So that** I see only the data my permissions allow, with agent-internal content hidden by default.

## Acceptance Criteria
- [ ] `GET /api/graph-export` registered after `/ai-messages/:agentId` endpoint (~line 545)
- [ ] Query params:
  - `cursor` (opaque string)
  - `limit` (default 200, max 1000)
  - `includeObservations` (boolean, default **false**)
  - `updatedSince` (ISO timestamp, optional)
  - `entityName` (string, optional — triggers observations-only response mode)
- [ ] **Full mode** (no `entityName`): response `{ nodes, links, observations?, nextCursor, totals: { nodes, links, observations }, generatedAt }`
- [ ] **entityName mode**: observations-only `{ observations, totals: { observations }, generatedAt }` — nodes/links omitted
- [ ] Node: `{ name, entityType, observationCount, id, createdAt }`
- [ ] Link: `{ source: entityName, target: entityName, relationType }`
- [ ] Observation: `{ entityName, contents: string[], createdAt }` — `contents` is always a `string[]` array matching DB schema (`json_extract(content, '$.contents')`)
- [ ] Relations read from `shared_memory` where `memory_type = 'relation'`, `json_extract(content, '$.from')` as source, `json_extract(content, '$.to')` as target
- [ ] Tenant isolation via `context.tenantId` — NEVER accept tenant from query/body
- [ ] Auth: new `authorizeGraphRead(context)` in MemoryManager (role/scope-aware):
  - **Permission vocabulary:**
    - `graph:view` — topology (nodes + links). Minimum to access endpoint.
    - `graph:observations:view` — non-sensitive observations. Required for `includeObservations=true`.
    - `graph:sensitive:view` — agent-internal/system observations (default-hidden).
    - Legacy: `graph:read`, `graph:write`, `*` imply `graph:view` + `graph:observations:view`.
  - **Role mapping:**
    - admin/owner (JWT): all permissions including `graph:sensitive:view`
    - member (JWT): `graph:view` + `graph:observations:view` (no sensitive)
    - viewer (JWT, future): `graph:view` only
    - API key: determined by explicit scopes
    - Dev: passthrough (all permissions)
  - Empty scopes: passthrough if `ALLOW_LEGACY_GRAPH_MUTATIONS=1`
- [ ] **Permission failure: strict 403** — `includeObservations=true` without `graph:observations:view` → 403 (not silent omission). Locked behavior across all docs.
- [ ] Server-side sensitivity classification (deterministic, 4-step precedence). `contents` is `string[]` — evaluate ALL entries; any match → entire observation is sensitive:
  1. `messageType` field in (`system`, `internal`, `coordination`) → **sensitive**
  2. Entity metadata `sensitive: true` flag → **sensitive**
  3. Any `contents[]` entry prefixed with `[SYSTEM]` or `[INTERNAL]` — **case-insensitive, leading-whitespace-trimmed** before prefix check → **sensitive**
  4. **Default: non-sensitive** — observations with no markers in any `contents[]` entry are visible to all roles with `graph:observations:view`
- [ ] Sensitive observations excluded from response unless caller has `graph:sensitive:view`
- [ ] Rate limiting: inherits `rateLimitMiddleware` (100 req/min)
- [ ] Audit: `memoryManager.auditLog('graph_export', ...)` on each invocation
- [ ] Response cap: limit clamped to 1000
- [ ] ETag: SHA-256 of canonical response fields + caller's sorted effective permission set (policy fingerprint). Prevents cross-role cache leakage. Cached 30s. Honor `If-None-Match` → 304
- [ ] Contract test: auth required (401 without token)
- [ ] Contract test: `authorizeGraphRead` — admin sees all, member sees non-sensitive, viewer sees topology only
- [ ] Contract test: `graph:observations:view` denied → `includeObservations=true` returns strict 403
- [ ] Contract test: sensitive observations excluded for member (all 3 markers: messageType, metadata flag, content prefix)
- [ ] Contract test: observations with no sensitivity markers default to non-sensitive (visible to member)
- [ ] Contract test: pagination (cursor returns next page)
- [ ] Contract test: tenant isolation (tenant A cannot see tenant B data)
- [ ] Contract test: full-mode response shape (node keyed by name, link source/target match)
- [ ] Contract test: entityName-mode response shape (observations-only, no nodes/links)
- [ ] Contract test: ETag differs for same data with different roles (policy fingerprint)
- [ ] Contract test: ETag / 304 (same data + same role → same ETag → 304)
- [ ] Contract test: multi-item observation — `contents: ["normal text", "[SYSTEM] internal note"]` classified as sensitive (any entry match triggers classification)
- [ ] Contract test: case-variant prefix — `[system] msg` and `  [INTERNAL] msg` (with leading whitespace) both classified as sensitive

## Files
- touches: `src/unified-neural-mcp-server.ts`
- touches: `src/unified-server/memory/index.ts` (add `authorizeGraphRead()` + `getGraphExport()`)
- creates: `tests/contract-graph-export.test.ts`

## Wiring Proof
- CLI: `curl -H "X-API-Key: $KEY" localhost:6174/api/graph-export | jq '.totals'`
- CLI: `curl -H "X-API-Key: $KEY" 'localhost:6174/api/graph-export?entityName=foo&includeObservations=true' | jq 'keys'` → `["generatedAt","observations","totals"]`
- Tests: `npx vitest run tests/contract-graph-export.test.ts` — all passing
- Regression: existing tests unaffected

## Status: **PENDING**
