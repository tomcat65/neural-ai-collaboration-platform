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

// Track satellite objects for cleanup
const satelliteGroups = new Map<string, THREE.Group>()

// Brain shell + particle cloud (S4)
let brainShell: BrainShell | null = null
let particleCloud: ParticleCloud | null = null
let particleAnimId: number | null = null
let lastFrameTime = 0

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

  // Create satellite spheres
  const satGeom = new THREE.SphereGeometry(1.2, 8, 8)

  for (let i = 0; i < maxSatellites; i++) {
    const angle = (i / maxSatellites) * Math.PI * 2
    const sx = nx + Math.cos(angle) * orbitRadius
    const sy = ny + Math.sin(angle) * orbitRadius
    const sz = nz

    // Satellite sphere
    const satMat = new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color('#ffffff'), 0.3),
      transparent: true,
      opacity: 0.8
    })
    const sphere = new THREE.Mesh(satGeom, satMat)
    sphere.position.set(sx, sy, sz)
    group.add(sphere)

    // Thin line connecting satellite to parent
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(nx, ny, nz),
      new THREE.Vector3(sx, sy, sz)
    ])
    const lineMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3
    })
    const line = new THREE.Line(lineGeom, lineMat)
    group.add(line)
  }

  // "+N more" label if overflow
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
    const sprite = new THREE.Sprite(spriteMat)
    sprite.position.set(nx, ny - orbitRadius - 5, nz)
    sprite.scale.set(16, 6, 1)
    group.add(sprite)
  }

  scene.add(group)
  satelliteGroups.set(node.name, group)
}

/**
 * Remove satellite objects for a given entity.
 */
function removeSatellites(entityName: string) {
  const group = satelliteGroups.get(entityName)
  if (!group || !graph) return

  const scene = graph.scene()
  // Dispose geometries and materials
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
    if (child instanceof THREE.Line) {
      child.geometry?.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
    if (child instanceof THREE.Sprite) {
      if (child.material instanceof THREE.SpriteMaterial && child.material.map) {
        child.material.map.dispose()
      }
      child.material.dispose()
    }
  })
  scene.remove(group)
  satelliteGroups.delete(entityName)
}

/**
 * Remove all satellite groups from the scene.
 */
function removeAllSatellites() {
  for (const name of Array.from(satelliteGroups.keys())) {
    removeSatellites(name)
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
    .d3AlphaDecay(0.02) // slower decay for better brain-bounded settlement
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

  // Start particle animation loop
  const cloud = particleCloud
  lastFrameTime = performance.now()
  function animateParticles(now: number) {
    const delta = Math.min((now - lastFrameTime) / 1000, 0.1) // cap delta to avoid big jumps
    lastFrameTime = now
    cloud.update(delta)
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

  // Interaction: background click → collapse
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
</style>
