/**
 * MCP Bridge Demo
 * Demonstrates multi-agent collaboration through the MCP Bridge
 */

import {
  createMCPBridge,
  createClaudeAdapter,
  createDefaultRoutingRules,
  MCPBridge,
  MessageType,
  AgentProvider,
  AgentRole,
  MCPMessage
} from '../index';

/**
 * Demo: Setting up the agents bridge and simulating collaboration
 */
export async function runBridgeDemo(): Promise<void> {
  console.log('🚀 Starting MCP Bridge Demo...\n');

  // Step 1: Create and configure the bridge
  console.log('1. Creating MCP Bridge...');
  const bridge = createMCPBridge({
    enableLogging: true,
    enableMetrics: true,
    routingStrategy: 'skill-based',
    maxRetries: 3,
    messageTimeout: 30000
  });

  // Step 2: Set up event listeners
  setupEventListeners(bridge);

  // Step 3: Register Claude adapter
  console.log('2. Registering Claude adapter...');
  const claudeAdapter = createClaudeAdapter({
    model: 'claude-3-opus',
    maxTokens: 4096
  });
  
  bridge.registerAdapter(claudeAdapter);

  // Step 4: Add routing rules
  console.log('3. Adding routing rules...');
  const routingRules = createDefaultRoutingRules();
  routingRules.forEach(rule => bridge.addRoutingRule(rule));

  // Step 5: Start the bridge
  console.log('4. Starting bridge...');
  await bridge.start();

  // Step 6: Register agents
  console.log('5. Registering agents...');
  await registerDemoAgents(bridge);

  // Step 7: Simulate collaboration scenarios
  console.log('6. Running collaboration scenarios...\n');
  await simulateCollaborationScenarios(bridge);

  // Step 8: Show metrics
  console.log('7. Final metrics:');
  showMetrics(bridge);

  // Cleanup
  await bridge.stop();
  console.log('\n✅ Demo completed!');
}

/**
 * Set up event listeners for the bridge
 */
function setupEventListeners(bridge: MCPBridge): void {
  bridge.on('started', () => {
    console.log('✅ Bridge started successfully');
  });

  bridge.on('stopped', () => {
    console.log('🛑 Bridge stopped');
  });

  bridge.on('agentRegistered', (agent) => {
    console.log(`👤 Agent registered: ${agent.id} (${agent.provider}:${agent.role})`);
  });

  bridge.on('messageSent', (message) => {
    console.log(`📤 Message sent: ${message.type} from ${message.from.id}`);
  });

  bridge.on('messageReceived', (message) => {
    console.log(`📥 Message received: ${message.type} from ${message.from.id}`);
  });

  bridge.on('error', ({ message, error }) => {
    console.error(`❌ Error processing message ${message.id}: ${error.message}`);
  });
}

/**
 * Register demo agents
 */
async function registerDemoAgents(bridge: MCPBridge): Promise<void> {
  // Claude Orchestrator
  await bridge.registerAgent({
    agent: {
      id: 'claude-orchestrator',
      provider: AgentProvider.CLAUDE,
      role: AgentRole.ORCHESTRATOR,
      instance: 'primary'
    },
    capabilities: {
      mcpNative: true,
      supportedProtocols: ['mcp', 'http'],
      specializations: ['strategic-planning', 'project-coordination', 'decision-making'],
      maxContextWindow: 200000,
      costPerToken: 0.000015,
      responseTime: 2000
    },
    status: 'online',
    lastSeen: new Date()
  });

  // Simulated OpenAI Implementer (would be real in production)
  await bridge.registerAgent({
    agent: {
      id: 'openai-implementer',
      provider: AgentProvider.OPENAI,
      role: AgentRole.IMPLEMENTER,
      instance: 'gpt-4'
    },
    capabilities: {
      mcpNative: false,
      supportedProtocols: ['http', 'rest'],
      specializations: ['coding', 'implementation', 'debugging', 'testing'],
      maxContextWindow: 128000,
      costPerToken: 0.00003,
      responseTime: 3000
    },
    status: 'online',
    lastSeen: new Date()
  });

  // Simulated Gemini Researcher
  await bridge.registerAgent({
    agent: {
      id: 'gemini-researcher',
      provider: AgentProvider.GEMINI,
      role: AgentRole.RESEARCHER,
      instance: 'gemini-pro'
    },
    capabilities: {
      mcpNative: false,
      supportedProtocols: ['http', 'grpc'],
      specializations: ['research', 'analysis', 'data-processing', 'insights'],
      maxContextWindow: 32000,
      costPerToken: 0.0000005,
      responseTime: 1500
    },
    status: 'online',
    lastSeen: new Date()
  });
}

/**
 * Simulate various collaboration scenarios
 */
async function simulateCollaborationScenarios(bridge: MCPBridge): Promise<void> {
  console.log('\n🎭 Scenario 1: Strategic Planning Task');
  await simulateStrategicPlanningTask(bridge);

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n🎭 Scenario 2: Research and Analysis');
  await simulateResearchTask(bridge);

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n🎭 Scenario 3: Implementation Task');
  await simulateImplementationTask(bridge);

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n🎭 Scenario 4: Knowledge Sharing');
  await simulateKnowledgeSharing(bridge);
}

