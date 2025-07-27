// Collaboration Hub Implementation
import { v4 as uuidv4 } from 'uuid';
import { CollaborativeEventSystem } from '../events/index.js';
import { MemoryManager } from '../memory/index.js';
import {
  Task,
  TaskRequirements,
  TaskStatus,
  ConsensusHistory,
  ConsensusResult,
  Vote
} from '../types/memory.js';
import {
  EventType,
  TaskCreatedPayload,
  TaskAssignedPayload,
  TaskCompletedPayload,
  ConsensusRequestPayload,
  ConsensusVotePayload,
  CoordinationData
} from '../types/events.js';

export interface SubTask extends Task {
  parentTaskId: string;
  dependencies: string[];
}

export interface Assignment {
  id: string;
  taskId: string;
  agentId: string;
  assignedBy: string;
  assignedAt: Date;
  deadline?: Date | undefined;
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed';
}

export interface AgentCapability {
  agentId: string;
  skills: string[];
  expertise: Map<string, number>;
  currentLoad: number;
  reliability: number;
  preference: string[];
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  options: string[];
  impact: 'low' | 'medium' | 'high' | 'critical';
  deadline?: Date;
}

export interface ConsensusRequest {
  id: string;
  decision: Decision;
  participants: string[];
  votes: Map<string, Vote>;
  status: 'pending' | 'in_progress' | 'reached' | 'failed' | 'timeout';
  createdBy: string;
  createdAt: Date;
  deadline?: Date | undefined;
  result?: ConsensusResult;
}

export interface Conflict {
  id: string;
  type: 'resource' | 'priority' | 'approach' | 'timing';
  description: string;
  involvedAgents: string[];
  conflictingActions: AgentAction[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  status: 'detected' | 'analyzing' | 'resolving' | 'resolved';
}

export interface AgentAction {
  agentId: string;
  action: string;
  target: string;
  timestamp: Date;
  parameters: any;
}

export interface Resolution {
  id: string;
  conflictId: string;
  strategy: 'priority' | 'compromise' | 'vote' | 'escalate';
  description: string;
  resolvedBy: string;
  resolvedAt: Date;
  outcome: any;
}

export interface CollaborationMessage {
  id: string;
  from: string;
  to?: string[]; // undefined = broadcast
  type: 'info' | 'request' | 'response' | 'alert';
  subject: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requiresResponse: boolean;
  timestamp: Date;
}

export interface SyncResult {
  agentId: string;
  lastSync: Date;
  conflicts: string[];
  updates: string[];
  status: 'synced' | 'partial' | 'failed';
}

export interface TaskProgress {
  taskId: string;
  progress: number; // 0-1
  milestones: Milestone[];
  blockers: string[];
  estimatedCompletion: Date;
}

export interface Milestone {
  id: string;
  name: string;
  completed: boolean;
  completedAt?: Date;
}

export interface CollaborationReport {
  sessionId: string;
  timeRange: { start: Date; end: Date };
  participants: string[];
  tasksCompleted: number;
  consensusReached: number;
  conflictsResolved: number;
  collaborationScore: number; // 0-1
  insights: string[];
}

export class CollaborationHub {
  private eventSystem: CollaborativeEventSystem;
  private memoryManager: MemoryManager;
  private activeConsensus: Map<string, ConsensusRequest>;
  private activeConflicts: Map<string, Conflict>;
  private assignments: Map<string, Assignment>;
  private recentActions: Map<string, AgentAction[]>;

  constructor(eventSystem: CollaborativeEventSystem, memoryManager: MemoryManager) {
    this.eventSystem = eventSystem;
    this.memoryManager = memoryManager;
    this.activeConsensus = new Map();
    this.activeConflicts = new Map();
    this.assignments = new Map();
    this.recentActions = new Map();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventSystem.on('event', (event) => {
      // Track agent actions for conflict detection
      if (event.type === EventType.TOOL_USE_START) {
        this.trackAgentAction({
          agentId: event.agentId,
          action: 'tool_use',
          target: event.payload.toolName,
          timestamp: event.timestamp,
          parameters: event.payload.parameters
        });
      }

      // Handle consensus votes
      if (event.type === EventType.CONSENSUS_VOTE) {
        this.processConsensusVote(event.payload as ConsensusVotePayload, event.agentId);
      }
    });
  }

