// ── API Response Types ──────────────────────────────────────────

export interface AgentStatusResponse {
  agents: ApiAgent[]
  // New canonical contract (Engram dashboard adaptation, server PR #18). Older
  // payloads omit these; the store falls back when they're absent.
  totalRegistrations?: number
  totalCanonicalAgents?: number
  returnedCanonicalAgents?: number
  raw?: boolean
}

export type AgentStatus = 'active' | 'idle' | 'offline'

export interface ApiAgent {
  // Canonical contract fields (preferred). canonicalAgentId is the deduped
  // logical-agent id; isEphemeral flags per-process bridge registrations the
  // server now identifies (so the client no longer guesses from id prefixes).
  canonicalAgentId?: string
  displayName?: string
  isEphemeral?: boolean
  // Legacy fields (kept for back-compat with older server payloads).
  agentId?: string
  name?: string
  type?: string
  // Backward-compat: older backends may still emit 'online'
  status: AgentStatus | 'online'
  eventsCount: number
  successRate?: number
  averageResponseTime?: number
  lastSeen: string
  capabilities: string[]
}

export interface RecentEventsResponse {
  messages: ApiMessage[]
  // Per-recipient unread counts (read_at IS NULL AND archived_at IS NULL),
  // tenant-wide. Optional for back-compat with older servers.
  unreadByAgent?: Record<string, number>
}

export interface ApiMessage {
  id: string
  from_agent: string
  to_agent: string
  content: string
  message_type: string
  created_at: string
  // Message-lifecycle state (Engram comms surface server contract). null/absent
  // on older payloads => treated as unread / not archived.
  read_at?: string | null
  archived_at?: string | null
}

export interface AnalyticsResponse {
  overview: {
    totalEvents: number
    activeAgents: number
    successRate: number
    avgResponseTime: number
    entityCount: number
    relationCount: number
    observationCount: number
    // Real DB size from SQLite PRAGMA (server PR #18). null if unavailable →
    // client falls back to the legacy estimate.
    actualDbBytes?: number | null
    dbSizeSource?: string | null
    dbSizeAt?: string | null
  }
  trends: {
    labels: string[]
    events: number[]
    successRates: number[]
  }
  agentPerformance: {
    name: string
    events: number
    successRate: number
    avgTime: number
  }[]
  systemHealth: {
    cpu: number
    memory: number
    network: number
    storage: number
  }
}

export interface GraphExportResponse {
  nodes: GraphNode[]
  links: GraphLink[]
  observations: GraphObservation[]
  nextCursor: string | null
  totals: {
    nodes: number
    links: number
    observations: number
  }
  generatedAt: string
}

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

export interface GraphObservation {
  entityName: string
  contents: string[]
  createdAt: string
}

// ── UI State Types ──────────────────────────────────────────────

export interface Agent {
  id: string
  name: string
  displayName: string
  status: AgentStatus
  lastSeen: Date
  messageCount: number
  capabilities: string[]
  isReal: boolean // filter out test agents
}

export interface Message {
  id: string
  fromAgent: string
  toAgent: string
  content: string
  messageType: string
  createdAt: Date
  isExpanded: boolean
  // Derived lifecycle state (from ApiMessage.read_at / archived_at).
  isRead: boolean
  isArchived: boolean
  readAt: Date | null
}

export interface KnowledgeChange {
  entityName: string
  entityType: string
  observationCount: number
  latestObservation: string
  updatedAt: Date
  isNew: boolean // created within last hour
}

export interface ContainerInfo {
  name: string
  port: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  mem: string
  uptime: string
}

export interface SystemHealth {
  totalMessages: number
  entityCount: number
  relationCount: number
  observationCount: number
  topAgents: { name: string; events: number }[]
  containers: ContainerInfo[]
  dbSize: string
}

export interface AttentionItem {
  message: Message
  reason: 'query' | 'urgent' | 'human-target'
  dismissed: boolean
}

export type MessageReadState = 'all' | 'unread' | 'archived'

export type MessageFilter = {
  search: string
  agent: string
  type: string
  readState: MessageReadState
}

export type ThemeName = 'dark' | 'light'
