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
  GraphLink,
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

// ── Entity → Agent Resolver ─────────────────────────────────
// Maps graph entity types to the real messaging agent IDs they run as
const ENTITY_TYPE_TO_AGENT: Record<string, string> = {
  claude_code_subagent: 'claude-code',
}

// Static alias overrides for known graph entities → real agent IDs
const ENTITY_ALIAS: Record<string, string> = {
  'spectra-builder-agent': 'claude-code',
  'spectra-verifier-agent': 'claude-code',
  'spectra-planner-agent': 'claude-code',
  'spectra-reviewer-agent': 'claude-code',
  'spectra-auditor-agent': 'claude-code',
}

/** Resolve a graph entity to the real messaging agent ID it maps to */
function resolveEntityToAgent(entityName: string, entityType: string): string | null {
  const nameLower = entityName.toLowerCase()
  const typeLower = entityType.toLowerCase()
  // 1. Static alias (most specific) — case-insensitive
  if (ENTITY_ALIAS[nameLower]) return ENTITY_ALIAS[nameLower]
  // 2. Entity type mapping — case-insensitive
  if (ENTITY_TYPE_TO_AGENT[typeLower]) return ENTITY_TYPE_TO_AGENT[typeLower]
  return null
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
  const graphLinks = ref<GraphLink[]>([])  // relations from knowledge graph
  const graphNodes = ref<{ name: string; entityType: string }[]>([])  // entity type lookups

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

  // ── Graph-based project context ────────────────────────────
  // 1-hop neighbors: all entity names connected to the active project via graph links
  const projectRelatedEntities = computed<Set<string>>(() => {
    if (!activeProject.value) return new Set()
    const proj = activeProject.value.toLowerCase()
    const related = new Set<string>()
    related.add(proj)
    for (const link of graphLinks.value) {
      const src = link.source.toLowerCase()
      const tgt = link.target.toLowerCase()
      if (src === proj || src.includes(proj)) related.add(tgt)
      if (tgt === proj || tgt.includes(proj)) related.add(src)
    }
    return related
  })

  // ── Graph-first project participants (codex suggestion #1 + #2) ──
  // Resolve USES_AGENT graph entities to real messaging agent IDs
  // Returns Map<realAgentId, graphEntityNames[]>
  const graphProjectParticipants = computed<Map<string, string[]>>(() => {
    if (!activeProject.value) return new Map()
    const proj = activeProject.value.toLowerCase()
    const result = new Map<string, string[]>()

    for (const link of graphLinks.value) {
      if (link.relationType.toLowerCase() !== 'uses_agent') continue
      const src = link.source.toLowerCase()
      if (src !== proj && !src.includes(proj)) continue

      const entityName = link.target
      const node = graphNodes.value.find((n) => n.name.toLowerCase() === entityName.toLowerCase())
      const entityType = node?.entityType || ''
      const resolved = resolveEntityToAgent(entityName, entityType)
      if (resolved) {
        const existing = result.get(resolved)
        // Deduplicate entity names (duplicate graph edges)
        if (existing) {
          if (!existing.some((e) => e.toLowerCase() === entityName.toLowerCase())) {
            existing.push(entityName)
          }
        } else {
          result.set(resolved, [entityName])
        }
      }
    }
    return result
  })

  // Latest project message per agent (codex suggestion #3)
  const latestProjectMessageByAgent = computed<Map<string, Message>>(() => {
    const map = new Map<string, Message>()
    for (const m of filteredMessages.value) {
      const existing = map.get(m.fromAgent)
      if (!existing || m.createdAt > existing.createdAt) {
        map.set(m.fromAgent, m)
      }
    }
    return map
  })

  /** Is this message genuinely ABOUT the active project? (not just a passing mention) */
  function isMessageAboutProject(m: Message, proj: string): boolean {
    const content = m.content.toLowerCase()
    const from = m.fromAgent.toLowerCase()
    const to = m.toAgent.toLowerCase()

    // Agent name contains project name (e.g., spectra-builder-agent)
    if (from.includes(proj) || to.includes(proj)) return true

    // Project name in first 200 chars → headline / subject area
    const head = content.slice(0, 200)
    if (head.includes(proj)) return true

    // Multiple occurrences → the message is substantially about the project
    const first = content.indexOf(proj)
    if (first !== -1 && content.indexOf(proj, first + proj.length) !== -1) return true

    return false
  }

  const filteredMessages = computed(() => {
    let list = messages.value
    // Project scope filter — graph-aware, headline-weighted
    if (activeProject.value) {
      const proj = activeProject.value.toLowerCase()
      list = list.filter((m) => isMessageAboutProject(m, proj))
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

  // Agents derived from graph (primary) + messages (augmented) — codex suggestion #1+#2
  const projectAgentNames = computed<Set<string>>(() => {
    if (!activeProject.value) return new Set()
    const names = new Set<string>()

    // Graph-first: agents from USES_AGENT relations (authoritative)
    for (const agentId of graphProjectParticipants.value.keys()) {
      names.add(agentId)
    }

    // Message-augmented: agents from project-filtered messages
    for (const m of filteredMessages.value) {
      if (!m.fromAgent.startsWith('_')) names.add(m.fromAgent)
      if (!m.toAgent.startsWith('_')) names.add(m.toAgent)
    }
    return names
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

  // Knowledge filtered by graph relations (1-hop) with fallback to content match
  const filteredKnowledge = computed(() => {
    if (!activeProject.value) return knowledge.value
    const related = projectRelatedEntities.value
    const proj = activeProject.value.toLowerCase()

    return knowledge.value.filter((k) => {
      const name = k.entityName.toLowerCase()
      // Direct graph relation (1-hop neighbor)
      if (related.has(name)) return true
      // Entity name contains project name
      if (name.includes(proj)) return true
      // Entity's latest observation substantially mentions the project (2+ times or first 200 chars)
      const obs = k.latestObservation.toLowerCase()
      if (obs) {
        const head = obs.slice(0, 200)
        if (head.includes(proj)) return true
        const first = obs.indexOf(proj)
        if (first !== -1 && obs.indexOf(proj, first + proj.length) !== -1) return true
      }
      return false
    })
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

  let initialLoadDone = false

  async function fetchMessages() {
    try {
      // First load: fetch 200 to capture older project history
      // Incremental: fetch 50 (only new messages since cursor)
      const limit = initialLoadDone ? 50 : 200
      let url = `/api/recent-events?limit=${limit}`
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
      initialLoadDone = true
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

      // Store graph links + nodes for project-context filtering and entity resolution
      graphLinks.value = data.links || []
      graphNodes.value = (data.nodes || [])
        .filter((n) => n.name)
        .map((n) => ({ name: n.name, entityType: n.entityType }))

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
    projectAgentNames,
    projectRelatedEntities,
    graphProjectParticipants,
    latestProjectMessageByAgent,
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