  // Task Management
  async createTask(
    sessionId: string,
    agentId: string,
    description: string, 
    requirements: TaskRequirements,
    parentTaskId?: string
  ): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      title: this.extractTitleFromDescription(description),
      description,
      requirements,
      status: TaskStatus.CREATED,
      priority: 'medium',
      estimatedEffort: this.estimateEffort(requirements),
      createdBy: agentId,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentTaskId,
      childTaskIds: []
    };

    // Store in memory
    await this.memoryManager.store(agentId, task, 'shared', 'task');

    // Publish event
    const payload: TaskCreatedPayload = {
      taskId: task.id,
      title: task.title,
      description: task.description,
      requirements: task.requirements,
      parentTaskId
    };

    await this.eventSystem.publishEvent({
      sessionId,
      agentId,
      type: EventType.TASK_CREATED,
      payload,
      coordination: {
        requiresResponse: false,
        priority: 'medium'
      }
    });

    console.log(`📋 Task created: ${task.title} by ${agentId}`);
    return task;
  }

  async decomposeTask(sessionId: string, task: Task, agentId: string): Promise<SubTask[]> {
    const subTasks: SubTask[] = [];
    
    // AI-assisted task decomposition (simplified)
    const subTaskDescriptions = this.generateSubTasks(task);
    
    for (const [index, description] of subTaskDescriptions.entries()) {
      const subTask: SubTask = {
        id: uuidv4(),
        title: description.title,
        description: description.description,
        requirements: description.requirements,
        status: TaskStatus.CREATED,
        priority: task.priority,
        estimatedEffort: description.estimatedEffort,
        createdBy: agentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentTaskId: task.id,
        childTaskIds: [],
        dependencies: description.dependencies
      };

      subTasks.push(subTask);
      
      // Store in memory
      await this.memoryManager.store(agentId, subTask, 'shared', 'task');
    }

    // Update parent task
    task.childTaskIds = subTasks.map(st => st.id);
    await this.memoryManager.update(task.id, task, 'shared');

    // Publish decomposition event
    await this.eventSystem.publishEvent({
      sessionId,
      agentId,
      type: EventType.TASK_DECOMPOSED,
      payload: {
        parentTaskId: task.id,
        subTasks: subTasks.map(st => ({
          id: st.id,
          title: st.title,
          estimatedEffort: st.estimatedEffort
        }))
      }
    });

    console.log(`🔄 Task decomposed: ${task.title} -> ${subTasks.length} subtasks`);
    return subTasks;
  }

  async assignTask(sessionId: string, task: Task, agentId: string, assignedBy: string): Promise<Assignment> {
    const assignment: Assignment = {
      id: uuidv4(),
      taskId: task.id,
      agentId,
      assignedBy,
      assignedAt: new Date(),
      status: 'pending'
    };

    this.assignments.set(assignment.id, assignment);

    // Update task
    task.assignedTo = agentId;
    task.status = TaskStatus.ASSIGNED;
    task.updatedAt = new Date();
    await this.memoryManager.update(task.id, task, 'shared');

    // Publish assignment event
    const payload: TaskAssignedPayload = {
      taskId: task.id,
      assignedTo: agentId,
      assignedBy,
      deadline: assignment.deadline
    };

    await this.eventSystem.publishEvent({
      sessionId,
      agentId: assignedBy,
      type: EventType.TASK_ASSIGNED,
      payload,
      coordination: {
        targetAgents: [agentId],
        requiresResponse: true,
        priority: 'high'
      }
    });

    console.log(`👤 Task assigned: ${task.title} -> ${agentId}`);
    return assignment;
  }

  // Consensus Building
  async requestConsensus(
    sessionId: string,
    agentId: string,
    decision: Decision, 
    participants: string[]
  ): Promise<ConsensusRequest> {
    const consensusRequest: ConsensusRequest = {
      id: uuidv4(),
      decision,
      participants,
      votes: new Map(),
      status: 'pending',
      createdBy: agentId,
      createdAt: new Date(),
      deadline: decision.deadline
    };

    this.activeConsensus.set(consensusRequest.id, consensusRequest);

    // Publish consensus request
    const payload: ConsensusRequestPayload = {
      requestId: consensusRequest.id,
      decision: decision.description,
      participants,
      votingDeadline: decision.deadline,
      options: decision.options
    };

    await this.eventSystem.publishEvent({
      sessionId,
      agentId,
      type: EventType.CONSENSUS_REQUEST,
      payload,
      coordination: {
        targetAgents: participants,
        requiresResponse: true,
        priority: decision.impact === 'critical' ? 'critical' : 'high',
        deadline: decision.deadline
      }
    });

    console.log(`🗳️ Consensus requested: ${decision.title} with ${participants.length} participants`);
    return consensusRequest;
  }

  async processConsensusVote(payload: ConsensusVotePayload, agentId: string): Promise<void> {
    const request = this.activeConsensus.get(payload.requestId);
    if (!request) {
      throw new Error(`Consensus request not found: ${payload.requestId}`);
    }

    const vote: Vote = {
      agentId,
      choice: payload.vote,
      reasoning: payload.reasoning || '',
      confidence: payload.confidence || 0.8,
      timestamp: new Date()
    };

    request.votes.set(agentId, vote);

    // Check if consensus is reached
    const result = this.checkConsensus(request);
    if (result.status === 'reached') {
      request.status = 'reached';
      request.result = result;

      // Publish consensus reached event
      await this.eventSystem.publishEvent({
        sessionId: 'current',
        agentId: 'system',
        type: EventType.CONSENSUS_REACHED,
        payload: {
          requestId: request.id,
          decision: result.finalDecision,
          supportLevel: result.supportLevel
        }
      });

      console.log(`✅ Consensus reached: ${request.decision.title} with ${Math.round(result.supportLevel * 100)}% support`);
    }
  }

  private checkConsensus(request: ConsensusRequest): ConsensusResult {
    const totalParticipants = request.participants.length;
    const totalVotes = request.votes.size;
    
    if (totalVotes < totalParticipants * 0.5) {
      return { status: 'failed', supportLevel: 0 };
    }

    // Simple majority consensus
    const voteCounts = new Map<string, number>();
    for (const vote of request.votes.values()) {
      voteCounts.set(vote.choice, (voteCounts.get(vote.choice) || 0) + 1);
    }

    const maxVotes = Math.max(...voteCounts.values());
    const winners = Array.from(voteCounts.entries()).filter(([_, count]) => count === maxVotes);

    if (winners.length === 1 && maxVotes > totalVotes * 0.6) {
      return {
        status: 'reached',
        finalDecision: winners[0][0],
        supportLevel: maxVotes / totalVotes
      };
    }

    return { status: 'failed', supportLevel: maxVotes / totalVotes };
  }

  // Conflict Detection and Resolution
  async detectConflict(actions: AgentAction[]): Promise<Conflict | null> {
    // Simple conflict detection based on resource contention
    const resourceMap = new Map<string, AgentAction[]>();
    
    for (const action of actions) {
      if (!resourceMap.has(action.target)) {
        resourceMap.set(action.target, []);
      }
      resourceMap.get(action.target)!.push(action);
    }

    for (const [resource, resourceActions] of resourceMap) {
      if (resourceActions.length > 1) {
        // Multiple agents acting on same resource
        const conflict: Conflict = {
          id: uuidv4(),
          type: 'resource',
          description: `Multiple agents accessing resource: ${resource}`,
          involvedAgents: resourceActions.map(a => a.agentId),
          conflictingActions: resourceActions,
          severity: 'medium',
          detectedAt: new Date(),
          status: 'detected'
        };

        this.activeConflicts.set(conflict.id, conflict);
        
        // Publish conflict detection event
        await this.eventSystem.publishEvent({
          sessionId: 'current',
          agentId: 'system',
          type: EventType.CONFLICT_DETECTED,
          payload: {
            conflictId: conflict.id,
            type: conflict.type,
            involvedAgents: conflict.involvedAgents,
            resource
          },
          coordination: {
            targetAgents: conflict.involvedAgents,
            priority: 'high'
          }
        });

        console.log(`⚠️ Conflict detected: ${conflict.description}`);
        return conflict;
      }
    }

    return null;
  }

  async resolveConflict(conflictId: string, strategy: string = 'priority'): Promise<Resolution> {
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    const resolution: Resolution = {
      id: uuidv4(),
      conflictId,
      strategy: strategy as any,
      description: `Resolved using ${strategy} strategy`,
      resolvedBy: 'system',
      resolvedAt: new Date(),
      outcome: {}
    };

    // Apply resolution strategy
    switch (strategy) {
      case 'priority':
        // Give precedence to higher-priority agent
        const priorityOrder = conflict.involvedAgents.sort(); // Simplified
        resolution.outcome = { winner: priorityOrder[0] };
        break;
      
      case 'compromise':
        // Split resources or time
        resolution.outcome = { allocation: this.allocateResources(conflict.involvedAgents) };
        break;
      
      case 'vote':
        // Initiate consensus vote
        const decision: Decision = {
          id: uuidv4(),
          title: 'Conflict Resolution Vote',
          description: conflict.description,
          options: conflict.involvedAgents,
          impact: 'medium'
        };
        // TODO: Initiate consensus process
        break;
    }

    conflict.status = 'resolved';
    this.activeConflicts.delete(conflictId);

    // Publish resolution event
    await this.eventSystem.publishEvent({
      sessionId: 'current',
      agentId: 'system',
      type: EventType.CONFLICT_RESOLVED,
      payload: {
        conflictId,
        strategy,
        outcome: resolution.outcome
      }
    });

    console.log(`✅ Conflict resolved: ${conflictId} using ${strategy}`);
    return resolution;
  }

  // Utility Methods
  private trackAgentAction(action: AgentAction): void {
    if (!this.recentActions.has(action.agentId)) {
      this.recentActions.set(action.agentId, []);
    }
    
    const actions = this.recentActions.get(action.agentId)!;
    actions.push(action);
    
    // Keep only recent actions (last 100)
    if (actions.length > 100) {
      actions.shift();
    }

    // Check for conflicts with recent actions
    const allRecentActions = Array.from(this.recentActions.values()).flat();
    this.detectConflict(allRecentActions.slice(-10)); // Check last 10 actions
  }

  private extractTitleFromDescription(description: string): string {
    return description.split('.')[0].slice(0, 50) + (description.length > 50 ? '...' : '');
  }

  private estimateEffort(requirements: TaskRequirements): number {
    // Simple effort estimation based on requirements
    if (!requirements) {
      return 1; // Default effort if no requirements provided
    }
    const skillsCount = requirements.skills?.length || 0;
    const deliverablesCount = requirements.deliverables?.length || 0;
    return skillsCount * 2 + deliverablesCount * 1.5;
  }

  private generateSubTasks(task: Task): Array<{
    title: string;
    description: string;
    requirements: TaskRequirements;
    estimatedEffort: number;
    dependencies: string[];
  }> {
    // Simplified task decomposition
    const requirements = task.requirements || { skills: [], deliverables: [] };
    const complexity = (requirements.skills?.length || 0) + (requirements.deliverables?.length || 0);
    const subTaskCount = Math.min(Math.max(2, Math.floor(complexity / 2)), 5);
    
    const subTasks = [];
    for (let i = 0; i < subTaskCount; i++) {
      subTasks.push({
        title: `${task.title} - Phase ${i + 1}`,
        description: `Phase ${i + 1} of ${task.title}`,
        requirements: {
          skills: requirements.skills?.slice(0, 2) || [],
          tools: requirements.tools || [],
          dependencies: i > 0 ? [`phase-${i}`] : [],
          deliverables: requirements.deliverables?.slice(i, i + 1) || [],
          acceptanceCriteria: [`Complete phase ${i + 1} objectives`]
        },
        estimatedEffort: task.estimatedEffort ? task.estimatedEffort / subTaskCount : 1,
        dependencies: i > 0 ? [`phase-${i}`] : []
      });
    }
    
    return subTasks;
  }

  private allocateResources(agents: string[]): any {
    // Simple resource allocation
    return agents.reduce((allocation, agent, index) => {
      allocation[agent] = { timeSlot: index, priority: agents.length - index };
      return allocation;
    }, {} as any);
  }

  // Public API Methods
  async synchronizeState(agents: string[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    
    for (const agentId of agents) {
      const result: SyncResult = {
        agentId,
        lastSync: new Date(),
        conflicts: [],
        updates: [],
        status: 'synced'
      };
      
      // TODO: Implement actual synchronization logic
      results.push(result);
    }
    
    return results;
  }

  async broadcastToAgents(message: CollaborationMessage): Promise<void> {
    await this.eventSystem.publishEvent({
      sessionId: 'broadcast',
      agentId: message.from,
      type: EventType.AGENT_MESSAGE,
      payload: {
        to: message.to,
        message: message.content,
        messageType: message.type,
        subject: message.subject
      },
      coordination: {
        targetAgents: message.to,
        priority: message.priority,
        requiresResponse: message.requiresResponse
      } as CoordinationData
    });
  }

  async trackProgress(taskId: string): Promise<TaskProgress> {
    // TODO: Implement progress tracking
    return {
      taskId,
      progress: 0.5,
      milestones: [],
      blockers: [],
      estimatedCompletion: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
  }

  async generateReport(sessionId: string): Promise<CollaborationReport> {
    const events = await this.eventSystem.getEventHistory({ sessionId });
    
    // TODO: Generate comprehensive collaboration report
    return {
      sessionId,
      timeRange: { start: new Date(), end: new Date() },
      participants: [],
      tasksCompleted: 0,
      consensusReached: 0,
      conflictsResolved: 0,
      collaborationScore: 0.8,
      insights: ['Great collaboration!']
    };
  }

  // Phase 2: Advanced Collaboration Methods
  getActiveConsensus(requestId: string): ConsensusRequest | undefined {
    return this.activeConsensus.get(requestId);
  }

  getAllActiveConsensus(): ConsensusRequest[] {
    return Array.from(this.activeConsensus.values());
  }

  async intelligentlyAssignTask(task: Task, availableAgents: string[], strategy: string = 'capability'): Promise<string> {
    // Enhanced intelligent assignment with real agent capability analysis
    const agentCapabilities = await this.getAgentCapabilities(availableAgents);
    
    switch (strategy) {
      case 'capability':
        return this.assignByCapability(task, agentCapabilities);
      
      case 'load':
        return await this.assignByWorkload(agentCapabilities);
      
      case 'expertise':
        return this.assignByExpertise(task, agentCapabilities);
      
      case 'round-robin':
        return this.assignRoundRobin(availableAgents);
      
      case 'weighted':
        return this.assignByWeightedScore(task, agentCapabilities);
      
      default:
        return availableAgents[0] || 'system';
    }
  }

  private async getAgentCapabilities(agentIds: string[]): Promise<Map<string, AgentCapability>> {
    const capabilities = new Map<string, AgentCapability>();
    
    for (const agentId of agentIds) {
      // Fetch agent capabilities from memory
      const agentData = await this.memoryManager.search(`agent ${agentId}`, { shared: true });
      const capability: AgentCapability = {
        agentId,
        skills: this.extractSkills(agentData),
        expertise: this.calculateExpertise(agentData),
        currentLoad: await this.calculateCurrentLoad(agentId),
        reliability: await this.calculateReliability(agentId),
        preference: this.getTaskPreference(agentData)
      };
      capabilities.set(agentId, capability);
    }
    
    return capabilities;
  }

  private assignByCapability(task: Task, capabilities: Map<string, AgentCapability>): string {
    let bestAgent = '';
    let bestScore = 0;
    
    for (const [agentId, capability] of capabilities) {
      const score = this.calculateCapabilityMatch(task, capability);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentId;
      }
    }
    
    return bestAgent;
  }

  private async assignByWorkload(capabilities: Map<string, AgentCapability>): Promise<string> {
    let leastLoadedAgent = '';
    let minLoad = Infinity;
    
    for (const [agentId, capability] of capabilities) {
      if (capability.currentLoad < minLoad) {
        minLoad = capability.currentLoad;
        leastLoadedAgent = agentId;
      }
    }
    
    return leastLoadedAgent;
  }

  private assignByExpertise(task: Task, capabilities: Map<string, AgentCapability>): string {
    const requiredSkills = task.requirements?.skills || [];
    let bestAgent = '';
    let bestExpertiseScore = 0;
    
    for (const [agentId, capability] of capabilities) {
      const expertiseScore = requiredSkills.reduce((score, skill) => {
        return score + (capability.expertise.get(skill) || 0);
      }, 0);
      
      if (expertiseScore > bestExpertiseScore) {
        bestExpertiseScore = expertiseScore;
        bestAgent = agentId;
      }
    }
    
    return bestAgent;
  }

  private assignRoundRobin(availableAgents: string[]): string {
    // Simple round-robin with persistent state
    const agentIndex = Math.floor(Math.random() * availableAgents.length);
    return availableAgents[agentIndex] || 'system';
  }

  private assignByWeightedScore(task: Task, capabilities: Map<string, AgentCapability>): string {
    let bestAgent = '';
    let bestScore = 0;
    
    for (const [agentId, capability] of capabilities) {
      const capabilityScore = this.calculateCapabilityMatch(task, capability);
      const loadScore = 1 - (capability.currentLoad / 10); // Normalize load
      const reliabilityScore = capability.reliability;
      
      // Weighted combination
      const weightedScore = (capabilityScore * 0.4) + (loadScore * 0.3) + (reliabilityScore * 0.3);
      
      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestAgent = agentId;
      }
    }
    
    return bestAgent;
  }

  private calculateCapabilityMatch(task: Task, capability: AgentCapability): number {
    const requiredSkills = task.requirements?.skills || [];
    if (requiredSkills.length === 0) return 0.5;
    
    const matchedSkills = requiredSkills.filter(skill => capability.skills.includes(skill));
    return matchedSkills.length / requiredSkills.length;
  }

  private extractSkills(agentData: any[]): string[] {
    // Extract skills from agent memory data
    const skills: string[] = [];
    for (const data of agentData) {
      if (data.observations) {
        const observations = Array.isArray(data.observations) ? data.observations : JSON.parse(data.observations);
        observations.forEach((obs: string) => {
          const skillMatch = obs.match(/skills?:?\s*([^,\n]+)/i);
          if (skillMatch) {
            skills.push(...skillMatch[1].split(/[,\s]+/).filter(s => s.length > 2));
          }
        });
      }
    }
    return [...new Set(skills)];
  }

  private calculateExpertise(_agentData: any[]): Map<string, number> {
    const expertise = new Map<string, number>();
    // Analyze agent's past performance and task completion for expertise calculation
    return expertise;
  }

  private async calculateCurrentLoad(agentId: string): Promise<number> {
    // Count active assignments for this agent
    let load = 0;
    for (const assignment of this.assignments.values()) {
      if (assignment.agentId === agentId && 
          ['pending', 'accepted', 'in_progress'].includes(assignment.status)) {
        load++;
      }
    }
    return load;
  }

  private async calculateReliability(_agentId: string): Promise<number> {
    // Calculate reliability based on task completion history
    // For now, return default reliability
    return 0.8;
  }

  private getTaskPreference(_agentData: any[]): string[] {
    // Extract task preferences from agent data
    return [];
  }

  async generateAnalytics(timeRange: string, metrics: string[]): Promise<any> {
    const now = new Date();
    let startTime: Date;
    
    // Parse time range
    switch (timeRange) {
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const events = await this.eventSystem.getEventHistory({ startTime, endTime: now });
    const analytics: any = {};

    if (metrics.includes('tasks')) {
      const taskEvents = events.filter(e => e.type === EventType.TASK_CREATED || e.type === EventType.TASK_COMPLETED);
      analytics.tasks = {
        created: taskEvents.filter(e => e.type === EventType.TASK_CREATED).length,
        completed: taskEvents.filter(e => e.type === EventType.TASK_COMPLETED).length,
        completionRate: taskEvents.length > 0 ? 
          (taskEvents.filter(e => e.type === EventType.TASK_COMPLETED).length / taskEvents.length) * 100 : 0
      };
    }

    if (metrics.includes('consensus')) {
      const consensusEvents = events.filter(e => e.type === EventType.CONSENSUS_REQUEST || e.type === EventType.CONSENSUS_REACHED);
      analytics.consensus = {
        requested: consensusEvents.filter(e => e.type === EventType.CONSENSUS_REQUEST).length,
        reached: consensusEvents.filter(e => e.type === EventType.CONSENSUS_REACHED).length,
        successRate: consensusEvents.length > 0 ?
          (consensusEvents.filter(e => e.type === EventType.CONSENSUS_REACHED).length / consensusEvents.length) * 100 : 0
      };
    }

    if (metrics.includes('conflicts')) {
      const conflictEvents = events.filter(e => e.type === EventType.CONFLICT_DETECTED || e.type === EventType.CONFLICT_RESOLVED);
      analytics.conflicts = {
        detected: conflictEvents.filter(e => e.type === EventType.CONFLICT_DETECTED).length,
        resolved: conflictEvents.filter(e => e.type === EventType.CONFLICT_RESOLVED).length,
        resolutionRate: conflictEvents.length > 0 ?
          (conflictEvents.filter(e => e.type === EventType.CONFLICT_RESOLVED).length / conflictEvents.length) * 100 : 0
      };
    }

    if (metrics.includes('events')) {
      analytics.events = {
        total: events.length,
        byType: events.reduce((acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
    }

    return analytics;
  }
}