<template>
  <div ref="containerRef" class="brain-graph-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { ForceGraph3DInstance } from '3d-force-graph'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { useBrainStore } from '@/stores/brain'
import type { GraphNode } from '@/stores/brain'

const brainStore = useBrainStore()
const containerRef = ref<HTMLDivElement | null>(null)

let graph: ForceGraph3DInstance | null = null

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

onMounted(async () => {
  if (!containerRef.value) return

  await brainStore.fetchGraph()

  // 3d-force-graph uses a Kapsule factory pattern at runtime: ForceGraph3D()(element)
  // but its TypeScript definitions declare it as a constructor: new ForceGraph3D(element).
  // We dynamically import and cast to work around this mismatch.
  const { default: ForceGraph3DFactory } = await import('3d-force-graph')
  const factory = ForceGraph3DFactory as unknown as (configOptions?: object) => (element: HTMLElement) => ForceGraph3DInstance
  graph = factory()(containerRef.value)
    .nodeId('name')
    .backgroundColor('#0a0a0a')
    .linkCurvature(0.25)
    .nodeColor((node: object) => getNodeColor(node as GraphNode))
    .nodeVal((node: object) => getNodeRadius(node as GraphNode))
    .linkColor(() => 'rgba(255, 255, 255, 0.2)')
    .linkWidth(0.5)
    .graphData({
      nodes: brainStore.nodes,
      links: brainStore.links
    })

  // Add bloom post-processing
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(containerRef.value.clientWidth, containerRef.value.clientHeight),
    1.5,  // strength
    0.4,  // radius
    0.1   // threshold
  )
  graph.postProcessingComposer().addPass(bloomPass)

  // Initial size
  graph.width(containerRef.value.clientWidth)
  graph.height(containerRef.value.clientHeight)

  window.addEventListener('resize', handleResize)
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

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
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
}
</style>
