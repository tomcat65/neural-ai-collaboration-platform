<template>
  <div ref="containerRef" class="brain-graph-container">
    <!-- CSS Tooltip overlay -->
    <div
      v-if="hoveredNode"
      class="node-tooltip"
      :style="tooltipStyle"
    >
      <span class="tooltip-name">{{ hoveredNode.name }}</span>
      <span class="tooltip-type" :style="{ color: getNodeColor(hoveredNode) }">
        {{ hoveredNode.entityType }}
      </span>
    </div>
    <!-- Dev-only FPS counter -->
    <div v-if="brainStore.showFps" class="fps-counter">{{ fpsDisplay }} FPS</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import type { ForceGraph3DInstance } from '3d-force-graph'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { useBrainStore } from '@/stores/brain'
import type { GraphNode } from '@/stores/brain'
import { BrainShell } from './brain/BrainShell'
import { ParticleCloud } from './brain/ParticleCloud'

const emit = defineEmits<{
  (e: 'nodeClick', node: GraphNode): void
}>()

const brainStore = useBrainStore()
const containerRef = ref<HTMLDivElement | null>(null)

let graph: ForceGraph3DInstance | null = null

// Hover tooltip state
const hoveredNode = ref<GraphNode | null>(null)
const tooltipStyle = reactive({
  left: '0px',
  top: '0px'
})

// FPS counter state
const fpsDisplay = ref(0)
let fpsFrameCount = 0
let fpsLastTime = 0

// Track satellite InstancedMesh + group for cleanup
interface SatelliteEntry {
  group: THREE.Group
  instancedMesh: THREE.InstancedMesh
  lineSegments: THREE.LineSegments
  overflowSprite: THREE.Sprite | null
}
const satelliteEntries = new Map<string, SatelliteEntry>()

// Brain shell + particle cloud (S4)
let brainShell: BrainShell | null = null
let particleCloud: ParticleCloud | null = null
let particleAnimId: number | null = null
let lastFrameTime = 0

// LOD state
let currentLodTier = 0 // 0 = full detail, 1 = medium, 2 = low

const TYPE_COLORS: Record<string, string> = {
  project: '#06b6d4',
  person: '#f97316',
  feature: '#10b981',
  tool: '#8b5cf6',
  concept: '#ec4899'
}

function getNodeColor(node: GraphNode): string {
  return TYPE_COLORS[node.entityType] ?? '#ffffff'
}

function getNodeRadius(node: GraphNode): number {
  return Math.min(12, Math.max(3, Math.sqrt(node.observationCount) * 2))
}

function handleResize() {
  if (!graph || !containerRef.value) return
  graph.width(containerRef.value.clientWidth)
  graph.height(containerRef.value.clientHeight)
}

/**
 * Smoothly move the camera to look at the clicked node.
 * Uses cameraPosition with a transition duration of ~500ms.
 */
function animateCameraToNode(node: GraphNode & { x?: number; y?: number; z?: number }) {
  if (!graph) return
  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const nz = node.z ?? 0

  // Position camera at a distance from the node
  const distance = 120
  graph.cameraPosition(
    { x: nx, y: ny, z: nz + distance }, // camera position
    { x: nx, y: ny, z: nz },            // lookAt
    500                                   // transition ms
  )
}

/**
 * Create satellite spheres orbiting a given node to represent observations.
 * Uses InstancedMesh for all satellites and LineSegments for connectors.
 * Capped at 8 visible satellites; overflow shown as "+N more" sprite.
 */
