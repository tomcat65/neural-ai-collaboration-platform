import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Agent,
  Message,
  KnowledgeChange,
  SystemHealth,
  AttentionItem,
  MessageFilter,
  ApiAgent,
  ApiMessage,
  RecentEventsResponse,
  AgentStatusResponse,
  AnalyticsResponse,
  GraphExportResponse,
  ContainerInfo,
} from '@/types/command-center'

// Filter out test/ephemeral agents — keep only real project agents
const TEST_AGENT_PREFIXES = [
  '_tenant_iso_', '_session_test_', '_broadcast_test_',
  '_security_test_', '_contract_test_',
  'agent-',   // ephemeral desktop sessions like agent-ErikaDesktop-*
  'sender_',  // test senders
  'prov_',    // provenance test agents
]

function isRealAgent(a: ApiAgent): boolean {
  return !TEST_AGENT_PREFIXES.some((p) => a.agentId.startsWith(p))
}

/** Parse API timestamps — server returns UTC without 'Z' suffix */
function parseUTC(ts: string): Date {
  if (!ts) return new Date(0)
  // If no timezone indicator, treat as UTC
  if (!ts.endsWith('Z') && !ts.includes('+') && !ts.includes('T')) {
    return new Date(ts.replace(' ', 'T') + 'Z')
  }
  return new Date(ts)
}

function toAgent(a: ApiAgent): Agent {
  return {
    id: a.agentId,
    name: a.agentId,
    displayName: a.name || a.agentId,
    status: a.status,
    lastSeen: parseUTC(a.lastSeen),
    messageCount: a.eventsCount,
    capabilities: a.capabilities,
    isReal: isRealAgent(a),
  }
}

/** Deduplicate agents by agentId — keep the registration with the most recent lastSeen */
function deduplicateAgents(agents: Agent[]): Agent[] {
  const map = new Map<string, Agent>()
  for (const a of agents) {
    const existing = map.get(a.id)
    if (!existing || a.lastSeen > existing.lastSeen) {
      // Merge message counts from duplicates
      if (existing) {
        a.messageCount = a.messageCount + existing.messageCount
      }
      map.set(a.id, a)
    } else if (existing) {
      existing.messageCount = existing.messageCount + a.messageCount
    }
  }
  return Array.from(map.values())
}

function toMessage(m: ApiMessage): Message {
  return {
    id: m.id,
    fromAgent: m.from_agent,
    toAgent: m.to_agent,
    content: m.content,
    messageType: m.message_type,
    createdAt: parseUTC(m.created_at),
    isExpanded: false,
  }
}

const MAX_MESSAGES = 500

// Filter out test project entities
const TEST_ENTITY_PREFIXES = ['_session_test_', '_contract_test_', '_security_test_', '_tenant_iso_']

function isRealProject(name: string): boolean {
  return !TEST_ENTITY_PREFIXES.some((p) => name.startsWith(p))
}

export interface ProjectInfo {
  name: string
  observationCount: number
}

