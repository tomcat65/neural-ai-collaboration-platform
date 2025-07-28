/**
 * MCP Bridge Integration with Unified Server
 * Integrates the MCP Bridge with the existing Neural AI Collaboration Platform
 */

import {
  MCPBridge,
  createMCPBridge,
  createClaudeAdapter,
  createDefaultRoutingRules,
  MCPBridgeIntegration,
  MessageType,
  AgentProvider,
  AgentRole,
  MCPMessage
} from '../mcp-bridge';

export class UnifiedServerMCPIntegration {
  private bridge: MCPBridge;
  private integration: MCPBridgeIntegration;
  private isInitialized: boolean = false;

  constructor() {
    // Create bridge with production configuration
    this.bridge = createMCPBridge({
      enableLogging: true,
      enableMetrics: true,
      routingStrategy: 'skill-based',
      maxRetries: 3,
      messageTimeout: 30000,
      heartbeatInterval: 60000
    });

    this.integration = new MCPBridgeIntegration(this.bridge);
  }

  /**
   * Initialize the MCP Bridge integration
   */
  async initialize(unifiedServer: any): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🔗 Initializing MCP Bridge integration...');

    try {
      // Set up adapters
      await this.setupAdapters();

      // Set up routing rules
      this.setupRoutingRules();

      // Set up event handlers
      this.setupEventHandlers();

      // Integrate with unified server
      await this.integration.integrateWithUnifiedServer(unifiedServer);

      // Register bridge as a service in the unified server
      this.registerBridgeService(unifiedServer);

      this.isInitialized = true;
      console.log('✅ MCP Bridge integration initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MCP Bridge integration:', error);
      throw error;
    }
  }

  /**
   * Set up provider adapters
   */
  private async setupAdapters(): Promise<void> {
    console.log('📡 Setting up provider adapters...');

    // Claude adapter (native MCP support)
    const claudeAdapter = createClaudeAdapter({
      model: 'claude-3-opus',
      maxTokens: 4096
    });
    this.bridge.registerAdapter(claudeAdapter);

    // Register Claude agent
    await this.bridge.registerAgent({
      agent: {
        id: 'claude-primary',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR,
        instance: 'production'
      },
      capabilities: claudeAdapter.getCapabilities(),
      status: 'online',
      lastSeen: new Date()
    });

    console.log('✅ Claude adapter registered');

    // TODO: Add other provider adapters (OpenAI, Gemini, etc.)
    // This would be implemented in Phase 2
  }

  /**
   * Set up routing rules
   */
  private setupRoutingRules(): void {
    console.log('🚦 Setting up routing rules...');

    // Add default routing rules
    const defaultRules = createDefaultRoutingRules();
    defaultRules.forEach(rule => this.bridge.addRoutingRule(rule));

    // Add custom rules for unified server integration
    this.bridge.addRoutingRule({
      id: 'memory-storage-to-claude',
      name: 'Route memory storage requests to Claude',
      condition: {
        messageType: [MessageType.TASK_REQUEST],
        skills: ['memory-management', 'knowledge-organization']
      },
      target: {
        id: 'claude-primary',
        provider: AgentProvider.CLAUDE,
        role: AgentRole.ORCHESTRATOR
      },
      priority: 85,
      enabled: true
    });

    this.bridge.addRoutingRule({
      id: 'collaboration-coordination',
      name: 'Route collaboration tasks to orchestrator',
      condition: {
        messageType: [MessageType.TASK_REQUEST],
        skills: ['collaboration', 'coordination', 'task-management']
      },
      target: AgentRole.ORCHESTRATOR,
      priority: 90,
      enabled: true
    });

    console.log('✅ Routing rules configured');
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Handle incoming messages and route to appropriate unified server components
    this.bridge.on('messageReceived', async (message: MCPMessage) => {
      await this.handleIncomingMessage(message);
    });

    // Handle task responses and update unified server state
    this.bridge.on('message:task_response', async (message: MCPMessage) => {
      await this.handleTaskResponse(message);
    });

    // Handle knowledge sharing and update memory system
    this.bridge.on('message:knowledge_share', async (message: MCPMessage) => {
      await this.handleKnowledgeShare(message);
    });

    // Handle consensus requests
    this.bridge.on('message:consensus_request', async (message: MCPMessage) => {
      await this.handleConsensusRequest(message);
    });
  }

  /**
   * Register bridge as a service in unified server
   */
  private registerBridgeService(unifiedServer: any): void {
    // Add bridge status to health check
    if (unifiedServer.healthCheck) {
      unifiedServer.healthCheck.addService('mcp-bridge', () => {
        const metrics = this.bridge.getMetrics();
        const agents = this.bridge.getAgents().filter(a => a.status === 'online');
        
        return {
          status: agents.length > 0 ? 'healthy' : 'warning',
          details: {
            activeAgents: agents.length,
            messagesProcessed: metrics.messagesProcessed,
            errorRate: metrics.errorRate
          }
        };
      });
    }

    // Add bridge methods to unified server context
    unifiedServer.mcpBridge = {
      sendMessage: (message: MCPMessage) => this.bridge.send(message),
      getMetrics: () => this.bridge.getMetrics(),
      getAgents: () => this.bridge.getAgents(),
      registerAgent: (agent: any) => this.bridge.registerAgent(agent)
    };
  }

  /**
   * Handle incoming messages from agents
   */
  private async handleIncomingMessage(message: MCPMessage): Promise<void> {
    console.log(`🔄 Processing message: ${message.type} from ${message.from.id}`);

    // Route to appropriate unified server component based on message type
    switch (message.type) {
      case MessageType.TASK_REQUEST:
        await this.routeToTaskManager(message);
        break;
      case MessageType.KNOWLEDGE_SHARE:
        await this.routeToMemorySystem(message);
        break;
      case MessageType.CONSENSUS_REQUEST:
        await this.routeToConsensusSystem(message);
        break;
      default:
        console.log(`Unhandled message type: ${message.type}`);
    }
  }

  /**
   * Handle task responses
   */
  private async handleTaskResponse(message: MCPMessage): Promise<void> {
    const response = message.content;
    console.log(`✅ Task completed: ${response.taskId} by ${message.from.id}`);

    // Update task status in unified server
    // This would integrate with the existing task management system
    try {
      // Example integration with existing API
      await fetch('http://localhost:3000/api/collaboration/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: response.taskId,
          status: response.status,
          result: response.result,
          completedBy: message.from.id,
          duration: response.duration
        })
      });
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  }

  /**
   * Handle knowledge sharing
   */
  private async handleKnowledgeShare(message: MCPMessage): Promise<void> {
    const knowledge = message.content;
    console.log(`📚 Knowledge shared: ${knowledge.title} by ${message.from.id}`);

    // Store in unified server memory system
    try {
      await fetch('http://localhost:3000/api/memory/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: message.from.id,
          memory: {
            content: knowledge.summary,
            type: 'knowledge',
            tags: knowledge.tags,
            metadata: {
              title: knowledge.title,
              insights: knowledge.insights,
              references: knowledge.references,
              sharedVia: 'mcp-bridge'
            }
          },
          scope: 'shared',
          type: 'knowledge'
        })
      });
    } catch (error) {
      console.error('Failed to store knowledge:', error);
    }
  }

  /**
   * Handle consensus requests
   */
  private async handleConsensusRequest(message: MCPMessage): Promise<void> {
    const request = message.content;
    console.log(`🗳️ Consensus requested: ${request.title} by ${message.from.id}`);

    // Create consensus vote in unified server
    try {
      await fetch('http://localhost:3000/api/collaboration/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'mcp-bridge-session',
          agentId: message.from.id,
          title: request.title,
          description: request.description,
          options: request.options,
          participants: request.participants,
          impact: request.impact,
          deadline: request.deadline
        })
      });
    } catch (error) {
      console.error('Failed to create consensus vote:', error);
    }
  }

  /**
   * Route to task manager
   */
  private async routeToTaskManager(message: MCPMessage): Promise<void> {
    // Integrate with existing task management system
    const taskRequest = message.content;
    
    try {
      await fetch('http://localhost:3000/api/collaboration/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'mcp-bridge-session',
          agentId: message.from.id,
          description: taskRequest.description,
          requirements: taskRequest.requirements,
          metadata: {
            sourceMessage: message.id,
            viaAgent: message.from.id,
            bridgeRouted: true
          }
        })
      });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }

  /**
   * Route to memory system
   */
  private async routeToMemorySystem(message: MCPMessage): Promise<void> {
    // Already handled in handleKnowledgeShare
    await this.handleKnowledgeShare(message);
  }

  /**
   * Route to consensus system
   */
  private async routeToConsensusSystem(message: MCPMessage): Promise<void> {
    // Already handled in handleConsensusRequest
    await this.handleConsensusRequest(message);
  }

  /**
   * Send message through bridge from unified server
   */
  async sendMessageFromUnifiedServer(
    fromAgent: string,
    messageType: MessageType,
    content: any,
    targetAgent?: string
  ): Promise<void> {
    const message: MCPMessage = {
      id: `unified-${Date.now()}`,
      from: {
        id: fromAgent,
        provider: AgentProvider.CUSTOM,
        role: AgentRole.ORCHESTRATOR
      },
      to: targetAgent ? {
        id: targetAgent,
        provider: AgentProvider.CLAUDE, // Default to Claude for now
        role: AgentRole.ORCHESTRATOR
      } : undefined,
      timestamp: new Date(),
      protocol: 'mcp',
      type: messageType,
      content,
      metadata: {
        priority: 'medium',
        requiresAck: true,
        tags: ['unified-server']
      }
    };

    await this.bridge.send(message);
  }

  /**
   * Get bridge status for unified server
   */
  getBridgeStatus() {
    const metrics = this.bridge.getMetrics();
    const agents = this.bridge.getAgents();

    return {
      isInitialized: this.isInitialized,
      metrics,
      agents: agents.map(agent => ({
        id: agent.agent.id,
        provider: agent.agent.provider,
        role: agent.agent.role,
        status: agent.status,
        lastSeen: agent.lastSeen
      })),
      health: this.bridge.getMetrics()
    };
  }

  /**
   * Shutdown the bridge
   */
  async shutdown(): Promise<void> {
    if (this.isInitialized) {
      await this.bridge.stop();
      this.isInitialized = false;
      console.log('🛑 MCP Bridge integration shut down');
    }
  }
}

// Export singleton instance for unified server
export const mcpBridgeIntegration = new UnifiedServerMCPIntegration();