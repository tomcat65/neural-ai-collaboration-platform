import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Agent,
  Message,
  KnowledgeChange,
  SystemHealth,
  AttentionItem,
  MessageFilter,
  AgentStatus,
  ApiAgent,
  ApiMessage,
  RecentEventsResponse,
  AgentStatusResponse,
  AnalyticsResponse,
  GraphExportResponse,
  GraphLink,
  ContainerInfo,
  MessageThread,
  ProjectDigest,
  Pulse,
} from '@/types/command-center'

// Test-only agent id prefixes (these are genuinely test fixtures, not real
// agents). NOTE: 'agent-' is intentionally NOT here anymore — the server now
// flags per-process bridge registrations via isEphemeral, and stable ids like
// 'agent-<host>' are real agents. Ephemerality comes from the server, not id
// prefixes (Engram dashboard adaptation, server PR #18).
const TEST_AGENT_PREFIXES = [
  '_tenant_iso_', '_session_test_', '_broadcast_test_',
  '_security_test_', '_contract_test_',
  'sender_',  // test senders
  'prov_',    // provenance test agents
]

function isRealAgent(a: ApiAgent): boolean {
  const id = a.canonicalAgentId || a.agentId || ''
  // Server-driven ephemerality is authoritative when present.
  if (a.isEphemeral) return false
  return !TEST_AGENT_PREFIXES.some((p) => id.startsWith(p))
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

function normalizeAgentStatus(status: ApiAgent['status']): AgentStatus {
  if (status === 'online') return 'active'
  if (status === 'active' || status === 'idle' || status === 'offline') return status
  return 'offline'
}

function toAgent(a: ApiAgent): Agent {
  // Prefer the canonical contract fields; fall back to legacy fields for older
  // server payloads.
  const id = a.canonicalAgentId || a.agentId || 'unknown'
  return {
    id,
    name: id,
    displayName: a.displayName || a.name || id,
    status: normalizeAgentStatus(a.status),
    lastSeen: parseUTC(a.lastSeen),
    messageCount: a.eventsCount,
    capabilities: a.capabilities,
    isReal: isRealAgent(a),
  }
}

// NOTE: client-side deduplicateAgents() was removed — /api/agent-status now
// returns a canonical roster (one entry per logical agent) by default, so the
// client no longer needs to dedupe. Defensive fallback below handles a stray
// duplicate id from an older raw payload without a dedicated pass.

function toMessage(m: ApiMessage): Message {
  const readAt = m.read_at ? parseUTC(m.read_at) : null
  return {
    id: m.id,
    fromAgent: m.from_agent,
    toAgent: m.to_agent,
    content: m.content,
    messageType: m.message_type,
    createdAt: parseUTC(m.created_at),
    isExpanded: false,
    isRead: readAt != null,
    isArchived: m.archived_at != null,
    readAt,
  }
}

const MAX_MESSAGES = 500

// ── Data hygiene (Engram redesign Phase 0) ──────────────────────
// The graph is polluted with test/smoke fixtures (e.g. 121+ "Houston Blenders
// Voice Launch/Timestamp <stamp>" entities from memory-system tests). Hide them
// from the human-facing dashboard by name-prefix, generated-stamp names (13+
// digit epoch / YYYYMMDDHHMMSS handles), fixture entity TYPES, and an editable
// extra substring list. A "show test data" toggle bypasses this.
const TEST_ENTITY_PREFIXES = ['_session_test_', '_contract_test_', '_security_test_', '_tenant_iso_']
const FIXTURE_STAMP_RE = /\d{13,}/                  // epoch-ms / long generated handles
const FIXTURE_TYPE_RE = /smoke|fixture|[-_]test$/i  // project-smoke-test, *_test, *-fixture
const NOISE_NAME_SUBSTRINGS: string[] = []          // editable extra noise (case-insensitive)

export function isFixtureEntity(name: string, entityType = ''): boolean {
  if (!name) return true
  const n = name.toLowerCase()
  if (TEST_ENTITY_PREFIXES.some((p) => n.startsWith(p))) return true
  if (FIXTURE_STAMP_RE.test(name)) return true
  if (entityType && FIXTURE_TYPE_RE.test(entityType)) return true
  if (NOISE_NAME_SUBSTRINGS.some((s) => n.includes(s.toLowerCase()))) return true
  return false
}

// Back-compat: a "real" (non-fixture) project, name only.
function isRealProject(name: string): boolean {
  return !isFixtureEntity(name)
}

// ── Needs-You detection (Engram redesign Phase 0) ───────────────
// HUMAN_ALIASES are the agent ids that represent the human operator. This is
// EXPLICIT config, never guessed from message content, and it is genuinely
// configurable: the DEFAULT below is overridden at load by the
// VITE_HUMAN_ALIASES env var (comma/space-separated), and at runtime by the
// store's setHumanAliases() action.
const DEFAULT_HUMAN_ALIASES = ['tomas', 'tommy', 'tomcat65']
// Message types that warrant your attention REGARDLESS of recipient (high-signal).
// query/question are intentionally NOT here: they only flag when addressed to you —
// a query/question between two other agents is their conversation, not your work
// (codex §5 / docs/PLAN-Dashboard-Redesign-Phase-0.md §5).
const NEEDS_YOU_ANYWHERE = new Set(['urgent'])

// Parse a comma/space-separated alias list into a lowercased Set; falls back to
// `fallback` when the input is empty/undefined.
export function parseHumanAliases(
  raw: string | undefined | null,
  fallback: string[] = DEFAULT_HUMAN_ALIASES,
): Set<string> {
  const ids = (raw ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set(ids.length ? ids : fallback.map((s) => s.toLowerCase()))
}

// A message "needs you" if it is unread + unarchived AND EITHER addressed to a
// human alias (anything to you) OR an urgent signal (regardless of recipient).
// `humanAliases` is injected so the rule stays a pure, testable function.
// (priority/expected_reply signals need the server to expose priority on
// /api/recent-events — a later add.)
export function messageNeedsYou(m: Message, humanAliases: Set<string>): boolean {
  if (m.isRead || m.isArchived) return false
  if (humanAliases.has(m.toAgent.toLowerCase())) return true
  return NEEDS_YOU_ANYWHERE.has(m.messageType.toLowerCase())
}

// ── Entity → Agent Resolver ─────────────────────────────────
// Maps graph entity types to the real messaging agent IDs they run as
const ENTITY_TYPE_TO_AGENT: Record<string, string> = {
  claude_code_subagent: 'claude-code',
}

// Static alias overrides for known graph entities → real agent IDs.
// NOTE: spectra-* aliases retained — spectra is a separate case to review later
// (Tomás), NOT removed as part of this Phase-1 dashboard pass.
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
  // Raw project list — ALL project-typed nodes incl. fixtures, retained so the
  // showTestData toggle can reveal them; availableProjects (computed) filters.
  const rawProjects = ref<ProjectInfo[]>([])
  // Data-hygiene toggle: when true, fixtures/test entities are shown (default off).
  const showTestData = ref(false)
  // Human-alias config (blocker-3 fix): genuinely configurable — seeded from the
  // VITE_HUMAN_ALIASES env var, overridable at runtime via setHumanAliases().
  const humanAliases = ref<Set<string>>(
    parseHumanAliases((import.meta.env as unknown as Record<string, string | undefined>).VITE_HUMAN_ALIASES),
  )
  const graphLinks = ref<GraphLink[]>([])  // relations from knowledge graph
  const graphNodes = ref<{ name: string; entityType: string }[]>([])  // entity type lookups

  const isConnected = ref(false)
  const lastError = ref<string | null>(null)
  const isLoading = ref(true)

  const filter = ref<MessageFilter>({ search: '', agent: '', type: '', readState: 'all' })
  const activeProject = ref<string>('')  // '' = All Projects

  // Per-recipient unread counts from the server (tenant-wide; accurate past the
  // page limit). Drives the unread badges + inbox.
  const unreadByAgent = ref<Record<string, number>>({})
  const totalUnread = computed(() =>
    Object.values(unreadByAgent.value).reduce((sum, n) => sum + n, 0)
  )

  // Per-recipient unread inbox: group unread (not archived) messages by recipient
  // (toAgent), newest first, using the server's tenant-wide count. Drives InboxPanel.
  const unreadInbox = computed<{ agent: string; count: number; previews: Message[] }[]>(() => {
    const groups = new Map<string, Message[]>()
    for (const m of messages.value) {
      if (m.isRead || m.isArchived) continue
      const arr = groups.get(m.toAgent)
      if (arr) arr.push(m)
      else groups.set(m.toAgent, [m])
    }
    const seen = new Set<string>()
    const entries: { agent: string; count: number; previews: Message[] }[] = []
    for (const [agent, msgs] of groups) {
      seen.add(agent)
      msgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      entries.push({ agent, count: unreadByAgent.value[agent] ?? msgs.length, previews: msgs.slice(0, 5) })
    }
    // Agents with server-side unread but no loaded previews (count-only row).
    for (const [agent, count] of Object.entries(unreadByAgent.value)) {
      if (count > 0 && !seen.has(agent)) entries.push({ agent, count, previews: [] })
    }
    return entries.sort((a, b) => b.count - a.count)
  })

  // since-cursor for incremental message fetching
  let messageCursor: string | null = null

  // Polling timer IDs
  let fastTimer: ReturnType<typeof setInterval> | null = null
  let mediumTimer: ReturnType<typeof setInterval> | null = null
  let slowTimer: ReturnType<typeof setInterval> | null = null

  // ── Computed ────────────────────────────────────────────────
  const realAgents = computed(() => agents.value.filter((a) => a.isReal))

  // Consider agents "active" if status is active/idle OR seen within the last 24 hours
  const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000
  const isActiveLike = (a: Agent) =>
    a.status === 'active' || a.status === 'idle' || Date.now() - a.lastSeen.getTime() < ACTIVE_WINDOW_MS

  const activeAgents = computed(() =>
    realAgents.value.filter((a) => isActiveLike(a))
  )
  const offlineAgents = computed(() =>
    realAgents.value.filter((a) => a.status === 'offline' && Date.now() - a.lastSeen.getTime() >= ACTIVE_WINDOW_MS)
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
    // Read-state: 'all' hides archived; 'unread' = unread & not archived;
    // 'archived' = archived only.
    if (f.readState === 'archived') {
      list = list.filter((m) => m.isArchived)
    } else if (f.readState === 'unread') {
      list = list.filter((m) => !m.isRead && !m.isArchived)
    } else {
      list = list.filter((m) => !m.isArchived)
    }
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

  // Noise-filtered knowledge feed (fixtures hidden unless showTestData), top 50.
  const cleanKnowledge = computed<KnowledgeChange[]>(() => {
    const base = showTestData.value
      ? knowledge.value
      : knowledge.value.filter((k) => !isFixtureEntity(k.entityName, k.entityType))
    return base.slice(0, 50)
  })

  // Project list with fixtures hidden unless showTestData (blocker-1 fix: the
  // toggle now reaches the project list, not just the knowledge feed). Projects
  // are type-constrained to project|spectra-project, so name-only fixture
  // detection is sufficient here.
  const availableProjects = computed<ProjectInfo[]>(() =>
    showTestData.value
      ? rawProjects.value
      : rawProjects.value.filter((p) => !isFixtureEntity(p.name)),
  )

  // Knowledge filtered by graph relations (1-hop) with fallback to content match
  const filteredKnowledge = computed(() => {
    if (!activeProject.value) return cleanKnowledge.value
    const related = projectRelatedEntities.value
    const proj = activeProject.value.toLowerCase()

    return cleanKnowledge.value.filter((k) => {
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

  // ── Digest / selector model (Engram redesign Phase 0) ─────────
  // Threads = deterministic grouping of (non-archived) messages by agent-pair,
  // newest first, with counts + unread + needs-you + a latest-line preview.
  const messageThreads = computed<MessageThread[]>(() => {
    const map = new Map<string, Message[]>()
    for (const m of messages.value) {
      if (m.isArchived) continue
      const key = [m.fromAgent, m.toAgent].sort().join(' ↔ ')
      const arr = map.get(key)
      if (arr) arr.push(m)
      else map.set(key, [m])
    }
    const threads: MessageThread[] = []
    for (const [key, msgs] of map) {
      msgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const latest = msgs[0]
      threads.push({
        key,
        participants: key.split(' ↔ '),
        count: msgs.length,
        unreadCount: msgs.filter((m) => !m.isRead).length,
        needsYou: msgs.some((m) => messageNeedsYou(m, humanAliases.value)),
        latestLine: latest.content.length > 120 ? latest.content.slice(0, 120) + '…' : latest.content,
        latestAt: latest.createdAt,
      })
    }
    return threads.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())
  })

  // Flat triage list: messages that need the human, newest first.
  const needsYou = computed<Message[]>(() =>
    messages.value
      .filter((m) => messageNeedsYou(m, humanAliases.value))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  )

  // Per-project activity rollup. BEST-EFFORT / HEURISTIC: messages carry no
  // canonical projectId, so association is inferred via isMessageAboutProject
  // (agent-name / headline / repeated-mention) — surface as best-effort in the
  // UI, never as canonical. See docs/PLAN-Dashboard-Redesign-Phase-0.md §6.
  const projectDigests = computed<ProjectDigest[]>(() =>
    availableProjects.value
      .map((p) => {
        const proj = p.name.toLowerCase()
        const msgs = messages.value.filter((m) => !m.isArchived && isMessageAboutProject(m, proj))
        const knowledgeChanges = cleanKnowledge.value.filter((k) => k.entityName.toLowerCase().includes(proj)).length
        return {
          project: p.name,
          messageCount: msgs.length,
          unreadCount: msgs.filter((m) => !m.isRead).length,
          knowledgeChanges,
        }
      })
      .filter((d) => d.messageCount > 0 || d.knowledgeChanges > 0)
      .sort((a, b) => b.unreadCount - a.unreadCount || b.messageCount - a.messageCount)
  )

  // Headline counts for the overview Pulse band.
  const pulse = computed<Pulse>(() => ({
    activeAgents: activeAgents.value.length,
    unread: totalUnread.value,
    needsYou: needsYou.value.length,
    threads: messageThreads.value.length,
    projects: availableProjects.value.length,
    knowledgeChanges: cleanKnowledge.value.length,
  }))

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
      if (data.unreadByAgent) unreadByAgent.value = data.unreadByAgent
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
      // Server returns a canonical roster (deduped) — no client dedup needed.
      // Defensive: collapse any accidental duplicate id (e.g. older raw payload),
      // keeping the most-recently-seen and summing message counts.
      const byId = new Map<string, Agent>()
      for (const a of all) {
        const prev = byId.get(a.id)
        if (!prev) { byId.set(a.id, a); continue }
        const keep = a.lastSeen > prev.lastSeen ? a : prev
        keep.messageCount = a.messageCount + prev.messageCount
        byId.set(a.id, keep)
      }
      agents.value = Array.from(byId.values())
    } catch (e: any) {
      console.error('fetchAgents failed:', e)
    }
  }

  async function fetchAnalytics() {
    try {
      const data = await fetchJSON<AnalyticsResponse>('/api/analytics')
      const o = data.overview
      // Build container status only from currently known active services.
      const containers: ContainerInfo[] = [
        { name: 'unified-neural-mcp', port: '6174', status: 'healthy', mem: '—', uptime: '—' },
        { name: 'vue-dashboard', port: '5176', status: 'healthy', mem: '—', uptime: '—' },
      ]

      // Prefer the server's real DB size (SQLite PRAGMA, server PR #18). Fall
      // back to the rough estimate only when the server doesn't supply it.
      let dbMB: string
      if (typeof o.actualDbBytes === 'number' && o.actualDbBytes > 0) {
        dbMB = `${(o.actualDbBytes / 1024 / 1024).toFixed(1)} MB`
      } else {
        const estimatedBytes =
          (o.totalEvents || 0) * 3000 +
          (o.entityCount || 0) * 2000 +
          (o.observationCount || 0) * 4000
        dbMB = estimatedBytes > 0
          ? `~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB`
          : '—'
      }

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
        // Keep ALL project-typed nodes (incl. fixtures) so showTestData can reveal
        // them; fixture filtering moved to the availableProjects computed (blocker-1).
        if ((t === 'project' || t === 'spectra-project') && !seen.has(node.name)) {
          seen.add(node.name)
          projects.push({ name: node.name, observationCount: node.observationCount })
        }
      }
      rawProjects.value = projects.sort((a, b) => b.observationCount - a.observationCount)
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

      // Merge with nodes, sort by most recent observation. Keep RAW here (incl.
      // fixtures) so the showTestData toggle can reveal them; the noise filter is
      // applied reactively in cleanKnowledge.
      const changes: KnowledgeChange[] = (data.nodes || [])
        .filter((node) => node.name)
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

      // Retain the FULL sorted raw set (no premature cap): cleanKnowledge applies
      // the fixture filter and THEN the visible cutoff, so real entities are never
      // dropped before filtering. (blocker-2 fix)
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
    filter.value = { search: '', agent: '', type: '', readState: 'all' }
  }

  function setShowTestData(v: boolean) {
    showTestData.value = v
  }

  // Runtime override for the human-alias set (blocker-3: genuinely configurable).
  function setHumanAliases(ids: string[]) {
    humanAliases.value = new Set(ids.map((s) => s.trim().toLowerCase()).filter(Boolean))
  }

  // ── Comms write actions (Engram comms surface, PR3) ──────────
  // Reuse the server's authenticated generic POST /api/tools/:toolName (codex
  // decision 234700b1). A tiny client-side allowlist keeps the dashboard to the
  // two explicit message-lifecycle tools — never arbitrary tool calls.
  const WRITE_TOOL_ALLOWLIST = new Set(['mark_messages_read', 'archive_messages'])
  async function postTool(toolName: string, args: Record<string, unknown>): Promise<void> {
    if (!WRITE_TOOL_ALLOWLIST.has(toolName)) {
      throw new Error(`Dashboard is not allowed to call tool: ${toolName}`)
    }
    const res = await fetch(`/api/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  }

  /** Mark specific messages — or all unread for an agent when ids omitted — read. Optimistic, then refetch. */
  async function markRead(agentId: string, messageIds?: string[]) {
    const ids = messageIds ? new Set(messageIds) : null
    for (const m of messages.value) {
      const hit = ids ? ids.has(m.id) : (m.toAgent === agentId && !m.isArchived)
      if (hit && !m.isRead) { m.isRead = true; m.readAt = new Date() }
    }
    if (unreadByAgent.value[agentId] != null) {
      unreadByAgent.value[agentId] = ids ? Math.max(0, unreadByAgent.value[agentId] - ids.size) : 0
    }
    try {
      await postTool('mark_messages_read', messageIds ? { agentId, messageIds } : { agentId })
    } finally {
      await fetchMessages()
    }
  }

  /** Archive specific messages for an agent. Optimistic, then refetch. */
  async function archive(agentId: string, messageIds: string[]) {
    const ids = new Set(messageIds)
    for (const m of messages.value) {
      if (ids.has(m.id)) m.isArchived = true
    }
    if (unreadByAgent.value[agentId] != null) {
      unreadByAgent.value[agentId] = Math.max(0, unreadByAgent.value[agentId] - ids.size)
    }
    try {
      await postTool('archive_messages', { agentId, messageIds })
    } finally {
      await fetchMessages()
    }
  }

  return {
    // State
    agents,
    messages,
    knowledge,
    systemHealth,
    availableProjects,
    rawProjects,
    isConnected,
    lastError,
    isLoading,
    filter,
    activeProject,
    unreadByAgent,
    showTestData,
    humanAliases,

    // Computed
    realAgents,
    totalUnread,
    activeAgents,
    offlineAgents,
    filteredMessages,
    filteredKnowledge,
    cleanKnowledge,
    messageThreads,
    needsYou,
    projectDigests,
    pulse,
    projectAgentNames,
    projectRelatedEntities,
    graphProjectParticipants,
    latestProjectMessageByAgent,
    messageTypes,
    agentNames,
    attentionItems,
    unreadInbox,

    // Actions
    initialize,
    destroy,
    dismissAttention,
    toggleMessageExpanded,
    setFilter,
    setActiveProject,
    clearFilter,
    setShowTestData,
    setHumanAliases,
    markRead,
    archive,
    // Exposed for focused parsing tests (see command-center.spec.ts).
    fetchAgents,
    fetchAnalytics,
    fetchMessages,
    fetchKnowledge,
    fetchProjects,
  }
})
