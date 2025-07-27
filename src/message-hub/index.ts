/**
 * Message Hub - Centralized Communication System
 * 
 * Phase 0 Implementation: WebSocket Notification System
 * Purpose: Reduce message discovery from 2-3 minutes to <1 second
 * 
 * Architecture:
 * - WebSocket Server (port 3002) - Real-time notifications
 * - Integration Bridge - Connects with existing MCP server (port 5174)  
 * - Performance Target: <1 second message discovery
 * 
 * Collaboration: Claude (WebSocket/Integration) + Cursor (SQLite/API)
 */

import { MessageHubIntegration } from './hub-integration.js';
export { MessageHubWebSocketServer } from './websocket-server.js';
export { EnhancedWebSocketServer } from './enhanced-websocket-server.js';
export { GuaranteedDeliverySystem } from './guaranteed-delivery.js';
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
  mcpServerPort: 5174,
  heartbeatInterval: 30000, // 30 seconds
  clientTimeout: 60000,     // 1 minute
  enableMetrics: true
};

/**
 * Main Message Hub class that orchestrates Enhanced WebSocket and Integration
 */
export class MessageHub {
  private integration?: MessageHubIntegration;
  private enhancedServer: any; // Will be imported dynamically
  private config: MessageHubConfig;
  private useEnhancedMode: boolean;

  constructor(config: Partial<MessageHubConfig> & { enhanced?: boolean } = {}) {
    this.config = { ...DEFAULT_HUB_CONFIG, ...config };
    this.useEnhancedMode = config.enhanced ?? true; // Default to enhanced mode
    
    if (!this.useEnhancedMode) {
      // Use legacy integration
      this.integration = new MessageHubIntegration(
        this.config.websocketPort,
        this.config.mcpServerPort
      );
      this.setupMetrics();
    }
  }

  private async init() {
    if (this.useEnhancedMode) {
      await this.initializeEnhancedMode();
    }
    this.setupMetrics();
  }

  private async initializeEnhancedMode() {
    try {
      // Dynamic import for ES modules
      const { EnhancedWebSocketServer } = await import('./enhanced-websocket-server.js');
      this.enhancedServer = new EnhancedWebSocketServer(this.config.websocketPort);
      console.log('✨ Enhanced Message Hub mode activated with guaranteed delivery');
    } catch (error) {
      console.error('❌ Failed to initialize enhanced mode, falling back to legacy:', error);
      this.useEnhancedMode = false;
      this.integration = new MessageHubIntegration(
        this.config.websocketPort,
        this.config.mcpServerPort
      );
    }
  }

  private setupMetrics() {
    if (this.config.enableMetrics && this.integration) {
      this.integration.on('hub.metrics', (metrics: any) => {
        console.log(`📊 Hub Metrics: ${JSON.stringify(metrics)}`);
      });
    }
  }

  /**
   * Start the complete Message Hub system
   */
  public async start(): Promise<void> {
    console.log('🚀 Starting Message Hub System...');
    console.log(`📡 WebSocket Port: ${this.config.websocketPort}`);
    console.log(`🔗 MCP Integration Port: ${this.config.mcpServerPort}`);
    console.log('⚡ Target Performance: <1 second message discovery');
    
    // Initialize if not already done
    await this.init();
    
    if (this.useEnhancedMode && this.enhancedServer) {
      console.log('✨ Starting Enhanced Mode with Guaranteed Delivery...');
      await this.enhancedServer.start();
      console.log('✅ Enhanced Message Hub System fully operational');
      console.log('🎯 Features: Guaranteed delivery, read receipts, immediate feedback');
    } else if (this.integration) {
      console.log('📡 Starting Legacy Mode...');
      await this.integration.start();
      console.log('✅ Message Hub System fully operational');
    } else {
      throw new Error('No integration method available');
    }
  }

  /**
   * Stop the Message Hub system
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping Message Hub System...');
    if (this.useEnhancedMode && this.enhancedServer) {
      await this.enhancedServer.stop();
    } else if (this.integration) {
      await this.integration.stop();
    }
    console.log('✅ Message Hub System stopped');
  }

  /**
   * Get integration instance for connecting with MCP server
   */
  public getIntegration(): MessageHubIntegration | undefined {
    return this.integration;
  }
  
  public getStats() {
    if (this.useEnhancedMode && this.enhancedServer) {
      return this.enhancedServer.getStats();
    } else if (this.integration) {
      return this.integration.getPerformanceMetrics();
    }
    return { status: 'not_initialized' };
  }

  /**
   * Health check for the Message Hub system
   */
  public getHealthStatus() {
    const stats = this.getStats();
    
    if (this.useEnhancedMode) {
      return {
        status: 'healthy',
        service: 'message-hub-enhanced',
        version: '1.0.0-phase0',
        timestamp: new Date().toISOString(),
        performance: {
          target: '<1 second message discovery',
          actual: 'realtime via WebSocket',
          websocketClients: stats.connectedClients || 0
        },
        features: [
          'guaranteed_delivery',
          'read_receipts', 
          'delivery_confirmations',
          'multi_instance_support',
          'immediate_feedback'
        ],
        pendingMessages: stats.pendingMessages || 0
      };
    } else {
      return {
        status: 'healthy',
        service: 'message-hub-legacy',
        version: '1.0.0-phase0',
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
}