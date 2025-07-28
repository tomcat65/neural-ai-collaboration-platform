/**
 * Claude Code Integration
 * Enhanced collaboration features for real-time development with Claude Code CLI
 */

import { EventEmitter } from 'events';
import { MCPBridge } from './core/mcp-bridge.js';
import { ClaudeAdapter } from './providers/claude-adapter.js';
import {
  AgentProvider,
  AgentRole,
  MessageType,
  MCPMessage,
  AgentIdentifier,
  TaskRequest,
  TaskResponse
} from './types/index.js';

interface ProjectContext {
  projectId: string;
  workingDirectory: string;
  gitBranch: string;
  activeFiles: string[];
  collaborators: AgentIdentifier[];
  objectives: string[];
  currentPhase: 'planning' | 'implementation' | 'review' | 'deployment';
}

interface CodeCollaborationRequest {
  requestId: string;
  type: 'code-review' | 'implementation' | 'debugging' | 'architecture' | 'documentation';
  context: {
    files: string[];
    description: string;
    requirements?: string[];
    constraints?: string[];
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  deadline?: Date;
}

export class ClaudeCodeIntegration extends EventEmitter {
  private bridge: MCPBridge;
  private claudeAdapter: ClaudeAdapter;
  private projectContext: ProjectContext | null = null;
  private activeCollaborations: Map<string, CodeCollaborationRequest> = new Map();
  private realTimeMemory: Map<string, any> = new Map();

  constructor() {
    super();
    
    // Initialize MCP Bridge with Claude Code specific configuration
    this.bridge = new MCPBridge({
      enableLogging: true,
      enableMetrics: true,
      routingStrategy: 'skill-based',
      maxRetries: 3,
      messageTimeout: 30000,
      heartbeatInterval: 15000 // More frequent for real-time work
    });

    // Initialize Claude adapter optimized for code collaboration
    this.claudeAdapter = new ClaudeAdapter({
      model: 'claude-sonnet-4',
      maxTokens: 8192,
      timeout: 60000 // Longer timeout for complex code analysis
    });

    this.setupBridge();
    this.setupEventHandlers();
  }

  private async setupBridge(): Promise<void> {
    // Register Claude adapter with the bridge
    this.bridge.registerAdapter(this.claudeAdapter);

    // Add Claude Code specific routing rules
    this.bridge.addRoutingRule({
      id: 'claude-code-orchestrator',
      name: 'Route to Claude for strategic tasks',
      condition: {
        messageType: [MessageType.TASK_REQUEST],
        skills: ['strategic-planning', 'architecture', 'code-review', 'project-coordination']
      },
      target: AgentRole.ORCHESTRATOR,
      priority: 10,
      enabled: true
    });

    // Start the bridge
    await this.bridge.start();

    // Register as Claude Code orchestrator
    await this.bridge.registerAgent({
      agent: {
        id: 'claude-code-orchestrator',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR,
        instance: 'claude-code-cli'
      },
      capabilities: {
        mcpNative: true,
        supportedProtocols: ['mcp', 'http', 'file-system'],
        specializations: [
          'strategic-planning',
          'code-analysis',
          'architecture-design', 
          'project-coordination',
          'real-time-collaboration',
          'git-workflow',
          'ci-cd-integration'
        ],
        maxContextWindow: 200000,
        costPerToken: 0.000003, // Claude Sonnet pricing
        responseTime: 2000
      },
      status: 'online',
      lastSeen: new Date()
    });

    console.log('🎯 Claude Code Integration initialized');
  }

  private setupEventHandlers(): void {
    // Handle incoming collaboration requests
    this.bridge.on('messageReceived', async (message: MCPMessage) => {
      await this.handleIncomingMessage(message);
    });

    // Handle task completions
    this.bridge.on('taskCompleted', async (taskId: string, result: any) => {
      await this.handleTaskCompletion(taskId, result);
    });

    // Handle errors
    this.bridge.on('error', ({ message, error }) => {
      console.error(`❌ Claude Code Integration error: ${error.message}`);
      this.emit('collaborationError', { message, error });
    });
  }

