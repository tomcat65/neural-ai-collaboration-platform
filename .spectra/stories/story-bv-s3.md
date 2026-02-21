# BV-S3: Interaction Model

## Type: Core (frontend)
## Risk: Medium
## Phase: P2
## Team: UI
## Blocked-by: BV-S2

## Description
Click-to-expand observation satellites, hover tooltips, right-side details panel. Observations lazy-loaded per entity on click via `/api/graph-export?includeObservations=true&entityName={name}` — returns observations-only payload (no nodes/links, since client already has the graph). Camera auto-focuses. Click-away collapses.

## Acceptance Criteria
- [ ] Click entity → lazy-fetch observations via `/api/graph-export?includeObservations=true&entityName={name}`
- [ ] Response is observations-only `{ observations, totals, generatedAt }` — no graph re-download
- [ ] Observation satellites expand as small spheres orbiting the clicked node
- [ ] Satellites capped at 8 per node; "+N more" label for overflow
- [ ] Thin lines connect satellites to parent entity
- [ ] Right-side details panel slides in on entity click
- [ ] Panel: entity name, type badge, creation date, scrollable observation list
- [ ] Panel handles 100+ observations (virtual scroll or paginate)
- [ ] Hover node → CSS tooltip overlay with entity name + type
- [ ] Click background or same entity again → collapse satellites + hide panel
- [ ] `expandedEntityId` tracked in brain store
- [ ] Store `fetchObservations(entityName)` action calls API with `entityName` filter, caches result
- [ ] Camera smooth `lookAt` transition to clicked entity (~500ms)
- [ ] Panel responsive: full overlay <768px, side panel on desktop

## Files
- touches: `ui/vue-ui/src/components/BrainGraph.vue`
- creates: `ui/vue-ui/src/components/BrainDetailsPanel.vue`
- touches: `ui/vue-ui/src/stores/brain.ts` (expandedEntityId, selectedEntity, fetchObservations)
- touches: `ui/vue-ui/src/views/BrainView.vue`

## Wiring Proof
- Build: `cd ui/vue-ui && npm run build && npm run type-check`
- Manual: click entity → satellites + panel (no full graph refetch in network tab); click away → collapse

## Status: **PENDING**
