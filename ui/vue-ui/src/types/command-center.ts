// ── API Response Types ──────────────────────────────────────────

export interface AgentStatusResponse {
  agents: ApiAgent[]
}

export interface ApiAgent {
  agentId: string
  name: string
  type: string
  status: 'online' | 'offline'
  eventsCount: number
  successRate: number
  averageResponseTime: number
  lastSeen: string
  capabilities: string[]
}

export interface RecentEventsResponse {
  messages: ApiMessage[]
}

export interface ApiMessage {
  id: string
  from_agent: string
  to_agent: string
  content: string
  message_type: string
  created_at: string
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
  status: 'online' | 'offline'
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

export type MessageFilter = {
  search: string
  agent: string
  type: string
}

export type ThemeName = 'dark' | 'light'
