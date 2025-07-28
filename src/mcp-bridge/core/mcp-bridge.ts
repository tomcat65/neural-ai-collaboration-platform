/**
 * MCP Bridge Core
 * Central hub for multi-agent communication and coordination
 */

import { EventEmitter } from 'events';
import {
  AgentProvider,
  AgentIdentifier,
  MCPMessage,
  MessageType,
  ProviderAdapter,
  AgentRegistration,
  BridgeConfiguration,
  RoutingRule,
  MetricsData
} from '../types';
import { MessageRouter } from '../routing/message-router';
import { AgentRegistry } from '../registry/agent-registry';
import { MetricsCollector } from '../monitoring/metrics-collector';

export class MCPBridge extends EventEmitter {
  private adapters: Map<AgentProvider, ProviderAdapter> = new Map();
  private registry: AgentRegistry;
  private router: MessageRouter;
  private metrics: MetricsCollector;
  private config: BridgeConfiguration;
  private messageQueue: MCPMessage[] = [];
  private isRunning: boolean = false;

  constructor(config: Partial<BridgeConfiguration> = {}) {
    super();
    this.config = {
      maxRetries: 3,
      messageTimeout: 30000, // 30 seconds
      heartbeatInterval: 60000, // 1 minute
      enableLogging: true,
      enableMetrics: true,
      routingStrategy: 'skill-based',
      ...config
    };

    this.registry = new AgentRegistry();
    this.router = new MessageRouter(this.registry, this.config.routingStrategy);
    this.metrics = new MetricsCollector();
  }

  /**
   * Register a provider adapter
   */
  registerAdapter(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Adapter for ${adapter.provider} already registered`);
    }

    this.adapters.set(adapter.provider, adapter);
    
    // Set up message handling
    adapter.receive((message) => this.handleIncomingMessage(message));
    
    this.log(`Registered adapter for ${adapter.provider}`);
  }

  /**
   * Start the bridge
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bridge is already running');
    }

    this.isRunning = true;
    
    // Connect all adapters
    const connectPromises = Array.from(this.adapters.values()).map(adapter => 
      adapter.connect().catch(err => {
        this.log(`Failed to connect ${adapter.provider}: ${err.message}`, 'error');
      })
    );
    
    await Promise.all(connectPromises);
    
    // Start heartbeat monitoring
    this.startHeartbeat();
    
    // Process queued messages
    this.processMessageQueue();
    
    this.log('MCP Bridge started');
    this.emit('started');
  }

  /**
   * Stop the bridge
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Disconnect all adapters
    const disconnectPromises = Array.from(this.adapters.values()).map(adapter =>
      adapter.disconnect().catch(err => {
        this.log(`Failed to disconnect ${adapter.provider}: ${err.message}`, 'error');
      })
    );
    
    await Promise.all(disconnectPromises);
    
    this.log('MCP Bridge stopped');
    this.emit('stopped');
  }

  /**
   * Send a message through the bridge
   */
  async send(message: MCPMessage): Promise<void> {
    if (!this.isRunning) {
      this.messageQueue.push(message);
      return;
    }

    try {
      // Record metrics
      const startTime = Date.now();
      
      // Route the message
      const targets = await this.router.route(message);
      
      if (targets.length === 0) {
        throw new Error('No suitable targets found for message');
      }

      // Send to each target
      const sendPromises = targets.map(async (target) => {
        const adapter = this.getAdapterForAgent(target);
        if (!adapter || !adapter.isConnected()) {
          throw new Error(`No connected adapter for ${target.provider}`);
        }

        await adapter.send({
          ...message,
          to: target
        });
      });

      await Promise.all(sendPromises);

      // Update metrics
      if (this.config.enableMetrics) {
        this.metrics.recordMessage(message, Date.now() - startTime);
      }

      this.emit('messageSent', message);
    } catch (error) {
      this.handleError(message, error as Error);
    }
  }

  /**
   * Register an agent
   */
  async registerAgent(registration: AgentRegistration): Promise<void> {
    await this.registry.register(registration);
    this.emit('agentRegistered', registration.agent);
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    await this.registry.unregister(agentId);
    this.emit('agentUnregistered', agentId);
  }

  /**
   * Add a routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.router.addRule(rule);
  }

  /**
   * Get current metrics
   */
  getMetrics(): MetricsData {
    return this.metrics.getSnapshot();
  }

  /**
   * Get registered agents
   */
  getAgents(): AgentRegistration[] {
    return this.registry.getAll();
  }

  /**
   * Handle incoming messages
   */
  private async handleIncomingMessage(message: MCPMessage): Promise<void> {
    this.log(`Received message from ${message.from.id}: ${message.type}`);

    // Update agent last seen
    await this.registry.updateLastSeen(message.from.id);

    // Handle special message types
    switch (message.type) {
      case MessageType.PING:
        await this.handlePing(message);
        break;
      case MessageType.STATUS_UPDATE:
        await this.handleStatusUpdate(message);
        break;
      default:
        // Route to appropriate handler
        this.emit('messageReceived', message);
        await this.routeIncomingMessage(message);
    }
  }

  /**
   * Route incoming messages to local handlers or other agents
   */
  private async routeIncomingMessage(message: MCPMessage): Promise<void> {
    // If message is for a specific agent, forward it
    if (message.to && !Array.isArray(message.to)) {
      const targetAdapter = this.getAdapterForAgent(message.to);
      if (targetAdapter && targetAdapter.isConnected()) {
        await targetAdapter.send(message);
      }
    }
    
    // Emit for local processing
    this.emit(`message:${message.type}`, message);
  }

  /**
   * Handle ping messages
   */
  private async handlePing(message: MCPMessage): Promise<void> {
    const pong: MCPMessage = {
      id: `${message.id}-pong`,
      from: { id: 'mcp-bridge', provider: AgentProvider.CUSTOM, role: message.to as any },
      to: message.from,
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.PONG,
      content: { originalPingId: message.id }
    };

    await this.send(pong);
  }

  /**
   * Handle status updates
   */
  private async handleStatusUpdate(message: MCPMessage): Promise<void> {
    const { status } = message.content;
    await this.registry.updateStatus(message.from.id, status);
  }

  /**
   * Get adapter for a specific agent
   */
  private getAdapterForAgent(agent: AgentIdentifier): ProviderAdapter | undefined {
    return this.adapters.get(agent.provider);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    setInterval(() => {
      this.adapters.forEach((adapter, provider) => {
        if (!adapter.isConnected()) {
          this.log(`Adapter ${provider} disconnected, attempting reconnect`, 'warn');
          adapter.connect().catch(err => {
            this.log(`Failed to reconnect ${provider}: ${err.message}`, 'error');
          });
        }
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Process queued messages
   */
  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        await this.send(message);
      }
    }
  }

  /**
   * Handle errors
   */
  private handleError(message: MCPMessage, error: Error): void {
    this.log(`Error processing message ${message.id}: ${error.message}`, 'error');
    
    if (this.config.enableMetrics) {
      this.metrics.recordError(error);
    }

    this.emit('error', { message, error });

    // Send error message back to sender if possible
    const errorMessage: MCPMessage = {
      id: `${message.id}-error`,
      from: { id: 'mcp-bridge', provider: AgentProvider.CUSTOM, role: message.to as any },
      to: message.from,
      timestamp: new Date(),
      protocol: 'mcp',
      type: MessageType.ERROR,
      content: {
        originalMessageId: message.id,
        error: error.message
      }
    };

    this.send(errorMessage).catch(() => {
      // Ignore errors when sending error messages
    });
  }

  /**
   * Log messages
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.enableLogging) return;

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [MCPBridge] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
}