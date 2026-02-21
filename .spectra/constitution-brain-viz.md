# SPECTRA Constitution — Neural 3D Brain Visualization

## Project
Visualize neural's knowledge graph as an interactive 3D brain — entities as glowing nodes inside a translucent procedural brain shell, relations as curved connections, observations expandable on click.

## Owner
Tommy (claude-desktop coordinator, codex reviewer, claude-code builder)

## Initiated
2026-02-20

## Level
3 — Large Feature (parallel sub-agent teams)

## Non-Negotiable Constraints
1. **Zero breakage** — existing Observatory dashboard and all current routes must remain functional
2. **Vue 3 only** — new `/brain` route lives inside existing `ui/vue-ui/` project. No React, no separate SPA
3. **Tenant isolation** — `/api/graph-export` must scope ALL queries by `context.tenantId` from RequestContext only (never client-supplied)
4. **Auth + access control** — Brain Viz is a policy-filtered human view, not raw tenant export. `authorizeGraphRead()` is role/scope-aware:
   - Permissions: `graph:view` (topology), `graph:observations:view` (non-sensitive obs), `graph:sensitive:view` (agent-internal). Legacy `graph:read`/`graph:write`/`*` imply view+observations.
   - JWT roles: admin/owner = all; member = view+observations; viewer = view only. API key: explicit scopes. Dev: passthrough.
   - Server-side filtering: sensitive observations excluded unless `graph:sensitive:view`. Never UI-side redaction. Strict 403 when `includeObservations=true` without `graph:observations:view`.
   - Sensitivity classification (deterministic, server-side). **Observation `contents` is a `string[]` array** (DB schema: `json_extract(content, '$.contents')`). Each classification step evaluates ALL entries in the array — if any entry matches, the entire observation is classified as sensitive:
     1. Check `messageType` field: `system`, `internal`, `coordination` → **sensitive**
     2. Check entity metadata `sensitive: true` flag → **sensitive**
     3. Check observation `contents[]` entries for prefix `[SYSTEM]` or `[INTERNAL]` — **case-insensitive, leading-whitespace-trimmed** before prefix check. If any entry matches → **sensitive**
     4. **Default: non-sensitive** — observations with no `messageType`, no sensitive flag, and no matching prefix in any `contents[]` entry are visible to all roles with `graph:observations:view`
   - ETag includes policy fingerprint (caller's permissions) to prevent cross-role cache leakage.
5. **Docker parity** — brain route must work in Docker build (nginx serves dist, proxies /api)
6. **Performance floor** — 300-800 entities smooth at 60fps; low-thousands with LOD degradation acceptable
7. **OWASP compliance** — response size caps, pagination, rate limiting, audit logging on graph-export

## Infrastructure Constraints
- Vue UI: `ui/vue-ui/`, dev port 5176, Vite, Pinia
- MCP server: `src/unified-neural-mcp-server.ts`, Express on port 6174
- Docker compose: `docker-compose.yml`, project `unified`
- Docker compose stacks: `docker-compose.yml` uses `neural-ai-server` (port 5174), `docker/docker-compose.simple.yml` uses `neural-ai-platform` (port 5174). Dockerfile parameterized via ARGs — not hard-coded to either.
- API proxy: Vite dev `/api/graph-export` → `localhost:6174` (before catch-all `/api` → `localhost:3000`); Docker nginx: `/api/graph-export` → `$MCP_UPSTREAM` (ARG, default `neural-ai-platform:5174`)
- Graph data: `shared_memory` table, content types `entity`/`relation`/`observation`
- Auth: JWT / API key via `authMiddleware`, tenant from `TenantRequest.requestContext`
- Rate limit: 100 req/min general via `rateLimitMiddleware`
- Audit: `memoryManager.auditLog()` → `neural_audit_log` table

## Architectural Decisions (Locked)
1. **3d-force-graph** as graph engine (not raw Three.js scene graph) — mature, WebGL, supports `nodeThreeObject`/`linkThreeObject` hooks for custom geometry
2. **Procedural brain shell** (Phase 1) — deformed sphere with simplex noise, Fresnel/glass shader. GLB realism mode deferred to Phase 2 (out of scope)
3. **Force simulation freeze** — `warmupTicks`/`cooldownTicks` strategy to settle layout then stop physics
4. **InstancedMesh** for repeated geometry (particles, observation satellites) — GPU instancing required for performance
5. **Cursor-based pagination** on `/api/graph-export` — not offset-based, to handle concurrent graph mutations
6. **ETag via content hash + policy fingerprint** — SHA-256 of: canonical response fields (sorted node `{name, entityType, observationCount}` + sorted link `{source, target, relationType}` + `max(updated_at)`) + caller's sorted effective permission set. Cached 30s. Changes when data OR caller's permissions differ. Prevents cross-role cache leakage.
7. **Observation expansion** — collapsed by default, `includeObservations=false` on initial fetch, lazy-load per entity on click via `entityName` filter param. `entityName` mode returns observations-only payload (no nodes/links). Cap satellite count per node
8. **Node/link identity** — nodes keyed by `name` (unique per tenant), links use `{ source: entityName, target: entityName }` matching DB `$.from`/`$.to` fields. ForceGraph3D `nodeId` accessor = `'name'`
9. **Observation storage contract** — DB stores observations as `{ entityName, contents: string[], addedBy, timestamp, metadata }`. The `contents` field is always a `string[]` (array of strings). Export shape mirrors this: `{ entityName, contents: string[], createdAt }`. Sensitivity classification evaluates ALL entries in `contents[]`.

## Agents
- **claude-desktop**: Coordinator — specs, task assignment, gate approvals
- **codex**: Reviewer — SPECTRA plan review, audits, verification
- **claude-code**: Builder — implementation, testing, commits