  /**
   * Initialize project context for collaboration
   */
  async initializeProject(context: ProjectContext): Promise<void> {
    this.projectContext = context;
    
    // Store project context in shared memory
    const contextMessage: MCPMessage = {
      id: `project-init-${Date.now()}`,
      from: {
        id: 'claude-code-orchestrator',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR
      },
      to: undefined, // Broadcast to all agents
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.KNOWLEDGE_SHARE,
      content: {
        type: 'project-context',
        context,
        title: `Project Context: ${context.projectId}`,
        summary: `Initialized collaboration context for ${context.projectId}`,
        tags: ['project-context', 'initialization', context.currentPhase]
      },
      metadata: {
        priority: 'high',
        tags: ['project-setup', 'collaboration-init']
      }
    };

    await this.bridge.send(contextMessage);
    
    // Update real-time memory
    this.realTimeMemory.set(`project:${context.projectId}`, context);
    
    console.log(`🚀 Project initialized: ${context.projectId}`);
    this.emit('projectInitialized', context);
  }

  /**
   * Request code collaboration from AI agents
   */
  async requestCollaboration(request: CodeCollaborationRequest): Promise<string> {
    const taskRequest: TaskRequest = {
      taskId: request.requestId,
      description: `${request.type}: ${request.context.description}`,
      requirements: {
        skills: this.getSkillsForCollaborationType(request.type),
        tools: ['code-analysis', 'git', 'file-system'],
        constraints: request.context.constraints || []
      },
      expectedDuration: this.getExpectedDuration(request.type),
      deadline: request.deadline
    };

    const message: MCPMessage = {
      id: `collab-${request.requestId}`,
      from: {
        id: 'claude-code-orchestrator',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR
      },
      to: undefined, // Let routing decide best agent
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.TASK_REQUEST,
      content: {
        ...taskRequest,
        collaborationType: request.type,
        context: request.context,
        projectContext: this.projectContext
      },
      metadata: {
        priority: request.priority,
        requiresAck: true,
        correlationId: request.requestId,
        tags: ['code-collaboration', request.type]
      }
    };

    // Store active collaboration
    this.activeCollaborations.set(request.requestId, request);

    // Send collaboration request
    await this.bridge.send(message);
    
    console.log(`📋 Collaboration requested: ${request.type} (${request.requestId})`);
    this.emit('collaborationRequested', request);
    
    return request.requestId;
  }

  /**
   * Share real-time development updates
   */
  async shareDevUpdate(update: {
    type: 'file-changed' | 'git-commit' | 'test-result' | 'build-status' | 'milestone-reached';
    details: any;
    affectedFiles?: string[];
    impact: 'low' | 'medium' | 'high';
  }): Promise<void> {
    const message: MCPMessage = {
      id: `update-${Date.now()}`,
      from: {
        id: 'claude-code-orchestrator',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR
      },
      to: undefined, // Broadcast to all collaborators
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.STATUS_UPDATE,
      content: {
        updateType: update.type,
        details: update.details,
        affectedFiles: update.affectedFiles,
        impact: update.impact,
        projectContext: this.projectContext,
        timestamp: new Date().toISOString()
      },
      metadata: {
        priority: update.impact === 'high' ? 'high' : 'medium',
        tags: ['dev-update', update.type]
      }
    };

    await this.bridge.send(message);
    
    // Update real-time memory
    const updateKey = `update:${update.type}:${Date.now()}`;
    this.realTimeMemory.set(updateKey, update);
    
    console.log(`📡 Development update shared: ${update.type}`);
    this.emit('devUpdateShared', update);
  }

  /**
   * Request consensus on technical decisions
   */
  async requestConsensus(decision: {
    title: string;
    description: string;
    options: string[];
    context?: any;
    impact: 'low' | 'medium' | 'high' | 'critical';
    deadline?: Date;
  }): Promise<string> {
    const consensusId = `consensus-${Date.now()}`;
    
    const message: MCPMessage = {
      id: consensusId,
      from: {
        id: 'claude-code-orchestrator',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR
      },
      to: undefined, // All collaborators participate
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.CONSENSUS_REQUEST,
      content: {
        consensusId,
        title: decision.title,
        description: decision.description,
        options: decision.options,
        context: decision.context,
        impact: decision.impact,
        deadline: decision.deadline,
        projectContext: this.projectContext
      },
      metadata: {
        priority: decision.impact === 'critical' ? 'critical' : 'high',
        requiresAck: true,
        tags: ['consensus', 'technical-decision']
      }
    };

    await this.bridge.send(message);
    
    console.log(`🗳️ Consensus requested: ${decision.title}`);
    this.emit('consensusRequested', { consensusId, decision });
    
    return consensusId;
  }

