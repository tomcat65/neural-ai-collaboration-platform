/**
 * Message Hub - Centralized Communication System
 *
 * WebSocket Notification System
 * Purpose: Reduce message discovery from 2-3 minutes to <1 second
 *
 * Architecture:
 * - WebSocket Server - Real-time notifications
 * - Integration Bridge - Connects with NeuralMCPServer
 * - Performance Target: <1 second message discovery
 */

import { MessageHubIntegration } from './hub-integration.js';
export { MessageHubWebSocketServer } from './websocket-server.js';
export { MessageHubIntegration } from './hub-integration.js';

// Event types for type safety
export interface MessageHubEvent {
  type: 'message.new' | 'message.read' | 'agent.online' | 'agent.offline' | 'heartbeat';
  agentId?: string;
  targetAgentId?: string;
  messageId?: string;
  content?: any;
  timestamp: string;
}

// Hub configuration
export interface MessageHubConfig {
  websocketPort: number;
  mcpServerPort: number;
  heartbeatInterval: number;
  clientTimeout: number;
  enableMetrics: boolean;
}

// Default configuration
export const DEFAULT_HUB_CONFIG: MessageHubConfig = {
  websocketPort: 3003,
  mcpServerPort: 6174,
  heartbeatInterval: 30000, // 30 seconds
  clientTimeout: 60000,     // 1 minute
  enableMetrics: true
};

/**
 * Main Message Hub class that orchestrates WebSocket notifications and Integration
 */
export class MessageHub {
  private integration: MessageHubIntegration;
  private config: MessageHubConfig;

  constructor(config: Partial<MessageHubConfig> = {}) {
    this.config = { ...DEFAULT_HUB_CONFIG, ...config };
    this.integration = new MessageHubIntegration(
      this.config.websocketPort,
      this.config.mcpServerPort
    );
    this.setupMetrics();
  }

  private setupMetrics() {
    if (this.config.enableMetrics && this.integration) {
      this.integration.on('hub.metrics', (metrics: any) => {
        console.log(`Hub Metrics: ${JSON.stringify(metrics)}`);
      });
    }
  }

  /**
   * Start the Message Hub system
   */
  public async start(): Promise<void> {
    console.log('Starting Message Hub System...');
    await this.integration.start();
    console.log('Message Hub System operational');
  }

  /**
   * Stop the Message Hub system
   */
  public async stop(): Promise<void> {
    await this.integration.stop();
    console.log('Message Hub System stopped');
  }

  /**
   * Get integration instance for connecting with MCP server
   */
  public getIntegration(): MessageHubIntegration {
    return this.integration;
  }

  public getStats() {
    return this.integration.getPerformanceMetrics();
  }

  /**
   * Health check for the Message Hub system
   */
  public getHealthStatus() {
    const stats = this.getStats();
    return {
      status: 'healthy',
      service: 'message-hub',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      performance: {
        target: '<1 second message discovery',
        actual: 'realtime via WebSocket',
        websocketClients: stats.websocketServer?.connectedClients || 0
      },
      integration: {
        mcpServerConnected: stats.integrationStatus?.mcpServerIntegrated || false,
        realTimeNotifications: stats.integrationStatus?.realTimeNotifications || false
      },
      ports: stats.ports || {}
    };
  }
}