/**
 * Simulate strategic planning task
 */
async function simulateStrategicPlanningTask(bridge: MCPBridge): Promise<void> {
  const message: MCPMessage = {
    id: `strategic-task-${Date.now()}`,
    from: {
      id: 'demo-user',
      provider: AgentProvider.CUSTOM,
      role: AgentRole.ORCHESTRATOR
    },
    to: undefined, // Let routing decide
    timestamp: new Date(),
    protocol: 'mcp',
    type: MessageType.TASK_REQUEST,
    content: {
      taskId: 'strategic-planning-001',
      description: 'Create a comprehensive strategy for implementing multi-agent collaboration',
      requirements: {
        skills: ['strategic-planning', 'project-coordination'],
        tools: ['analysis', 'planning'],
        constraints: ['timeline: 2 weeks', 'budget: $50k']
      },
      expectedDuration: 3600000, // 1 hour
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    },
    metadata: {
      priority: 'high',
      requiresAck: true,
      tags: ['strategy', 'planning', 'multi-agent']
    }
  };

  await bridge.send(message);
}

/**
 * Simulate research task
 */
async function simulateResearchTask(bridge: MCPBridge): Promise<void> {
  const message: MCPMessage = {
    id: `research-task-${Date.now()}`,
    from: {
      id: 'claude-orchestrator',
      provider: AgentProvider.CLAUDE,
      role: AgentRole.ORCHESTRATOR
    },
    to: undefined,
    timestamp: new Date(),
    protocol: 'mcp',
    type: MessageType.TASK_REQUEST,
    content: {
      taskId: 'research-001',
      description: 'Research best practices for AI agent communication protocols',
      requirements: {
        skills: ['research', 'analysis', 'protocol-design'],
        tools: ['web-search', 'document-analysis'],
        constraints: ['academic sources preferred']
      }
    },
    metadata: {
      priority: 'medium',
      tags: ['research', 'protocols', 'ai-agents']
    }
  };

  await bridge.send(message);
}

/**
 * Simulate implementation task
 */
async function simulateImplementationTask(bridge: MCPBridge): Promise<void> {
  const message: MCPMessage = {
    id: `impl-task-${Date.now()}`,
    from: {
      id: 'gemini-researcher',
      provider: AgentProvider.GEMINI,
      role: AgentRole.RESEARCHER
    },
    to: undefined,
    timestamp: new Date(),
    protocol: 'mcp',
    type: MessageType.TASK_REQUEST,
    content: {
      taskId: 'implementation-001',
      description: 'Implement WebSocket adapter for real-time agent communication',
      requirements: {
        skills: ['coding', 'websockets', 'real-time-communication'],
        tools: ['typescript', 'nodejs', 'websocket-api'],
        constraints: ['must support reconnection', 'handle 1000+ concurrent connections']
      }
    },
    metadata: {
      priority: 'high',
      tags: ['implementation', 'websockets', 'real-time']
    }
  };

  await bridge.send(message);
}

/**
 * Simulate knowledge sharing
 */
async function simulateKnowledgeSharing(bridge: MCPBridge): Promise<void> {
  const message: MCPMessage = {
    id: `knowledge-${Date.now()}`,
    from: {
      id: 'openai-implementer',
      provider: AgentProvider.OPENAI,
      role: AgentRole.IMPLEMENTER
    },
    to: undefined,
    timestamp: new Date(),
    protocol: 'mcp',
    type: MessageType.KNOWLEDGE_SHARE,
    content: {
      title: 'WebSocket Implementation Patterns',
      summary: 'Best practices for implementing scalable WebSocket connections',
      insights: [
        'Use connection pooling for high throughput',
        'Implement heartbeat mechanism for connection health',
        'Handle reconnection with exponential backoff'
      ],
      tags: ['websockets', 'scalability', 'best-practices'],
      references: ['RFC 6455', 'WebSocket API Specification']
    },
    metadata: {
      priority: 'medium',
      tags: ['knowledge', 'websockets', 'implementation']
    }
  };

  await bridge.send(message);
}

/**
 * Show current metrics
 */
function showMetrics(bridge: MCPBridge): void {
  const metrics = bridge.getMetrics();
  const agents = bridge.getAgents();

  console.log('\n📊 Bridge Metrics:');
  console.log(`  Messages Processed: ${metrics.messagesProcessed}`);
  console.log(`  Average Latency: ${metrics.averageLatency.toFixed(2)}ms`);
  console.log(`  Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
  console.log(`  Active Agents: ${metrics.activeAgents}`);
  console.log(`  Task Completion Rate: ${(metrics.taskCompletionRate * 100).toFixed(2)}%`);
  if (metrics.costPerTask) {
    console.log(`  Cost Per Task: $${metrics.costPerTask.toFixed(6)}`);
  }

  console.log('\n👥 Registered Agents:');
  agents.forEach(agent => {
    console.log(`  ${agent.agent.id}: ${agent.status} (${agent.agent.provider})`);
  });
}

/**
 * Run the demo if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runBridgeDemo().catch(console.error);
}

export default runBridgeDemo;