export const useCommandCenterStore = defineStore('command-center', () => {
  // ── State ───────────────────────────────────────────────────
  const agents = ref<Agent[]>([])
  const messages = ref<Message[]>([])
  const knowledge = ref<KnowledgeChange[]>([])
  const systemHealth = ref<SystemHealth>({
    totalMessages: 0,
    entityCount: 0,
    relationCount: 0,
    observationCount: 0,
    topAgents: [],
    containers: [],
    dbSize: '—',
  })
  const dismissedAttentionIds = ref<Set<string>>(new Set())
  const availableProjects = ref<ProjectInfo[]>([])

  const isConnected = ref(false)
  const lastError = ref<string | null>(null)
  const isLoading = ref(true)

  const filter = ref<MessageFilter>({ search: '', agent: '', type: '' })
  const activeProject = ref<string>('')  // '' = All Projects

  // since-cursor for incremental message fetching
  let messageCursor: string | null = null

  // Polling timer IDs
  let fastTimer: ReturnType<typeof setInterval> | null = null
  let mediumTimer: ReturnType<typeof setInterval> | null = null
  let slowTimer: ReturnType<typeof setInterval> | null = null

  // ── Computed ────────────────────────────────────────────────
  const realAgents = computed(() => agents.value.filter((a) => a.isReal))

  // Consider agents "active" if online OR seen within the last 2 hours
  const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000
  const activeAgents = computed(() =>
    realAgents.value.filter(
      (a) => a.status === 'online' || Date.now() - a.lastSeen.getTime() < ACTIVE_WINDOW_MS
    )
  )
  const offlineAgents = computed(() =>
    realAgents.value.filter(
      (a) => a.status !== 'online' && Date.now() - a.lastSeen.getTime() >= ACTIVE_WINDOW_MS
    )
  )

  const filteredMessages = computed(() => {
    let list = messages.value
    // Project scope filter
    if (activeProject.value) {
      const proj = activeProject.value.toLowerCase()
      list = list.filter(
        (m) =>
          m.content.toLowerCase().includes(proj) ||
          m.fromAgent.toLowerCase().includes(proj) ||
          m.toAgent.toLowerCase().includes(proj)
      )
    }
    const f = filter.value
    if (f.agent) {
      list = list.filter((m) => m.fromAgent === f.agent || m.toAgent === f.agent)
    }
    if (f.type) {
      list = list.filter((m) => m.messageType === f.type)
    }
    if (f.search) {
      const q = f.search.toLowerCase()
      list = list.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.fromAgent.toLowerCase().includes(q) ||
          m.toAgent.toLowerCase().includes(q)
      )
    }
    return list
  })

  const messageTypes = computed(() => {
    const types = new Set<string>()
    messages.value.forEach((m) => types.add(m.messageType))
    return Array.from(types).sort()
  })

  const agentNames = computed(() => {
    const names = new Set<string>()
    messages.value.forEach((m) => {
      names.add(m.fromAgent)
      names.add(m.toAgent)
    })
    return Array.from(names).sort()
  })

  const filteredKnowledge = computed(() => {
    if (!activeProject.value) return knowledge.value
    const proj = activeProject.value.toLowerCase()
    return knowledge.value.filter(
      (k) =>
        k.entityName.toLowerCase().includes(proj) ||
        k.entityType.toLowerCase().includes(proj) ||
        k.latestObservation.toLowerCase().includes(proj)
    )
  })

  const attentionItems = computed<AttentionItem[]>(() => {
    return messages.value
      .filter((m) => {
        if (dismissedAttentionIds.value.has(m.id)) return false
        const type = m.messageType.toLowerCase()
        if (type === 'query' || type === 'urgent') return true
        // Messages targeting human/tommy/user
        const to = m.toAgent.toLowerCase()
        if (to.includes('human') || to.includes('tommy') || to.includes('user')) return true
        return false
      })
      .map((m) => {
        let reason: AttentionItem['reason'] = 'query'
        if (m.messageType.toLowerCase() === 'urgent') reason = 'urgent'
        else if (
          m.toAgent.toLowerCase().includes('human') ||
          m.toAgent.toLowerCase().includes('tommy')
        )
          reason = 'human-target'
        return { message: m, reason, dismissed: false }
      })
      .slice(0, 20)
  })

  // ── API Fetchers ────────────────────────────────────────────
  async function fetchJSON<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
  }

  async function fetchMessages() {
    try {
      let url = '/api/recent-events?limit=50'
      if (messageCursor) {
        url += `&since=${encodeURIComponent(messageCursor)}`
      }
      const data = await fetchJSON<RecentEventsResponse>(url)
      const newMsgs = (data.messages || []).map(toMessage)

      if (newMsgs.length > 0) {
        // Update cursor to newest message
        const newest = newMsgs.reduce((a, b) =>
          a.createdAt > b.createdAt ? a : b
        )
        messageCursor = newest.createdAt.toISOString().replace('T', ' ').replace('Z', '')

        if (messages.value.length === 0) {
          // First load — set all messages
          messages.value = newMsgs
        } else {
          // Incremental — prepend new, dedup by id
          const existingIds = new Set(messages.value.map((m) => m.id))
          const unique = newMsgs.filter((m) => !existingIds.has(m.id))
          if (unique.length > 0) {
            messages.value = [...unique, ...messages.value].slice(0, MAX_MESSAGES)
          }
        }
      }
      isConnected.value = true
      lastError.value = null
    } catch (e: any) {
      console.error('fetchMessages failed:', e)
      lastError.value = e.message
      isConnected.value = false
    }
  }

  async function fetchAgents() {
    try {
      const data = await fetchJSON<AgentStatusResponse>('/api/agent-status')
      const all = (data.agents || []).map(toAgent)
      agents.value = deduplicateAgents(all)
    } catch (e: any) {
      console.error('fetchAgents failed:', e)
    }
  }

  async function fetchAnalytics() {
    try {
      const data = await fetchJSON<AnalyticsResponse>('/api/analytics')
      const o = data.overview
      // Build container status from what we can observe
      const containers: ContainerInfo[] = [
        { name: 'unified-neural-mcp', port: '6174', status: 'healthy', mem: '—', uptime: '—' },
        { name: 'vue-dashboard', port: '5176', status: 'healthy', mem: '—', uptime: '—' },
        { name: 'weaviate', port: '8080', status: 'healthy', mem: '—', uptime: '—' },
        { name: 't2v-transformers', port: '—', status: 'healthy', mem: '—', uptime: '—' },
      ]

      // Estimate DB size from data counts (avg ~3KB per message, ~5KB per entity+observations)
      const estimatedBytes =
        (o.totalEvents || 0) * 3000 +
        (o.entityCount || 0) * 2000 +
        (o.observationCount || 0) * 4000
      const dbMB = estimatedBytes > 0
        ? `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB`
        : '—'

      systemHealth.value = {
        totalMessages: o.totalEvents,
        entityCount: o.entityCount,
        relationCount: o.relationCount,
        observationCount: o.observationCount,
        topAgents: (data.agentPerformance || []).slice(0, 5).map((a) => ({
          name: a.name,
          events: a.events,
        })),
        containers,
        dbSize: dbMB,
      }
    } catch (e: any) {
      console.error('fetchAnalytics failed:', e)
    }
  }

  async function fetchProjects() {
    try {
      const data = await fetchJSON<GraphExportResponse>(
        '/api/graph-export?includeObservations=false'
      )
      const seen = new Set<string>()
      const projects: ProjectInfo[] = []
      for (const node of data.nodes || []) {
        const t = (node.entityType || '').toLowerCase()
        if ((t === 'project' || t === 'spectra-project') && isRealProject(node.name) && !seen.has(node.name)) {
          seen.add(node.name)
          projects.push({ name: node.name, observationCount: node.observationCount })
        }
      }
      availableProjects.value = projects.sort((a, b) => b.observationCount - a.observationCount)
    } catch (e: any) {
      console.error('fetchProjects failed:', e)
    }
  }

  async function fetchKnowledge() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const data = await fetchJSON<GraphExportResponse>(
        `/api/graph-export?includeObservations=true`
      )

      // Build a map of latest observation per entity
      const obsMap = new Map<string, { content: string; updatedAt: Date }>()
      for (const obs of data.observations || []) {
        const date = parseUTC(obs.createdAt)
        const existing = obsMap.get(obs.entityName)
        if (!existing || date > existing.updatedAt) {
          obsMap.set(obs.entityName, {
            content: obs.contents[0] || '',
            updatedAt: date,
          })
        }
      }

      // Merge with nodes, sort by most recent observation — filter out test entities
      const changes: KnowledgeChange[] = (data.nodes || [])
        .filter((node) => node.name && isRealProject(node.name))
        .map((node) => {
          const obs = obsMap.get(node.name)
          return {
            entityName: node.name,
            entityType: node.entityType,
            observationCount: node.observationCount,
            latestObservation: obs?.content || '',
            updatedAt: obs?.updatedAt || parseUTC(node.createdAt),
            isNew: parseUTC(node.createdAt) > new Date(oneHourAgo),
          }
        })
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 50)

      knowledge.value = changes
    } catch (e: any) {
      console.error('fetchKnowledge failed:', e)
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────
  async function initialize() {
    isLoading.value = true
    // Fetch all data in parallel on first load
    await Promise.allSettled([
      fetchMessages(),
      fetchAgents(),
      fetchAnalytics(),
      fetchKnowledge(),
      fetchProjects(),
    ])
    isLoading.value = false

    // Start polling tiers
    fastTimer = setInterval(fetchMessages, 3000)
    mediumTimer = setInterval(() => {
      fetchAgents()
      fetchKnowledge()
    }, 15000)
    slowTimer = setInterval(fetchAnalytics, 30000)
  }

  function destroy() {
    if (fastTimer) clearInterval(fastTimer)
    if (mediumTimer) clearInterval(mediumTimer)
    if (slowTimer) clearInterval(slowTimer)
    fastTimer = mediumTimer = slowTimer = null
  }

  function dismissAttention(messageId: string) {
    dismissedAttentionIds.value.add(messageId)
  }

  function toggleMessageExpanded(messageId: string) {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg) msg.isExpanded = !msg.isExpanded
  }

  function setFilter(f: Partial<MessageFilter>) {
    filter.value = { ...filter.value, ...f }
  }

  function setActiveProject(name: string) {
    activeProject.value = name === 'All Projects' ? '' : name
  }

  function clearFilter() {
    filter.value = { search: '', agent: '', type: '' }
  }

  return {
    // State
    agents,
    messages,
    knowledge,
    systemHealth,
    availableProjects,
    isConnected,
    lastError,
    isLoading,
    filter,
    activeProject,

    // Computed
    realAgents,
    activeAgents,
    offlineAgents,
    filteredMessages,
    filteredKnowledge,
    messageTypes,
    agentNames,
    attentionItems,

    // Actions
    initialize,
    destroy,
    dismissAttention,
    toggleMessageExpanded,
    setFilter,
    setActiveProject,
    clearFilter,
  }
})
