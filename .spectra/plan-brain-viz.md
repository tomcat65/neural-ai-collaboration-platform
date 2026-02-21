# SPECTRA Execution Plan — Neural 3D Brain Visualization (Level 3)

## Metadata
- Project: Neural 3D Brain Visualization
- Level: 3 (Large Feature — parallel teams)
- Generated: 2026-02-20 (Rev 7 — observation contents[] schema, prefix normalization)
- Branch: `brain-viz` (from `neural-efficiency`)
- Agents: claude-code (builder), codex (reviewer), claude-desktop (coordinator)
- Constitution: `.spectra/constitution-brain-viz.md`

## Codex Review Findings

### Rev 1 → Rev 2

| # | Finding | Resolution |
|---|---------|------------|
| 1 | API topology: graph-export on 6174, Vue proxies `/api` to 3000 | **Fixed**: Vite proxy routes `/api/graph-export` to 6174 before `/api` catch-all. Docker nginx gets matching upstream. |
| 2 | Link identity: nodes keyed by `id`, relations use `from`/`to` names | **Fixed**: nodes keyed by `name`, links use entity names. ForceGraph3D `nodeId` = `'name'`. |
| 3 | ETag: `generatedAt + count` changes every request | **Fixed**: content-hash ETag. |
| 4 | Permission: `graph:read` undefined | **Fixed**: `authorizeGraphRead()` mirrors `authorizeGraphMutation()`. |
| 5 | Over-fetch: `includeObservations=true` default | **Fixed**: default `false`, lazy-load on click. |
| 6 | Docker service name wrong | **Fixed**: no compose service ref, standalone Dockerfile build. |
| + | Mandatory S0 gate | **Added**: BV-S0 build verification gate. |

### Rev 2 → Rev 3

| # | Finding | Resolution |
|---|---------|------------|
| 7 | Docker upstream: `neural-ai-platform` not in compose | **Fixed**: parameterized via ARG (see Rev 4). |
| 8 | S5 still had `docker compose build vue-ui` | **Fixed**: standalone `docker build`. |
| 9 | ETag hash too weak | **Fixed**: canonical fields + `max(updated_at)`. |
| 10 | S3 lazy-load needs per-entity filter | **Fixed**: `entityName` param added. See Rev 4 for response semantics. |

### Rev 3 → Rev 4

| # | Finding | Resolution |
|---|---------|------------|
| 11 | Docker topology over-corrected — two compose stacks exist (`docker-compose.yml` → `neural-ai-server:5174`, `docker/docker-compose.simple.yml` → `neural-ai-platform:3000`). Hard-coding either breaks the other. | **Fixed**: Dockerfile parameterized with `ARG API_UPSTREAM=neural-ai-platform:3000`, `ARG MCP_UPSTREAM=neural-ai-platform:5174`, `ARG WS_UPSTREAM=neural-ai-platform:3001`. Each compose file passes its values via `build.args`. S5 documents both stacks. Constitution no longer hard-codes service name. |
| 12 | `entityName` mode still returns full `{ nodes, links, observations }` — over-fetches on each click | **Fixed**: when `entityName` is provided, response is observations-only: `{ observations: [], totals: { observations }, generatedAt }`. Nodes/links omitted — client already has them from initial fetch. Contract test added for entityName-mode payload shape. |

### Rev 4 → Rev 5 (codex architectural guidance)

| # | Guidance | Resolution |
|---|---------|------------|
| 13 | Brain Viz is human-facing — needs policy-filtered view, not raw tenant export | **Incorporated**: `authorizeGraphRead()` expanded to role/scope-aware. Two visibility tiers: topology (nodes+links) and content (observations). Server-side filtering enforced. |
| 14 | RBAC permissions: `graph:view`, `graph:observations:view`, `graph:sensitive:view` | **Incorporated**: S1 enforces `graph:view` for topology, `graph:observations:view` for observations. Sensitive observations excluded unless `graph:sensitive:view` present. Legacy empty-scope passthrough preserved. |
| 15 | Default-hide agent-internal/system content from human viewers | **Incorporated**: observations with `messageType` = `system`/`internal`/`coordination` or tagged as agent-internal excluded by default. Exposed only with `graph:sensitive:view`. |
| 16 | ETag must include policy fingerprint to prevent cross-role cache leakage | **Incorporated**: ETag hash input includes caller's effective permission set (sorted scopes). Different roles get different ETags → no cross-role 304. |