  /**
   * Get current collaboration status
   */
  getCollaborationStatus(): {
    activeCollaborations: number;
    projectContext: ProjectContext | null;
    recentUpdates: number;
    agentCount: number;
  } {
    return {
      activeCollaborations: this.activeCollaborations.size,
      projectContext: this.projectContext,
      recentUpdates: Array.from(this.realTimeMemory.keys())
        .filter(key => key.startsWith('update:')).length,
      agentCount: this.bridge.getAgents().length
    };
  }

  /**
   * Get metrics for collaboration effectiveness
   */
  getCollaborationMetrics(): {
    bridgeMetrics: any;
    responseTime: number;
    completionRate: number;
    errorRate: number;
  } {
    const bridgeMetrics = this.bridge.getMetrics();
    
    return {
      bridgeMetrics,
      responseTime: bridgeMetrics.averageLatency,
      completionRate: bridgeMetrics.taskCompletionRate,
      errorRate: bridgeMetrics.errorRate
    };
  }

  private async handleIncomingMessage(message: MCPMessage): Promise<void> {
    switch (message.type) {
      case MessageType.TASK_RESPONSE:
        await this.handleTaskResponse(message);
        break;
      case MessageType.CONSENSUS_VOTE:
        await this.handleConsensusVote(message);
        break;
      case MessageType.KNOWLEDGE_SHARE:
        await this.handleKnowledgeShare(message);
        break;
    }
  }

  private async handleTaskResponse(message: MCPMessage): Promise<void> {
    const response = message.content as TaskResponse;
    const collaboration = this.activeCollaborations.get(response.taskId);
    
    if (collaboration) {
      console.log(`✅ Collaboration completed: ${collaboration.type} (${response.status})`);
      this.emit('collaborationCompleted', { collaboration, response });
      
      if (response.status === 'completed') {
        this.activeCollaborations.delete(response.taskId);
      }
    }
  }

  private async handleConsensusVote(message: MCPMessage): Promise<void> {
    const vote = message.content;
    console.log(`🗳️ Consensus vote received: ${vote.option} (${message.from.id})`);
    this.emit('consensusVote', vote);
  }

  private async handleKnowledgeShare(message: MCPMessage): Promise<void> {
    const knowledge = message.content;
    
    // Store in real-time memory
    const knowledgeKey = `knowledge:${Date.now()}`;
    this.realTimeMemory.set(knowledgeKey, knowledge);
    
    console.log(`🧠 Knowledge shared: ${knowledge.title}`);
    this.emit('knowledgeShared', knowledge);
  }

  private async handleTaskCompletion(taskId: string, result: any): Promise<void> {
    console.log(`🎯 Task completed: ${taskId}`);
    this.emit('taskCompleted', { taskId, result });
  }

  private getSkillsForCollaborationType(type: string): string[] {
    const skillMap: Record<string, string[]> = {
      'code-review': ['code-analysis', 'best-practices', 'security-review'],
      'implementation': ['coding', 'algorithm-design', 'testing'],
      'debugging': ['debugging', 'error-analysis', 'problem-solving'],
      'architecture': ['system-design', 'architecture', 'scalability'],
      'documentation': ['technical-writing', 'documentation', 'knowledge-transfer']
    };
    
    return skillMap[type] || ['general-development'];
  }

  private getExpectedDuration(type: string): number {
    const durationMap: Record<string, number> = {
      'code-review': 30 * 60 * 1000, // 30 minutes
      'implementation': 2 * 60 * 60 * 1000, // 2 hours
      'debugging': 60 * 60 * 1000, // 1 hour
      'architecture': 90 * 60 * 1000, // 90 minutes
      'documentation': 45 * 60 * 1000 // 45 minutes
    };
    
    return durationMap[type] || 60 * 60 * 1000; // Default 1 hour
  }

  /**
   * Clean shutdown
   */
  async shutdown(): Promise<void> {
    await this.bridge.stop();
    this.realTimeMemory.clear();
    this.activeCollaborations.clear();
    console.log('🛑 Claude Code Integration stopped');
  }
}

export default ClaudeCodeIntegration;