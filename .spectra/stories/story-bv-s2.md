# BV-S2: Vue Brain Route + Base Graph

## Type: Core (frontend)
## Risk: Medium
## Phase: P1
## Team: UI
## Blocked-by: BV-S0 (uses mock data until S1 lands)

## Description
Install 3D dependencies, add `/brain` route, create BrainView page + BrainGraph component + brain Pinia store. Update Vite proxy to route `/api/graph-export` to port 6174. Render entities as color-coded spheres and relations as curved links via ForceGraph3D. Nodes keyed by `name`. Dark background, bloom, OrbitControls. Fetch with `includeObservations=false` (lightweight).

## Acceptance Criteria
- [ ] Dependencies installed: `3d-force-graph`, `three`, `@types/three`
- [ ] `/brain` route in `src/router/index.ts` → `BrainView.vue`
- [ ] Navigation link added to existing UI (Dashboard tab bar or sidebar)
- [ ] `BrainView.vue` page with full-viewport graph container
- [ ] `BrainGraph.vue` component wrapping ForceGraph3D instance
- [ ] ForceGraph3D `nodeId` accessor set to `'name'` (matches link source/target contract)
- [ ] `src/stores/brain.ts` Pinia store: `{ nodes, links, loading, error, expandedEntityId }`
- [ ] Store `fetchGraph()` calls `/api/graph-export` (**no** `includeObservations`), falls back to mock data
- [ ] Vite proxy: `/api/graph-export` → `http://localhost:6174` rule added BEFORE `/api` catch-all
- [ ] Color map: project=`#06b6d4`, person=`#f97316`, feature=`#10b981`, tool=`#8b5cf6`, concept=`#ec4899`, default=white
- [ ] Observation count → node sphere radius (min 3, max 12, scaled)
- [ ] Links curved (`linkCurvature: 0.25`)
- [ ] Background: `#0a0a0a`
- [ ] UnrealBloomPass (strength ~1.5, radius ~0.4, threshold ~0.1)
- [ ] OrbitControls (rotate, zoom, pan)
- [ ] Responsive resize handling
- [ ] Three.js cleanup on `onBeforeUnmount`

## Files
- touches: `ui/vue-ui/package.json`
- touches: `ui/vue-ui/src/router/index.ts`
- touches: `ui/vue-ui/vite.config.ts` (add graph-export proxy rule before /api catch-all)
- creates: `ui/vue-ui/src/views/BrainView.vue`
- creates: `ui/vue-ui/src/components/BrainGraph.vue`
- creates: `ui/vue-ui/src/stores/brain.ts`
- touches: `ui/vue-ui/src/views/Dashboard.vue` (nav link)

## Wiring Proof
- Build: `cd ui/vue-ui && npm run build && npm run type-check`
- Manual: `http://localhost:5176/brain` shows 3D graph with colored nodes and curved links

## Status: **PENDING**