function createSatellites(
  node: GraphNode & { x?: number; y?: number; z?: number },
  observationCount: number
) {
  // Remove existing satellites for this node
  removeSatellites(node.name)

  if (!graph || observationCount === 0) return

  const scene = graph.scene()
  const group = new THREE.Group()
  group.userData = { entityName: node.name, isSatelliteGroup: true }

  const nx = node.x ?? 0
  const ny = node.y ?? 0
  const nz = node.z ?? 0
  const parentRadius = getNodeRadius(node)
  const orbitRadius = parentRadius + 8
  const maxSatellites = Math.min(observationCount, 8)
  const color = new THREE.Color(getNodeColor(node))

  // InstancedMesh for all satellite spheres
  const satGeom = new THREE.SphereGeometry(1.2, 8, 8)
  const satMat = new THREE.MeshBasicMaterial({
    color: color.clone().lerp(new THREE.Color('#ffffff'), 0.3),
    transparent: true,
    opacity: 0.8
  })
  const instancedSatellites = new THREE.InstancedMesh(satGeom, satMat, maxSatellites)
  const dummy = new THREE.Object3D()

  // LineSegments for all connectors (2 points per satellite)
  const linePositions = new Float32Array(maxSatellites * 6) // 2 vertices * 3 coords per satellite

  for (let i = 0; i < maxSatellites; i++) {
    const angle = (i / maxSatellites) * Math.PI * 2
    const sx = nx + Math.cos(angle) * orbitRadius
    const sy = ny + Math.sin(angle) * orbitRadius
    const sz = nz

    // Set instance matrix
    dummy.position.set(sx, sy, sz)
    dummy.updateMatrix()
    instancedSatellites.setMatrixAt(i, dummy.matrix)

    // Set line positions: from parent center to satellite position
    const base = i * 6
    linePositions[base] = nx
    linePositions[base + 1] = ny
    linePositions[base + 2] = nz
    linePositions[base + 3] = sx
    linePositions[base + 4] = sy
    linePositions[base + 5] = sz
  }

  instancedSatellites.instanceMatrix.needsUpdate = true
  group.add(instancedSatellites)

  // Create LineSegments for all connectors at once
  const lineGeom = new THREE.BufferGeometry()
  lineGeom.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  const lineMat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.3
  })
  const lineSegments = new THREE.LineSegments(lineGeom, lineMat)
  group.add(lineSegments)

  // "+N more" label if overflow
  let overflowSprite: THREE.Sprite | null = null
  if (observationCount > 8) {
    const overflow = observationCount - 8
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'transparent'
      ctx.fillRect(0, 0, 128, 48)
      ctx.font = 'bold 24px sans-serif'
      ctx.fillStyle = '#9ca3af'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`+${overflow} more`, 64, 24)
    }
    const texture = new THREE.CanvasTexture(canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true })
    overflowSprite = new THREE.Sprite(spriteMat)
    overflowSprite.position.set(nx, ny - orbitRadius - 5, nz)
    overflowSprite.scale.set(16, 6, 1)
    group.add(overflowSprite)
  }

  scene.add(group)
  satelliteEntries.set(node.name, {
    group,
    instancedMesh: instancedSatellites,
    lineSegments,
    overflowSprite
  })
}

/**
 * Remove satellite objects for a given entity.
 */
function removeSatellites(entityName: string) {
  const entry = satelliteEntries.get(entityName)
  if (!entry || !graph) return

  const scene = graph.scene()

  // Dispose instanced mesh
  entry.instancedMesh.geometry.dispose()
  if (entry.instancedMesh.material instanceof THREE.Material) {
    entry.instancedMesh.material.dispose()
  }

  // Dispose line segments
  entry.lineSegments.geometry.dispose()
  if (entry.lineSegments.material instanceof THREE.Material) {
    entry.lineSegments.material.dispose()
  }

  // Dispose overflow sprite if present
  if (entry.overflowSprite) {
    if (entry.overflowSprite.material instanceof THREE.SpriteMaterial && entry.overflowSprite.material.map) {
      entry.overflowSprite.material.map.dispose()
    }
    entry.overflowSprite.material.dispose()
  }

  scene.remove(entry.group)
  satelliteEntries.delete(entityName)
}

/**
 * Remove all satellite groups from the scene.
 */
function removeAllSatellites() {
  for (const name of Array.from(satelliteEntries.keys())) {
    removeSatellites(name)
  }
}