### Rev 5 → Rev 6

| # | Finding | Resolution |
|---|---------|------------|
| 17 | Constitution ETag AD section (line 45) omitted policy fingerprint, conflicting with auth section (line 23) | **Fixed**: AD section now reads "ETag via content hash + policy fingerprint" with full description. Both sections consistent. |
| 18 | Sensitive observation filtering has no canonical classification schema | **Fixed**: deterministic 4-step classification defined in constitution + S1: (1) `messageType` in `system`/`internal`/`coordination` → sensitive, (2) entity metadata `sensitive: true` → sensitive, (3) content prefix `[SYSTEM]`/`[INTERNAL]` → sensitive, (4) **default: non-sensitive**. Contract test covers each path. |
| 19 | Permission-failure behavior inconsistent ("403 or omitted" vs strict 403) | **Fixed**: locked to **strict 403** everywhere. `includeObservations=true` without `graph:observations:view` → 403. All plan/constitution/story text aligned. |
| OQ | Observations with no messageType/tag — default classification? | **Answered**: default is **non-sensitive**. Visible to any role with `graph:observations:view`. Explicit in constitution + S1 AC. |

### Rev 6 → Rev 7

| # | Finding | Resolution |
|---|---------|------------|
| 20 | Observation export shape uses singular `content` but DB stores `contents: string[]` array. Multi-item observations could be truncated or misclassified. | **Fixed**: Export shape changed to `{ entityName, contents: string[], createdAt }` matching DB schema. Sensitivity classification evaluates ALL entries in `contents[]` — any match → entire observation is sensitive. AD9 added to constitution. Contract test for multi-item observation classification added. |
| 21 | Prefix sensitivity matching `[SYSTEM]`/`[INTERNAL]` has no case/whitespace normalization. | **Fixed**: Prefix matching is case-insensitive, leading-whitespace-trimmed before check. Specified in constitution, plan, and S1 ACs. Contract test for case-variant prefix added. |

## Team Structure
- **Team API**: BV-S1 (graph-export endpoint + contract tests)
- **Team UI**: BV-S2, BV-S3, BV-S4 (Vue route, ForceGraph3D, interactions, brain shell)
- **Team Perf**: BV-S5 (InstancedMesh, LOD, simulation freeze, Docker verify)
- Teams API and UI can run in parallel — UI mocks data until API lands

## Dependency Graph

```
BV-S0 (Build Gate) ───────┐
                           ├──→ BV-S1 (API) ──────────────┐
                           │                                ├──→ BV-S5 (Perf + Polish)
                           └──→ BV-S2 (Route + Graph) ────┤
                                  ├──→ BV-S3 (Interactions)│
                                  └──→ BV-S4 (Brain Shell) │
                                        └──────────────────┘
```

- BV-S0 must pass before any work begins
- BV-S1 and BV-S2 can start in parallel after S0 (S2 uses mock data)
- BV-S3 and BV-S4 depend on BV-S2 (component must exist)
- BV-S3 and BV-S4 can run in parallel
- BV-S5 depends on all of S1-S4

## Key Architecture Decisions

### Node/Link Identity Contract
- **Node key**: `name` (unique per tenant in `shared_memory` entity rows)
- **Node shape**: `{ name, entityType, observationCount, id, createdAt }`
- **Link shape**: `{ source: entityName, target: entityName, relationType }`
- **Observation shape**: `{ entityName, contents: string[], createdAt }` — `contents` is always a `string[]` array (mirrors DB schema `json_extract(content, '$.contents')`)
- Relations in DB use `json_extract(content, '$.from')` / `json_extract(content, '$.to')` — these are entity names, so link source/target are entity names. ForceGraph3D `nodeId` accessor set to `'name'`.

