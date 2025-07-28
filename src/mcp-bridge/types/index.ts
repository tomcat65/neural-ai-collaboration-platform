/**
 * MCP Bridge Type Definitions
 * Core types for multi-agent communication through MCP protocol
 */

export enum AgentProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  GROK = 'grok',
  OLLAMA = 'ollama',
  CUSTOM = 'custom'
}

export enum AgentRole {
  ORCHESTRATOR = 'orchestrator',
  RESEARCHER = 'researcher',
  IMPLEMENTER = 'implementer',
  REVIEWER = 'reviewer',
  SPECIALIST = 'specialist'
}

export interface AgentCapabilities {
  mcpNative: boolean;
  supportedProtocols: string[];
  specializations: string[];
  maxContextWindow: number;
  costPerToken?: number;
  responseTime?: number;
}

export interface MCPMessage {
  id: string;
  from: AgentIdentifier;
  to?: AgentIdentifier | AgentIdentifier[];
  timestamp: Date;
  protocol: 'mcp' | 'translated';
  type: MessageType;
  content: any;
  metadata?: MessageMetadata;
}

export interface AgentIdentifier {
  id: string;
  provider: AgentProvider;
  role: AgentRole;
  instance?: string;
}

export enum MessageType {
  TASK_REQUEST = 'task_request',
  TASK_RESPONSE = 'task_response',
  KNOWLEDGE_SHARE = 'knowledge_share',
  CONSENSUS_REQUEST = 'consensus_request',
  CONSENSUS_VOTE = 'consensus_vote',
  STATUS_UPDATE = 'status_update',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong'
}

export interface MessageMetadata {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  requiresAck?: boolean;
  timeout?: number;
  retryCount?: number;
  correlationId?: string;
  tags?: string[];
}

export interface TaskRequest {
  taskId: string;
  description: string;
  requirements: {
    skills: string[];
    tools?: string[];
    constraints?: string[];
  };
  expectedDuration?: number;
  deadline?: Date;
}

export interface TaskResponse {
  taskId: string;
  status: 'accepted' | 'rejected' | 'completed' | 'failed';
  result?: any;
  error?: string;
  duration?: number;
}

export interface AgentRegistration {
  agent: AgentIdentifier;
  capabilities: AgentCapabilities;
  status: 'online' | 'offline' | 'busy' | 'error';
  endpoint?: string;
  lastSeen: Date;
}

export interface RoutingRule {
  id: string;
  name: string;
  condition: RoutingCondition;
  target: AgentIdentifier | AgentRole;
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  messageType?: MessageType[];
  skills?: string[];
  provider?: AgentProvider[];
  custom?: (message: MCPMessage) => boolean;
}

export interface BridgeConfiguration {
  maxRetries: number;
  messageTimeout: number;
  heartbeatInterval: number;
  enableLogging: boolean;
  enableMetrics: boolean;
  routingStrategy: 'round-robin' | 'least-loaded' | 'skill-based' | 'cost-optimized';
}

export interface ProviderAdapter {
  provider: AgentProvider;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  receive(handler: (message: MCPMessage) => void): void;
  isConnected(): boolean;
  getCapabilities(): AgentCapabilities;
}

export interface MetricsData {
  messagesProcessed: number;
  averageLatency: number;
  errorRate: number;
  activeAgents: number;
  taskCompletionRate: number;
  costPerTask?: number;
}