/**
 * LOD (Level of Detail) system.
 * Checks camera distance from origin and toggles visibility of scene elements.
 * Tier 0: full detail (camera <= 500)
 * Tier 1: hide satellites, reduce node detail (camera > 500)
 * Tier 2: hide particles, simplify links (camera > 1000)
 */
function updateLOD() {
  if (!graph) return

  const camera = graph.camera()
  const cameraDistance = camera.position.length()

  let newTier = 0
  if (cameraDistance > 1000) {
    newTier = 2
  } else if (cameraDistance > 500) {
    newTier = 1
  }

  if (newTier === currentLodTier) return
  currentLodTier = newTier

  // Tier 1+: hide satellites
  for (const entry of satelliteEntries.values()) {
    entry.group.visible = newTier < 1
  }

  // Tier 2: hide particles
  if (particleCloud) {
    particleCloud.setVisible(newTier < 2)
  }

  // Tier 2: simplify links (reduce opacity)
  if (graph) {
    if (newTier >= 2) {
      graph.linkOpacity(0.05)
      graph.linkWidth(0.2)
    } else {
      graph.linkOpacity(0.2)
      graph.linkWidth(0.5)
    }
  }
}

/**
 * Handle mouse move for tooltip positioning.
 */
function handleMouseMove(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  tooltipStyle.left = `${event.clientX - rect.left + 12}px`
  tooltipStyle.top = `${event.clientY - rect.top - 10}px`
}

onMounted(async () => {
  if (!containerRef.value) return

  await brainStore.fetchGraph()

  // 3d-force-graph uses a Kapsule factory pattern at runtime: ForceGraph3D()(element)
  // but its TypeScript definitions declare it as a constructor: new ForceGraph3D(element).
  // We dynamically import and cast to work around this mismatch.
  const { default: ForceGraph3DFactory } = await import('3d-force-graph')
  const factory = ForceGraph3DFactory as unknown as (configOptions?: object) => (element: HTMLElement) => ForceGraph3DInstance

  // Create brain shell and particle cloud before graph init so we can
  // reference shellRadius during force layout configuration.
  brainShell = new BrainShell({ radius: 80 })
  particleCloud = new ParticleCloud({ radius: 76 })

  graph = factory()(containerRef.value)
    .nodeId('name')
    .backgroundColor('#0a0a0a')
    .linkCurvature(0.25)
    .nodeColor((node: object) => getNodeColor(node as GraphNode))
    .nodeVal((node: object) => getNodeRadius(node as GraphNode))
    .linkColor(() => 'rgba(255, 255, 255, 0.2)')
    .linkWidth(0.5)
    .linkOpacity(0.2)
    .d3AlphaDecay(0.02) // slower decay for better brain-bounded settlement
    .warmupTicks(100)    // S5: run 100 ticks of force simulation then freeze
    .cooldownTicks(0)    // S5: freeze after warmup completes
    .cooldownTime(5000)  // S5: auto-freeze after 5 seconds max
    .graphData({
      nodes: brainStore.nodes,
      links: brainStore.links
    })

  // Constrain entity positions to 85% of shell radius on each tick
  const shell = brainShell
  graph.onEngineTick(() => {
    if (!graph || !shell) return
    const data = graph.graphData()
    for (const node of data.nodes) {
      const n = node as { x?: number; y?: number; z?: number }
      if (n.x != null && n.y != null && n.z != null) {
        const clamped = shell.clampToShell(n.x, n.y, n.z)
        n.x = clamped.x
        n.y = clamped.y
        n.z = clamped.z
      }
    }
  })

  // Add brain shell and particle cloud to the Three.js scene
  const scene = graph.scene()
  scene.add(brainShell.mesh)
  scene.add(particleCloud.mesh)

  // Start particle animation loop with LOD checks and FPS counter
  const cloud = particleCloud
  lastFrameTime = performance.now()
  fpsLastTime = performance.now()
  fpsFrameCount = 0
  function animateParticles(now: number) {
    const delta = Math.min((now - lastFrameTime) / 1000, 0.1) // cap delta to avoid big jumps
    lastFrameTime = now

    // FPS counter (update display once per second)
    fpsFrameCount++
    if (now - fpsLastTime >= 1000) {
      fpsDisplay.value = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime))
      fpsFrameCount = 0
      fpsLastTime = now
    }

    // LOD update
    updateLOD()

    // Only update particles if visible (LOD tier < 2)
    if (cloud.mesh.visible) {
      cloud.update(delta)
    }

    particleAnimId = requestAnimationFrame(animateParticles)
  }
  particleAnimId = requestAnimationFrame(animateParticles)

  // Interaction: node click
  graph.onNodeClick((node: object) => {
    const gNode = node as GraphNode & { x?: number; y?: number; z?: number }
    brainStore.selectEntity(gNode)
    if (brainStore.expandedEntityId === gNode.name) {
      // Expanding: animate camera and create satellites
      animateCameraToNode(gNode)
      // Satellites created after observations load (via watcher)
      createSatellites(gNode, gNode.observationCount || 0)
    } else {
      // Collapsing
      removeAllSatellites()
    }
    emit('nodeClick', gNode)
  })

  // Interaction: background click -> collapse
  graph.onBackgroundClick(() => {
    brainStore.clearSelection()
    removeAllSatellites()
  })

  // Interaction: hover tooltip
  graph.onNodeHover((node: object | null) => {
    hoveredNode.value = node ? (node as GraphNode) : null
    if (containerRef.value) {
      containerRef.value.style.cursor = node ? 'pointer' : 'default'
    }
  })

  // Add bloom post-processing — refined for shell edge glow, node glow, subtle particles
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(containerRef.value.clientWidth, containerRef.value.clientHeight),
    1.2,  // strength (slightly lower: shell edges + nodes glow, particles stay subtle)
    0.6,  // radius (wider spread for softer brain glow)
    0.15  // threshold (just above particle opacity so particles don't over-bloom)
  )
  graph.postProcessingComposer().addPass(bloomPass)

  // Initial size
  graph.width(containerRef.value.clientWidth)
  graph.height(containerRef.value.clientHeight)

  window.addEventListener('resize', handleResize)
  containerRef.value.addEventListener('mousemove', handleMouseMove)
})