### API Data Path
- Graph-export endpoint lives on MCP server (port 5174 inside Docker / 6174 on host, same process as graph data)
- Vite dev proxy: add `/api/graph-export` → `http://localhost:6174` rule (before existing `/api` → 3000 catch-all)
- Docker nginx: Dockerfile uses `ARG MCP_UPSTREAM` (default `neural-ai-platform:5174`). Each compose stack overrides via `build.args`:
  - `docker-compose.yml`: `MCP_UPSTREAM=neural-ai-server:5174`
  - `docker/docker-compose.simple.yml`: uses default `neural-ai-platform:5174`
- Browser never hits MCP port directly — always proxied

### entityName Mode (Observations-Only Response)
- When `entityName` query param is set (with `includeObservations=true`), response is lightweight observations-only:
  `{ observations: [], totals: { observations }, generatedAt }`
- Nodes and links are omitted — client already has the graph from the initial full fetch
- This prevents re-downloading the entire graph on each entity click

### Access Control Model (Human-Facing View)
Brain Viz is a policy-filtered human view, not a raw tenant graph export. Visibility is split into tiers:

**Permission vocabulary:**
- `graph:view` — see topology (nodes + links). Minimum for `/api/graph-export`.
- `graph:observations:view` — see non-sensitive observations. Required when `includeObservations=true`.
- `graph:sensitive:view` — see agent-internal/system observations (default-hidden).
- Legacy compat: `graph:read`, `graph:write`, `*` all imply `graph:view` + `graph:observations:view`.

**Role mapping (v1 — no per-entity ACL):**
- `admin`/`owner` (JWT): all permissions including `graph:sensitive:view`
- `member` (JWT): `graph:view` + `graph:observations:view`
- `viewer` (JWT, future): `graph:view` only
- API key: determined by explicit scopes in key config

**Server-side filtering (never UI-side redaction):**
- `includeObservations=true` without `graph:observations:view` → **strict 403**
- Sensitive observations excluded unless caller has `graph:sensitive:view`
- **Sensitivity classification (deterministic, 4-step precedence).** Observation `contents` is a `string[]` array — each step evaluates ALL entries; any match → entire observation is sensitive:
  1. `messageType` field in (`system`, `internal`, `coordination`) → **sensitive**
  2. Entity metadata `sensitive: true` flag → **sensitive**
  3. Any `contents[]` entry prefixed with `[SYSTEM]` or `[INTERNAL]` (case-insensitive, leading-whitespace-trimmed) → **sensitive**
  4. **Default: non-sensitive** — observations with no markers in any `contents[]` entry are visible to all roles with `graph:observations:view`
- **Permission failure behavior: strict 403** (not silent omission) — locked across all docs

### Auth for Read Operations
- New `authorizeGraphRead(context)` method in MemoryManager
- Checks `graph:view` (or legacy `graph:read`, `graph:write`, `*`) for topology access
- Checks `graph:observations:view` when observations requested
- API key: requires relevant scope. Empty scopes: passthrough if `ALLOW_LEGACY_GRAPH_MUTATIONS=1`
- JWT: admin/owner → full access; member → topology + observations (no sensitive); viewer → topology only
- Dev: passthrough (all permissions)

### ETag Strategy
- Compute SHA-256 of canonical response fields: sorted node `{name, entityType, observationCount}` tuples + sorted link `{source, target, relationType}` tuples + `max(updated_at)` across all included rows
- **Policy fingerprint**: include caller's effective sorted permission set (e.g., `graph:view,graph:observations:view`) in hash input. Prevents cross-role cache leakage (admin and viewer get different ETags for same data).
- Cache in memory with 30s TTL (avoid recomputing on every request)
- Return as `ETag` header; honor `If-None-Match` → 304
- Hash changes when any user-visible field changes OR caller's permissions differ

---

## BV-S0: Build Verification Gate
- **Type:** Pre-Phase Gate
- **Risk:** Low
- **Phase:** P0
- **Team:** All

### Description
Verify the Vue UI project builds and type-checks cleanly before any brain-viz work begins. This catches pre-existing issues early.

### Acceptance Criteria
- [ ] `cd ui/vue-ui && npm ci` succeeds
- [ ] `cd ui/vue-ui && npm run build` succeeds with zero errors
- [ ] `cd ui/vue-ui && npm run type-check` succeeds with zero errors
- [ ] If any fail, fix pre-existing issues before proceeding

### Files
- reads: `ui/vue-ui/package.json`, `ui/vue-ui/tsconfig.json`

