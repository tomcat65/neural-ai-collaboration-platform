// Unified Collaborative Event System Types
export interface CollaborativeEvent {
  id: string;
  timestamp: Date;
  sessionId: string;
  agentId: string;
  type: EventType;
  payload: EventPayload;
  memory?: MemoryUpdate | undefined;
  coordination?: CoordinationData | undefined;
}

export enum EventType {
  // Task Management
  TASK_CREATED = 'task.created',
  TASK_DECOMPOSED = 'task.decomposed',
  TASK_ASSIGNED = 'task.assigned',
  TASK_COMPLETED = 'task.completed',
  TASK_UPDATED = 'task.updated',
  
  // Agent Actions
  TOOL_USE_START = 'tool.use.start',
  TOOL_USE_END = 'tool.use.end',
  TOOL_USE_ERROR = 'tool.use.error',
  
  // Collaboration
  AGENT_MESSAGE = 'agent.message',
  AGENT_JOIN = 'agent.join',
  AGENT_LEAVE = 'agent.leave',
  CONSENSUS_REQUEST = 'consensus.request',
  CONSENSUS_VOTE = 'consensus.vote',
  CONSENSUS_REACHED = 'consensus.reached',
  CONFLICT_DETECTED = 'conflict.detected',
  CONFLICT_RESOLVED = 'conflict.resolved',
  
  // Memory
  MEMORY_UPDATED = 'memory.updated',
  KNOWLEDGE_SHARED = 'knowledge.shared',
  LEARNING_RECORDED = 'learning.recorded',
  
  // Human Interaction
  HUMAN_INPUT = 'human.input',
  HUMAN_FEEDBACK = 'human.feedback',
  HUMAN_OBSERVATION = 'human.observation'
}

export interface EventPayload {
  [key: string]: any;
}

export interface MemoryUpdate {
  type: 'individual' | 'shared';
  operation: 'create' | 'update' | 'delete';
  data: any;
}

export interface CoordinationData {
  requiresResponse?: boolean;
  targetAgents?: string[] | undefined;
  priority?: 'low' | 'medium' | 'high' | 'critical' | 'urgent';
  deadline?: Date | undefined;
}

export interface EventFilter {
  sessionId?: string;
  agentId?: string;
  type?: EventType;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

export interface EventCallback {
  (event: CollaborativeEvent): void;
}

// Task-specific event payloads
export interface TaskCreatedPayload extends EventPayload {
  taskId: string;
  title: string;
  description: string;
  requirements: TaskRequirements;
  parentTaskId?: string | undefined;
}

export interface TaskAssignedPayload extends EventPayload {
  taskId: string;
  assignedTo: string;
  assignedBy: string;
  deadline?: Date | undefined;
}

export interface TaskCompletedPayload extends EventPayload {
  taskId: string;
  result: TaskResult;
  artifacts?: string[];
}

// Tool usage event payloads
export interface ToolUseStartPayload extends EventPayload {
  toolName: string;
  parameters: any;
  context: string;
}

export interface ToolUseEndPayload extends EventPayload {
  toolName: string;
  result: any;
  duration: number;
  success: boolean;
}

// Collaboration event payloads
export interface AgentMessagePayload extends EventPayload {
  to?: string; // specific agent, or broadcast if undefined
  message: string;
  messageType: 'info' | 'question' | 'request' | 'response';
  replyTo?: string; // event ID being replied to
}

export interface ConsensusRequestPayload extends EventPayload {
  requestId: string;
  decision: string;
  participants: string[];
  votingDeadline?: Date | undefined;
  options?: string[];
}

export interface ConsensusVotePayload extends EventPayload {
  requestId: string;
  vote: string;
  reasoning?: string;
}

// Supporting interfaces
export interface TaskRequirements {
  skills: string[];
  tools: string[];
  dependencies: string[];
  deliverables: Deliverable[];
  acceptanceCriteria: string[];
  constraints?: any;
}

export interface Deliverable {
  name: string;
  description: string;
  type: 'file' | 'data' | 'decision' | 'artifact';
  format?: string;
  quality: QualityRequirement[];
}

export interface QualityRequirement {
  metric: string;
  threshold: number;
  critical: boolean;
}

export interface TaskResult {
  status: 'completed' | 'partial' | 'failed';
  output: any;
  notes?: string;
  nextSteps?: string[];
}

export interface AgentCapability {
  name: string;
  description: string;
  parameters: any;
}

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  capabilities: AgentCapability[];
  status: 'online' | 'offline' | 'busy';
  lastSeen: Date;
}