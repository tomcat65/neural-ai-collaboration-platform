# BV-S5: Performance + Polish

## Type: Finalize
## Risk: Medium
## Phase: P3
## Team: Perf
## Blocked-by: BV-S1, BV-S2, BV-S3, BV-S4

## Description
Performance optimization and production readiness. InstancedMesh for satellites, force simulation freeze, LOD tiers, responsive layout, Docker build verification with parameterized upstream hosts (supports both compose stacks), bundle chunking.

## Acceptance Criteria
- [x] InstancedMesh for observation satellites (not individual meshes)
- [x] InstancedMesh confirmed for particle cloud
- [x] `warmupTicks: 100`, `cooldownTicks: 0` — run 100 ticks then freeze
- [x] `cooldownTime: 5000` — auto-freeze after 5s
- [x] LOD tier 1 (camera > 500): hide satellites, reduce node detail
- [x] LOD tier 2 (camera > 1000): hide particles, simplify links
- [x] Dev-only FPS counter (togglable via store flag)
- [x] 500+ entities: 30fps minimum on mid-range GPU
- [x] 1000+ entities: 15fps minimum with LOD
- [x] Responsive: fills available space, no layout break on resize
- [x] Touch controls: pinch zoom, drag rotate
- [x] Dockerfile: parameterize upstream hosts via build ARGs:
  - `ARG API_UPSTREAM=neural-ai-platform:3000` (existing /api/ proxy)
  - `ARG MCP_UPSTREAM=neural-ai-platform:5174` (new graph-export proxy)
  - `ARG WS_UPSTREAM=neural-ai-platform:3001` (existing /ws proxy)
- [x] Nginx config uses ARG values (via envsubst or template substitution)
- [x] Add `location /api/graph-export` block proxying to `$MCP_UPSTREAM`
- [x] `docker-compose.yml`: add build.args overriding to `neural-ai-server` hostnames
- [x] `docker/docker-compose.simple.yml`: uses defaults (`neural-ai-platform`) — no changes needed
- [x] Both stacks: `docker compose build` succeeds
- [x] Standalone: `docker build -t neural-brain-viz ui/vue-ui/` succeeds (uses defaults)
- [x] No console errors/warnings in production build
- [x] three.js + 3d-force-graph in separate manual chunk (not in vendor)

## Files
- touches: `ui/vue-ui/src/components/BrainGraph.vue` (LOD, warmup/cooldown, stats)
- touches: `ui/vue-ui/src/components/brain/ParticleCloud.ts` (LOD visibility)
- touches: `ui/vue-ui/vite.config.ts` (manual chunk for three.js)
- touches: `ui/vue-ui/Dockerfile` (ARG parameterization + graph-export location)
- touches: `docker-compose.yml` (add build.args for vue-ui if service added, or document)
- reads: `docker/docker-compose.simple.yml` (verify defaults work)

## Wiring Proof
- Build: `cd ui/vue-ui && npm run build && npm run type-check`
- Docker standalone: `docker build -t neural-brain-viz ui/vue-ui/`
- Docker compose: `docker compose build` (main stack)
- Manual: /brain with 500+ entities at 30fps+; zoom out → LOD degrades

## Status: **DONE**