### Verify
```bash
cd ui/vue-ui && npm ci && npm run build && npm run type-check
```

### Status: **PENDING**

---

## BV-S1: Graph Export API
- **Type:** Core (backend)
- **Risk:** Medium
- **Phase:** P1
- **Team:** API
- **Blocked-by:** BV-S0

### Description
Add `GET /api/graph-export` endpoint to the neural MCP server (port 6174). Paginated, tenant-isolated, scope-checked, audit-logged. Returns entities as nodes (keyed by `name`), relations as links (source/target are entity names), optionally observations. Cursor-based pagination with content-hash ETag support.

### Acceptance Criteria
- [ ] `GET /api/graph-export` registered in `unified-neural-mcp-server.ts`
- [ ] Query params: `cursor` (opaque string), `limit` (default 200, max 1000), `includeObservations` (boolean, default **false**), `updatedSince` (ISO timestamp, optional), `entityName` (string, optional — filters observations to single entity when combined with `includeObservations=true`)
- [ ] Response shape: `{ nodes: [], links: [], observations?: [], nextCursor: string|null, totals: { nodes, links, observations }, generatedAt: string }`
- [ ] Node shape: `{ name, entityType, observationCount, id, createdAt }`
- [ ] Link shape: `{ source: entityName, target: entityName, relationType }`
- [ ] Observation shape: `{ entityName, contents: string[], createdAt }` — `contents` is always a `string[]` array matching DB schema
- [ ] When `entityName` is set: response is observations-only `{ observations, totals: { observations }, generatedAt }` — nodes/links omitted (client has them from initial fetch)
- [ ] Relations read from `shared_memory` where `memory_type = 'relation'`, using `json_extract(content, '$.from')` as source and `json_extract(content, '$.to')` as target
- [ ] Tenant isolation: queries scoped by `context.tenantId` from `TenantRequest.requestContext` — NEVER from query params
- [ ] Auth: new `authorizeGraphRead(context)` method in MemoryManager (role/scope-aware):
  - Checks `graph:view` (or legacy `graph:read`, `graph:write`, `*`) for topology access
  - Checks `graph:observations:view` when `includeObservations=true` — 403 if missing
  - `graph:sensitive:view` required for agent-internal/system observations — filtered out otherwise
  - API key: requires relevant scope. Empty scopes: passthrough if `ALLOW_LEGACY_GRAPH_MUTATIONS=1`
  - JWT: admin/owner → full (incl. sensitive); member → topology + observations (no sensitive); viewer → topology only
  - Dev: passthrough (all permissions)
- [ ] Server-side sensitivity classification (deterministic, 4-step). `contents` is `string[]` — evaluate ALL entries; any match → entire observation is sensitive:
  1. `messageType` in (`system`, `internal`, `coordination`) → sensitive
  2. Entity metadata `sensitive: true` → sensitive
  3. Any `contents[]` entry prefix `[SYSTEM]`/`[INTERNAL]` (case-insensitive, leading-whitespace-trimmed) → sensitive
  4. Default: **non-sensitive** (visible with `graph:observations:view`)
- [ ] Sensitive observations excluded from response unless caller has `graph:sensitive:view`
- [ ] `includeObservations=true` without `graph:observations:view` → **strict 403** (not silent omission)
- [ ] Rate limiting: inherits `rateLimitMiddleware` (100 req/min)
- [ ] Audit: calls `memoryManager.auditLog('graph_export', ...)` on each invocation
- [ ] Response size cap: `limit` clamped to 1000
- [ ] ETag: SHA-256 of canonical response fields + caller's sorted effective permission set (policy fingerprint). Prevents cross-role cache leakage. Cached 30s. Honor `If-None-Match` → 304
- [ ] Contract test: auth required (401 without token)
- [ ] Contract test: `authorizeGraphRead` — admin sees all, member sees non-sensitive, viewer sees topology only
- [ ] Contract test: `graph:observations:view` denied → `includeObservations=true` returns 403
- [ ] Contract test: sensitive observations excluded for member role (all 3 sensitivity markers tested: messageType, metadata flag, content prefix)
- [ ] Contract test: observations with no sensitivity markers default to non-sensitive (visible to member)
- [ ] Contract test: pagination (cursor returns next page)
- [ ] Contract test: tenant isolation (tenant A cannot see tenant B data)
- [ ] Contract test: full-mode response shape (node keyed by name, link source/target match)
- [ ] Contract test: entityName-mode response shape (observations-only, no nodes/links)
- [ ] Contract test: ETag differs for same data with different roles (policy fingerprint)
- [ ] Contract test: ETag / 304 behavior (same data + same role → same ETag → 304)
- [ ] Contract test: multi-item observation classification — observation with `contents: ["normal text", "[SYSTEM] internal note"]` classified as sensitive (any entry match)
- [ ] Contract test: case-variant prefix — `[system] msg` and `  [INTERNAL] msg` (with leading whitespace) both classified as sensitive

