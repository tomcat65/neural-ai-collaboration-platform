import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface GraphNode {
  name: string
  entityType: string
  observationCount: number
  id: string
  createdAt: string
}

export interface GraphLink {
  source: string
  target: string
  relationType: string
}

export interface Observation {
  entityName: string
  contents: string[]
  createdAt?: string
}

const MOCK_NODES: GraphNode[] = [
  { name: 'neural-mcp', entityType: 'project', observationCount: 12, id: '1', createdAt: '2026-01-15T10:00:00Z' },
  { name: 'tommy', entityType: 'person', observationCount: 8, id: '2', createdAt: '2026-01-15T10:01:00Z' },
  { name: 'claude-code', entityType: 'tool', observationCount: 15, id: '3', createdAt: '2026-01-15T10:02:00Z' },
  { name: 'brain-viz', entityType: 'feature', observationCount: 6, id: '4', createdAt: '2026-01-20T09:00:00Z' },
  { name: 'knowledge-graph', entityType: 'concept', observationCount: 10, id: '5', createdAt: '2026-01-18T14:00:00Z' },
  { name: 'spectra', entityType: 'tool', observationCount: 4, id: '6', createdAt: '2026-02-01T08:00:00Z' },
  { name: 'vue-dashboard', entityType: 'project', observationCount: 9, id: '7', createdAt: '2026-01-16T11:00:00Z' },
  { name: 'codex', entityType: 'tool', observationCount: 7, id: '8', createdAt: '2026-01-22T15:00:00Z' },
  { name: 'multi-tenant', entityType: 'feature', observationCount: 5, id: '9', createdAt: '2026-02-05T12:00:00Z' },
  { name: 'three-js', entityType: 'tool', observationCount: 3, id: '10', createdAt: '2026-02-10T09:30:00Z' }
]

const MOCK_LINKS: GraphLink[] = [
  { source: 'tommy', target: 'neural-mcp', relationType: 'owns' },
  { source: 'claude-code', target: 'neural-mcp', relationType: 'contributes_to' },
  { source: 'brain-viz', target: 'neural-mcp', relationType: 'part_of' },
  { source: 'knowledge-graph', target: 'brain-viz', relationType: 'enables' },
  { source: 'spectra', target: 'neural-mcp', relationType: 'manages' },
  { source: 'vue-dashboard', target: 'brain-viz', relationType: 'implements' },
  { source: 'codex', target: 'spectra', relationType: 'reviews_for' },
  { source: 'three-js', target: 'brain-viz', relationType: 'powers' }
]

// Prefixes that indicate test/artifact entities to filter out
const TEST_PREFIXES = [
  '_contract_test_',
  '_session_test_',
  'test_entity_',
  'prov_rel_',
  'cascade_test_',
  'cascade_target_'
]

function isTestEntity(name: string | undefined): boolean {
  if (!name) return true // nameless entities are noise — filter them out
  const lower = name.toLowerCase()
  return TEST_PREFIXES.some(prefix => lower.startsWith(prefix))
}

/** Deduplicate nodes by name (case-insensitive), keeping highest observationCount */
function deduplicateNodes(nodes: GraphNode[]): GraphNode[] {
  const best = new Map<string, GraphNode>()
  for (const node of nodes) {
    const key = node.name.toLowerCase()
    const existing = best.get(key)
    if (!existing || (node.observationCount || 0) > (existing.observationCount || 0)) {
      best.set(key, node)
    }
  }
  return Array.from(best.values())
}

export const useBrainStore = defineStore('brain', () => {
  // Raw unfiltered data from API
  const rawNodes = ref<GraphNode[]>([])
  const rawLinks = ref<GraphLink[]>([])

  // Filter controls
  const showZeroObs = ref(false)

  // Filtered + deduplicated nodes
  const nodes = computed<GraphNode[]>(() => {
    let filtered = rawNodes.value.filter(n => !isTestEntity(n.name))
    filtered = deduplicateNodes(filtered)
    if (!showZeroObs.value) {
      filtered = filtered.filter(n => (n.observationCount || 0) > 0)
    }
    return filtered
  })

  // Filtered links — only keep links whose source+target survived filtering
  // Use case-insensitive matching to align with case-insensitive deduplication
  const links = computed<GraphLink[]>(() => {
    const validNames = new Set(nodes.value.map(n => n.name.toLowerCase()))
    return rawLinks.value.filter(l => {
      const src = typeof l.source === 'string' ? l.source : (l.source as any)?.name ?? ''
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any)?.name ?? ''
      if (!src || !tgt) return false
      return validNames.has(src.toLowerCase()) && validNames.has(tgt.toLowerCase())
    })
  })

  const loading = ref(false)
  const error = ref<string | null>(null)
  const expandedEntityId = ref<string | null>(null)
  const selectedEntity = ref<GraphNode | null>(null)
  const observations = ref<Observation[]>([])
  const observationsLoading = ref(false)
  const showFps = ref(false)

  // Cache: entityName -> Observation[]
  const observationsCache = new Map<string, Observation[]>()

  const fetchGraph = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/graph-export')

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON')
      }

      const data = await response.json()
      rawNodes.value = data.nodes ?? []
      rawLinks.value = data.links ?? []
    } catch (err) {
      console.warn('Graph API unavailable, using mock data:', err)
      rawNodes.value = MOCK_NODES
      rawLinks.value = MOCK_LINKS
    } finally {
      loading.value = false
    }
  }

  const fetchObservations = async (entityName: string) => {
    // Check cache first
    const cached = observationsCache.get(entityName)
    if (cached) {
      observations.value = cached
      return
    }

    observationsLoading.value = true
    try {
      const response = await fetch(
        `/api/graph-export?includeObservations=true&entityName=${encodeURIComponent(entityName)}`
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const obs: Observation[] = data.observations ?? []
      observationsCache.set(entityName, obs)
      observations.value = obs
    } catch (err) {
      console.warn('Observations API unavailable, using mock data:', err)
      // Mock observations for dev/demo
      const mockObs: Observation[] = Array.from(
        { length: Math.min(12, Math.max(1, Math.floor(Math.random() * 15))) },
        (_, i) => ({
          entityName,
          contents: [`Observation ${i + 1} for ${entityName}`],
          createdAt: new Date(Date.now() - i * 86400000).toISOString()
        })
      )
      observationsCache.set(entityName, mockObs)
      observations.value = mockObs
    } finally {
      observationsLoading.value = false
    }
  }

  const selectEntity = (node: GraphNode | null) => {
    if (!node || expandedEntityId.value === node.name) {
      // Collapse: click same entity or click background
      expandedEntityId.value = null
      selectedEntity.value = null
      observations.value = []
      return
    }

    expandedEntityId.value = node.name
    selectedEntity.value = node
    fetchObservations(node.name)
  }

  const clearSelection = () => {
    expandedEntityId.value = null
    selectedEntity.value = null
    observations.value = []
  }

  return {
    rawNodes,
    rawLinks,
    nodes,
    links,
    showZeroObs,
    loading,
    error,
    expandedEntityId,
    selectedEntity,
    observations,
    observationsLoading,
    showFps,
    fetchGraph,
    fetchObservations,
    selectEntity,
    clearSelection
  }
})
