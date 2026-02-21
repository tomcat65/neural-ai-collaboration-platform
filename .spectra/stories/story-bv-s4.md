# BV-S4: Procedural Brain Shell + VFX

## Type: Core (frontend)
## Risk: High
## Phase: P2
## Team: UI
## Blocked-by: BV-S2

## Description
Translucent procedural brain shell (deformed icosphere with simplex noise for brain-fold topology). Fresnel/glass shader. Constrain entities within brain volume. Ambient particle cloud for "synaptic activity". Bloom refinement.

## Acceptance Criteria
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

## Files
- creates: `ui/vue-ui/src/components/brain/BrainShell.ts`
- creates: `ui/vue-ui/src/components/brain/ParticleCloud.ts`
- creates: `ui/vue-ui/src/components/brain/shaders/fresnel.vert`
- creates: `ui/vue-ui/src/components/brain/shaders/fresnel.frag`
- touches: `ui/vue-ui/src/components/BrainGraph.vue`
- touches: `ui/vue-ui/src/stores/brain.ts`

## Wiring Proof
- Build: `cd ui/vue-ui && npm run build && npm run type-check`
- Manual: /brain shows translucent brain shell, nodes inside, particles floating, bloom glow

## Status: **PENDING**