### Files
- touches: `src/unified-neural-mcp-server.ts` (add endpoint ~line 545)
- touches: `src/unified-server/memory/index.ts` (add `authorizeGraphRead()` + `getGraphExport()`)
- creates: `tests/contract-graph-export.test.ts`

### Verify
```bash
npx vitest run tests/contract-graph-export.test.ts
curl -H "X-API-Key: $API_KEY" http://localhost:6174/api/graph-export | jq '.totals'
```

### Status: **PENDING**

---

## BV-S2: Vue Brain Route + Base Graph
- **Type:** Core (frontend)
- **Risk:** Medium
- **Phase:** P1
- **Team:** UI
- **Blocked-by:** BV-S0 (uses mock data until S1 lands)

### Description
Install 3D dependencies, add `/brain` route, create BrainView page + BrainGraph component + brain Pinia store. Render entities as color-coded spheres and relations as curved links via ForceGraph3D. Dark background with bloom post-processing. OrbitControls camera. Fetch with `includeObservations=false` by default (lightweight).

### Acceptance Criteria
- [ ] `npm install 3d-force-graph three @types/three` in `ui/vue-ui/`
- [ ] `/brain` route added to `src/router/index.ts`
- [ ] `BrainView.vue` page component created in `src/views/`
- [ ] `BrainGraph.vue` component created in `src/components/`
- [ ] Navigation link to `/brain` added to Dashboard tab bar or sidebar
- [ ] ForceGraph3D renders in a full-viewport container (minus nav)
- [ ] ForceGraph3D `nodeId` accessor set to `'name'` (matching link source/target contract)
- [ ] Pinia store `src/stores/brain.ts` manages graph state: `{ nodes, links, loading, error, expandedEntityId }`
- [ ] Store action `fetchGraph()` calls `/api/graph-export` (no `includeObservations`) with fallback to mock data
- [ ] Vite proxy updated: `/api/graph-export` → `http://localhost:6174` (before `/api` catch-all)
- [ ] Entity type → color mapping: `project=#06b6d4`, `person=#f97316`, `feature=#10b981`, `tool=#8b5cf6`, `concept=#ec4899`, default=white
- [ ] Observation count → node sphere radius (min 3, max 12, scaled)
- [ ] Relations rendered as curved links (`linkCurvature: 0.25`)
- [ ] Dark background (`#0a0a0a`)
- [ ] UnrealBloomPass post-processing (strength ~1.5, radius ~0.4, threshold ~0.1)
- [ ] OrbitControls enabled (rotate, zoom, pan)
- [ ] Responsive: graph resizes on window resize
- [ ] Component cleanup: dispose Three.js resources on `onBeforeUnmount`

### Files
- touches: `ui/vue-ui/package.json` (add dependencies)
- touches: `ui/vue-ui/src/router/index.ts` (add /brain route)
- touches: `ui/vue-ui/vite.config.ts` (add graph-export proxy rule)
- creates: `ui/vue-ui/src/views/BrainView.vue`
- creates: `ui/vue-ui/src/components/BrainGraph.vue`
- creates: `ui/vue-ui/src/stores/brain.ts`
- touches: `ui/vue-ui/src/views/Dashboard.vue` (add nav link)

### Verify
```bash
cd ui/vue-ui && npm run build && npm run type-check
# Manual: open http://localhost:5176/brain — see 3D graph with colored nodes
```

### Status: **PENDING**

---

