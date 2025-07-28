/**
 * MCP Bridge - Multi-Agent Communication Platform
 * Main entry point for the agents bridge implementation
 */

export * from './types';
export * from './core/mcp-bridge';
export * from './registry/agent-registry';
export * from './routing/message-router';
export * from './monitoring/metrics-collector';
export * from './providers/claude-adapter';

// Re-export commonly used types and enums
export type {
  MCPMessage,
  AgentIdentifier,
  AgentRegistration,
  ProviderAdapter,
  BridgeConfiguration
} from './types';

export {
  AgentProvider,
  AgentRole,
  MessageType
} from './types';

// Main bridge class
export { MCPBridge } from './core/mcp-bridge';

// Convenience factory functions
import { MCPBridge } from './core/mcp-bridge';
import { ClaudeAdapter } from './providers/claude-adapter';
import { BridgeConfiguration, RoutingRule, MessageType, AgentRole } from './types';

/**
 * Create a new MCP Bridge instance with default configuration
 */
export function createMCPBridge(config?: Partial<BridgeConfiguration>): MCPBridge {
  return new MCPBridge(config);
}

/**
 * Create a Claude adapter with configuration
 */
export function createClaudeAdapter(config?: {
  apiKey?: string;
  mcpServerUrl?: string;
  maxTokens?: number;
  model?: string;
}): ClaudeAdapter {
  return new ClaudeAdapter(config);
}

/**
 * Create default routing rules for common scenarios
 */
export function createDefaultRoutingRules(): RoutingRule[] {
  return [
    {
      id: 'task-to-implementer',
      name: 'Route implementation tasks to implementer agents',
      condition: {
        messageType: [MessageType.TASK_REQUEST],
        skills: ['implementation', 'coding', 'development']
      },
      target: AgentRole.IMPLEMENTER,
      priority: 80,
      enabled: true
    },
    {
      id: 'research-to-researcher',
      name: 'Route research tasks to researcher agents',
      condition: {
        messageType: [MessageType.TASK_REQUEST],
        skills: ['research', 'analysis', 'investigation']
      },
      target: AgentRole.RESEARCHER,
      priority: 80,
      enabled: true
    },
    {
      id: 'consensus-to-orchestrator',
      name: 'Route consensus requests to orchestrator',
      condition: {
        messageType: [MessageType.CONSENSUS_REQUEST]
      },
      target: AgentRole.ORCHESTRATOR,
      priority: 90,
      enabled: true
    },
    {
      id: 'knowledge-to-specialist',
      name: 'Route specialized knowledge to specialists',
      condition: {
        messageType: [MessageType.KNOWLEDGE_SHARE],
        skills: ['specialized', 'expert', 'domain-specific']
      },
      target: AgentRole.SPECIALIST,
      priority: 70,
      enabled: true
    }
  ];
}

/**
 * Quick setup function for development/testing
 */
export async function setupDevelopmentBridge(): Promise<MCPBridge> {
  const bridge = createMCPBridge({
    enableLogging: true,
    enableMetrics: true,
    routingStrategy: 'skill-based'
  });

  // Add Claude adapter
  const claudeAdapter = createClaudeAdapter();
  bridge.registerAdapter(claudeAdapter);

  // Add default routing rules
  const defaultRules = createDefaultRoutingRules();
  defaultRules.forEach(rule => bridge.addRoutingRule(rule));

  // Register Claude as orchestrator
  await bridge.registerAgent({
    agent: {
      id: 'claude-orchestrator',
      provider: 'claude' as any,
      role: 'orchestrator' as any,
      instance: 'primary'
    },
    capabilities: claudeAdapter.getCapabilities(),
    status: 'online',
    lastSeen: new Date()
  });

  return bridge;
}

/**
 * Integration with existing unified server
 */
export class MCPBridgeIntegration {
  private bridge: MCPBridge;

  constructor(bridge: MCPBridge) {
    this.bridge = bridge;
  }

  /**
   * Register with existing collaboration system
   */
  async integrateWithUnifiedServer(unifiedServer: any): Promise<void> {
    // Add MCP Bridge endpoints to existing server
    this.addBridgeEndpoints(unifiedServer);
    
    // Connect bridge events to unified server events
    this.connectEvents(unifiedServer);
    
    // Start the bridge
    await this.bridge.start();
  }

  /**
   * Add REST endpoints for bridge management
   */
  private addBridgeEndpoints(server: any): void {
    // Register agent endpoint
    server.post('/api/mcp-bridge/agents/register', async (req: any, res: any) => {
      try {
        await this.bridge.registerAgent(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Send message endpoint
    server.post('/api/mcp-bridge/messages/send', async (req: any, res: any) => {
      try {
        await this.bridge.send(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Get metrics endpoint
    server.get('/api/mcp-bridge/metrics', (req: any, res: any) => {
      const metrics = this.bridge.getMetrics();
      res.json(metrics);
    });

    // Get agents endpoint
    server.get('/api/mcp-bridge/agents', (req: any, res: any) => {
      const agents = this.bridge.getAgents();
      res.json(agents);
    });

    // Add routing rule endpoint
    server.post('/api/mcp-bridge/routing/rules', (req: any, res: any) => {
      try {
        this.bridge.addRoutingRule(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });
  }

  /**
   * Connect bridge events to unified server
   */
  private connectEvents(server: any): void {
    // Forward bridge messages to WebSocket clients
    this.bridge.on('messageReceived', (message) => {
      if (server.broadcast) {
        server.broadcast('mcp-bridge:message', message);
      }
    });

    // Forward agent events
    this.bridge.on('agentRegistered', (agent) => {
      if (server.broadcast) {
        server.broadcast('mcp-bridge:agent-registered', agent);
      }
    });

    this.bridge.on('agentUnregistered', (agentId) => {
      if (server.broadcast) {
        server.broadcast('mcp-bridge:agent-unregistered', { agentId });
      }
    });

    // Forward error events
    this.bridge.on('error', (error) => {
      console.error('MCP Bridge Error:', error);
      if (server.broadcast) {
        server.broadcast('mcp-bridge:error', error);
      }
    });
  }
}

/**
 * Example usage for integration
 */
export const exampleUsage = {
  basicSetup: `
    import { createMCPBridge, createClaudeAdapter } from './mcp-bridge';
    
    // Create bridge
    const bridge = createMCPBridge();
    
    // Add Claude adapter
    const claudeAdapter = createClaudeAdapter({ apiKey: 'your-key' });
    bridge.registerAdapter(claudeAdapter);
    
    // Start bridge
    await bridge.start();
  `,
  
  sendingMessages: `
    // Send a task request
    await bridge.send({
      id: 'task-123',
      from: { id: 'user', provider: 'custom', role: 'orchestrator' },
      to: { id: 'claude-agent', provider: 'claude', role: 'implementer' },
      timestamp: new Date(),
      protocol: 'mcp',
      type: 'task_request',
      content: {
        taskId: 'implement-feature',
        description: 'Build user authentication system',
        requirements: {
          skills: ['nodejs', 'authentication', 'security']
        }
      }
    });
  `,
  
  handlingResponses: `
    // Listen for responses
    bridge.on('messageReceived', (message) => {
      if (message.type === 'task_response') {
        console.log('Task completed:', message.content);
      }
    });
  `
};