// Watch for store data changes and update graph
watch(
  () => [brainStore.nodes, brainStore.links],
  () => {
    if (!graph) return
    graph.graphData({
      nodes: brainStore.nodes,
      links: brainStore.links
    })
  },
  { deep: true }
)

// Watch for observations loading to update satellites with real count
watch(
  () => brainStore.observations,
  (newObs) => {
    if (!brainStore.expandedEntityId || !graph) return
    // Find the expanded node to get its position
    const graphData = graph.graphData()
    const expandedNode = graphData.nodes.find(
      (n: object) => (n as GraphNode).name === brainStore.expandedEntityId
    ) as (GraphNode & { x?: number; y?: number; z?: number }) | undefined
    if (expandedNode) {
      createSatellites(expandedNode, newObs.length)
    }
  },
  { deep: true }
)

// Watch for selection cleared externally (e.g., panel close)
watch(
  () => brainStore.expandedEntityId,
  (newId) => {
    if (newId === null) {
      removeAllSatellites()
    }
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousemove', handleMouseMove)
  }
  removeAllSatellites()

  // Stop particle animation loop
  if (particleAnimId !== null) {
    cancelAnimationFrame(particleAnimId)
    particleAnimId = null
  }

  // Dispose brain shell and particle cloud
  if (brainShell) {
    brainShell.dispose()
    brainShell = null
  }
  if (particleCloud) {
    particleCloud.dispose()
    particleCloud = null
  }

  if (graph) {
    graph._destructor()
    graph = null
  }
})
</script>

<style scoped>
.brain-graph-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

/* CSS Tooltip */
.node-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 30;
  background: rgba(10, 10, 15, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}

.tooltip-name {
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
}

.tooltip-type {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

/* Dev-only FPS counter */
.fps-counter {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 40;
  background: rgba(0, 0, 0, 0.7);
  color: #00ff88;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
}
</style>