## BV-S3: Interaction Model
- **Type:** Core (frontend)
- **Risk:** Medium
- **Phase:** P2
- **Team:** UI
- **Blocked-by:** BV-S2

### Description
Click-to-expand observation satellites, hover tooltips, right-side details panel. Observations lazy-loaded per entity on click via `/api/graph-export?includeObservations=true&entityName=X` (observations-only response — no graph re-download). Camera auto-focuses. Click-away collapses.

### Acceptance Criteria
- [ ] Click entity node → lazy-fetch observations via `/api/graph-export?includeObservations=true&entityName={name}` (per-entity, not bulk)
- [ ] Observation satellites expand as small spheres orbiting the clicked node
- [ ] Satellite count capped at 8 per node; overflow indicated visually ("+N more" label)
- [ ] Satellite spheres connected to parent entity with thin lines
- [ ] Right-side details panel slides in on entity click
- [ ] Panel shows: entity name, entity type badge, creation date, full observation list (scrollable)
- [ ] Panel observation list supports 100+ observations with virtual scroll or pagination
- [ ] Hover any node → tooltip with entity name + type (CSS overlay, not Three.js sprite)
- [ ] Click background or second click on same entity → collapse satellites + hide panel
- [ ] Expanded state tracked in brain store (`expandedEntityId: string | null`)
- [ ] Camera auto-focuses on clicked entity (smooth `lookAt` transition, ~500ms)
- [ ] Panel responsive: full overlay on mobile (<768px), side panel on desktop

### Files
- touches: `ui/vue-ui/src/components/BrainGraph.vue` (click/hover handlers, satellites)
- creates: `ui/vue-ui/src/components/BrainDetailsPanel.vue`
- touches: `ui/vue-ui/src/stores/brain.ts` (expandedEntityId, selectedEntity, fetchObservations action)
- touches: `ui/vue-ui/src/views/BrainView.vue` (panel layout)

### Verify
```bash
cd ui/vue-ui && npm run build && npm run type-check
# Manual: click entity → satellites appear + panel shows observations; click away → collapse
```

### Status: **PENDING**

---

## BV-S4: Procedural Brain Shell + VFX
- **Type:** Core (frontend)
- **Risk:** High
- **Phase:** P2
- **Team:** UI
- **Blocked-by:** BV-S2

### Description
Translucent procedural brain shell (deformed icosphere with simplex noise for brain-fold topology). Fresnel/glass shader. Constrain entities within brain volume. Ambient particle cloud for "synaptic activity". Bloom refinement.

### Acceptance Criteria
- [ ] IcosahedronGeometry (detail 4) with vertex displacement via 3D simplex noise
- [ ] Noise params: frequency ~0.8, amplitude ~0.3, octaves 3 — brain-fold surface
- [ ] Custom ShaderMaterial with Fresnel effect (edge glow, center transparent)
- [ ] Shell opacity: ~0.08 base, Fresnel edge ~0.3
- [ ] Shell color: `#4488cc` cool blue-white
- [ ] `side: DoubleSide`, `transparent: true`, `depthWrite: false`
- [ ] Entity positions clamped to 85% of shell radius at their angle
- [ ] ForceGraph3D `d3AlphaDecay` tuned for settlement inside brain bounds
- [ ] 500-1000 ambient particles via InstancedMesh floating inside shell
- [ ] Particles drift with random velocity, respawn at bounds
- [ ] Particle material: additive blending, size ~0.3, opacity ~0.15
- [ ] Bloom refined: shell edges glow, nodes glow, particles subtle
- [ ] Shell logic in `BrainShell.ts`, particles in `ParticleCloud.ts`
- [ ] Shaders in `brain/shaders/fresnel.vert` + `fresnel.frag`
- [ ] Proper disposal on unmount

### Files
- creates: `ui/vue-ui/src/components/brain/BrainShell.ts`
- creates: `ui/vue-ui/src/components/brain/ParticleCloud.ts`
- creates: `ui/vue-ui/src/components/brain/shaders/fresnel.vert`
- creates: `ui/vue-ui/src/components/brain/shaders/fresnel.frag`
- touches: `ui/vue-ui/src/components/BrainGraph.vue`
- touches: `ui/vue-ui/src/stores/brain.ts`

### Verify
```bash
cd ui/vue-ui && npm run build && npm run type-check
# Manual: /brain shows translucent brain shell with nodes inside, particles floating, bloom glow
```

### Status: **PENDING**

---

## BV-S5: Performance + Polish
- **Type:** Finalize
- **Risk:** Medium
- **Phase:** P3
- **Team:** Perf
- **Blocked-by:** BV-S1, BV-S2, BV-S3, BV-S4

### Description
Performance optimization and production readiness. InstancedMesh for satellites, force simulation freeze, LOD tiers, responsive layout, Docker build verification, bundle chunking.

### Acceptance Criteria
- [ ] InstancedMesh for observation satellites (not individual meshes)
- [ ] InstancedMesh confirmed for particle cloud
- [ ] `warmupTicks: 100`, `cooldownTicks: 0` — run 100 ticks then freeze
- [ ] `cooldownTime: 5000` — auto-freeze after 5s
- [ ] LOD tier 1 (camera > 500): hide satellites, reduce node detail
- [ ] LOD tier 2 (camera > 1000): hide particles, simplify links
- [ ] Dev-only FPS counter (togglable via store flag)
- [ ] 500+ entities: 30fps minimum on mid-range GPU
- [ ] 1000+ entities: 15fps minimum with LOD
- [ ] Responsive: fills available space, no layout break on resize
- [ ] Touch controls: pinch zoom, drag rotate
- [ ] Docker: `cd ui/vue-ui && npm run build` succeeds (standalone Dockerfile build)
- [ ] Dockerfile: parameterize upstream hosts via `ARG API_UPSTREAM=neural-ai-platform:3000`, `ARG MCP_UPSTREAM=neural-ai-platform:5174`, `ARG WS_UPSTREAM=neural-ai-platform:3001`
- [ ] Nginx config uses `$API_UPSTREAM`, `$MCP_UPSTREAM`, `$WS_UPSTREAM` via envsubst or ARG substitution
- [ ] Add `location /api/graph-export` block proxying to `$MCP_UPSTREAM`
- [ ] `docker-compose.yml`: add `build.args: MCP_UPSTREAM=neural-ai-server:5174, API_UPSTREAM=neural-ai-server:3000, WS_UPSTREAM=neural-ai-server:3001`
- [ ] `docker/docker-compose.simple.yml`: uses defaults (neural-ai-platform) — no changes needed
- [ ] Both stacks build and run correctly
- [ ] No console errors/warnings in production build
- [ ] three.js + 3d-force-graph in separate manual chunk (not in vendor)

### Files
- touches: `ui/vue-ui/src/components/BrainGraph.vue` (LOD, warmup/cooldown, stats)
- touches: `ui/vue-ui/src/components/brain/ParticleCloud.ts` (LOD visibility)
- touches: `ui/vue-ui/vite.config.ts` (manual chunk for three.js)
- touches: `ui/vue-ui/Dockerfile` (verify build + nginx upstream)

### Verify
```bash
cd ui/vue-ui && npm run build && npm run type-check
# Standalone Dockerfile: docker build -t neural-brain-viz ui/vue-ui/
# Manual: /brain with 500+ entities at 30fps+; zoom out → LOD degrades
```

### Status: **PENDING**

---

## Summary

| Task | Phase | Risk | Team | Description | Blocked By |
|------|-------|------|------|-------------|------------|
| BV-S0 | P0 | Low | All | Build verification gate (npm ci + build + type-check) | — |
| BV-S1 | P1 | Medium | API | Graph Export API (6174) + authorizeGraphRead + contract tests | BV-S0 |
| BV-S2 | P1 | Medium | UI | Vue /brain route + ForceGraph3D + Vite proxy fix | BV-S0 |
| BV-S3 | P2 | Medium | UI | Click interactions, lazy-load observations, details panel | BV-S2 |
| BV-S4 | P2 | High | UI | Procedural brain shell, Fresnel shader, particle cloud | BV-S2 |
| BV-S5 | P3 | Medium | Perf | InstancedMesh, LOD, simulation freeze, Docker verify | BV-S1-S4 |

## Gate
This plan must be reviewed and approved by codex before any implementation begins.
