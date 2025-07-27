/**
 * Enhanced WebSocket Server with Guaranteed Delivery Integration
 * 
 * Features:
 * - Immediate delivery confirmations
 * - Read receipt tracking
 * - Bi-directional acknowledgments
 * - Multi-agent instance support
 * - Real-time status updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { createServer } from 'http';
import { GuaranteedDeliverySystem, GuaranteedMessage, AckResponse } from './guaranteed-delivery.js';

interface EnhancedClient {
  ws: WebSocket;
  agentId: string;
  instanceId: string;
  lastHeartbeat: Date;
  subscriptions: Set<string>;
  capabilities: string[];
}

export class EnhancedWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private server: any;
  private clients: Map<string, EnhancedClient> = new Map();
  private deliverySystem: GuaranteedDeliverySystem;
  private port: number;

  constructor(port: number = 3003) {
    super();
    this.port = port;
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });
    this.deliverySystem = new GuaranteedDeliverySystem();
    
    this.setupWebSocketServer();
    this.setupDeliverySystem();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('🔌 New WebSocket connection from:', req.socket.remoteAddress);
      
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(connectionId, ws, message);
        } catch (error) {
          console.error('❌ Invalid JSON from WebSocket client:', error);
          this.sendError(ws, 'Invalid JSON format');
        }
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected:', connectionId);
        this.handleClientDisconnect(connectionId);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error for client:', connectionId, error);
        this.handleClientDisconnect(connectionId);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'connection.welcome',
        connectionId,
        message: 'Connected to Enhanced Message Hub with Guaranteed Delivery',
        timestamp: new Date().toISOString(),
        features: [
          'guaranteed_delivery',
          'read_receipts', 
          'delivery_confirmations',
          'multi_instance_support',
          'immediate_feedback'
        ]
      });
    });

    console.log(`📡 Enhanced WebSocket server configured on port ${this.port}`);
  }

  private setupDeliverySystem() {
    // Handle delivery events from guaranteed delivery system
    this.deliverySystem.on('deliverMessage', ({ message, targetInstance }) => {
      this.deliverMessageToInstance(message, targetInstance);
    });

    this.deliverySystem.on('messageDelivered', (confirmation) => {
      this.broadcastDeliveryStatus(confirmation);
    });

    this.deliverySystem.on('messageAcknowledged', (ack) => {
      this.broadcastAckStatus(ack);
    });

    this.deliverySystem.on('messageRead', (readStatus) => {
      this.broadcastReadStatus(readStatus);
    });

    this.deliverySystem.on('messageDeliveryFailed', (failure) => {
      this.broadcastDeliveryFailure(failure);
    });

    this.deliverySystem.on('acknowledgmentTimeout', (timeout) => {
      this.broadcastAckTimeout(timeout);
    });
  }

  private handleClientMessage(connectionId: string, ws: WebSocket, message: any) {
    switch (message.type) {
      case 'register':
        this.handleAgentRegistration(connectionId, ws, message);
        break;
        
      case 'send_message':
        this.handleSendMessage(connectionId, message);
        break;
        
      case 'acknowledge':
        this.handleAcknowledgment(connectionId, message);
        break;
        
      case 'read_receipt':
        this.handleReadReceipt(connectionId, message);
        break;
        
      case 'subscribe':
        this.handleSubscription(connectionId, message);
        break;
        
      case 'heartbeat':
        this.handleHeartbeat(connectionId);
        break;
        
      case 'get_status':
        this.handleStatusRequest(connectionId, ws, message);
        break;
        
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private handleAgentRegistration(connectionId: string, ws: WebSocket, message: any) {
    if (!message.agentId) {
      this.sendError(ws, 'agentId required for registration');
      return;
    }

    const instanceId = message.instanceId || `${message.agentId}_${Date.now()}`;
    const capabilities = message.capabilities || [];

    const client: EnhancedClient = {
      ws,
      agentId: message.agentId,
      instanceId,
      lastHeartbeat: new Date(),
      subscriptions: new Set([message.agentId]), // Auto-subscribe to own messages
      capabilities
    };

    this.clients.set(connectionId, client);

    // Register with delivery system
    this.deliverySystem.registerAgentInstance(message.agentId, instanceId, capabilities);

    // Notify successful registration
    this.sendMessage(ws, {
      type: 'registration.success',
      agentId: message.agentId,
      instanceId,
      timestamp: new Date().toISOString()
    });

    // Broadcast agent online status
    this.broadcastEvent({
      type: 'agent.online',
      agentId: message.agentId,
      instanceId,
      capabilities,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Agent registered: ${message.agentId}/${instanceId}`);
  }

  private async handleSendMessage(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) {
      console.error('❌ Send message from unregistered client');
      return;
    }

    const { to, content, priority, requiresAck, requiresReadReceipt, metadata } = message;

    if (!to || !content) {
      this.sendError(client.ws, 'Missing required fields: to, content');
      return;
    }

    try {
      // Send through guaranteed delivery system
      const guaranteedMessage = await this.deliverySystem.sendMessage(
        client.agentId,
        to,
        content,
        {
          priority: priority || 'medium',
          requiresAck: requiresAck !== false, // Default to true
          requiresReadReceipt: requiresReadReceipt !== false, // Default to true
          metadata
        }
      );

      // Immediately notify sender of message status
      this.sendMessage(client.ws, {
        type: 'message.sent',
        messageId: guaranteedMessage.id,
        status: guaranteedMessage.status,
        timestamp: guaranteedMessage.timestamp,
        deliveryTracking: {
          requiresAck: guaranteedMessage.requiresAck,
          requiresReadReceipt: guaranteedMessage.requiresReadReceipt,
          expectedDeliveryTime: '5s',
          expectedAckTime: '10s'
        }
      });

      console.log(`📤 Message queued for guaranteed delivery: ${guaranteedMessage.id}`);

    } catch (error) {
      console.error('❌ Error sending message:', error);
      this.sendError(client.ws, 'Failed to send message');
    }
  }

  private deliverMessageToInstance(message: GuaranteedMessage, targetInstance: any) {
    // Find the WebSocket connection for the target instance
    const targetClient = Array.from(this.clients.values()).find(
      client => client.agentId === targetInstance.agentId && 
                client.instanceId === targetInstance.instanceId
    );

    if (!targetClient) {
      console.log(`❌ No WebSocket connection found for ${targetInstance.agentId}/${targetInstance.instanceId}`);
      return;
    }

    // Deliver the message
    this.sendMessage(targetClient.ws, {
      type: 'message.received',
      messageId: message.id,
      from: message.from,
      content: message.content,
      priority: message.priority,
      timestamp: message.timestamp,
      requiresAck: message.requiresAck,
      requiresReadReceipt: message.requiresReadReceipt,
      metadata: message.metadata
    });

    console.log(`📨 Message delivered to ${targetInstance.agentId}/${targetInstance.instanceId}: ${message.id}`);
  }

  private handleAcknowledgment(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) return;

    const ack: AckResponse = {
      originalMessageId: message.messageId,
      ackType: 'delivery',
      timestamp: new Date().toISOString(),
      receiverAgent: client.agentId,
      receiverInstance: client.instanceId
    };

    this.deliverySystem.processAcknowledgment(ack);

    console.log(`📬 Delivery acknowledgment processed: ${message.messageId}`);
  }

  private handleReadReceipt(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) return;

    const readReceipt: AckResponse = {
      originalMessageId: message.messageId,
      ackType: 'read',
      timestamp: new Date().toISOString(),
      receiverAgent: client.agentId,
      receiverInstance: client.instanceId
    };

    this.deliverySystem.processAcknowledgment(readReceipt);

    console.log(`👁️ Read receipt processed: ${message.messageId}`);
  }

  private handleStatusRequest(connectionId: string, ws: WebSocket, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) return;

    if (message.messageId) {
      // Get specific message status
      const messageStatus = this.deliverySystem.getMessageStatus(message.messageId);
      this.sendMessage(ws, {
        type: 'message.status',
        messageId: message.messageId,
        status: messageStatus,
        timestamp: new Date().toISOString()
      });
    } else if (message.agentId) {
      // Get agent status
      const agentStatus = this.deliverySystem.getAgentStatus(message.agentId);
      this.sendMessage(ws, {
        type: 'agent.status',
        agentId: message.agentId,
        instances: agentStatus,
        timestamp: new Date().toISOString()
      });
    } else {
      // Get system status
      const pendingMessages = this.deliverySystem.getAllPendingMessages();
      this.sendMessage(ws, {
        type: 'system.status',
        pendingMessages: pendingMessages.length,
        connectedClients: this.clients.size,
        timestamp: new Date().toISOString()
      });
    }
  }

  private handleSubscription(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) return;

    if (message.targetAgents) {
      message.targetAgents.forEach((agentId: string) => {
        client.subscriptions.add(agentId);
      });
    }

    this.sendMessage(client.ws, {
      type: 'subscription.success',
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });
  }

  private handleHeartbeat(connectionId: string) {
    const client = this.clients.get(connectionId);
    if (client) {
      client.lastHeartbeat = new Date();
      this.sendMessage(client.ws, {
        type: 'heartbeat.ack',
        timestamp: new Date().toISOString()
      });
    }
  }

  private handleClientDisconnect(connectionId: string) {
    const client = this.clients.get(connectionId);
    if (client) {
      // Mark agent instance as offline
      this.deliverySystem.markAgentOffline(client.agentId, client.instanceId);
      
      // Broadcast agent offline status
      this.broadcastEvent({
        type: 'agent.offline',
        agentId: client.agentId,
        instanceId: client.instanceId,
        timestamp: new Date().toISOString()
      });
      
      this.clients.delete(connectionId);
      console.log(`📴 Agent disconnected: ${client.agentId}/${client.instanceId}`);
    }
  }

  private broadcastDeliveryStatus(confirmation: any) {
    this.broadcastEvent({
      type: 'delivery.confirmed',
      ...confirmation
    });
  }

  private broadcastAckStatus(ack: any) {
    this.broadcastEvent({
      type: 'message.acknowledged',
      ...ack
    });
  }

  private broadcastReadStatus(readStatus: any) {
    this.broadcastEvent({
      type: 'message.read',
      ...readStatus
    });
  }

  private broadcastDeliveryFailure(failure: any) {
    this.broadcastEvent({
      type: 'delivery.failed',
      ...failure
    });
  }

  private broadcastAckTimeout(timeout: any) {
    this.broadcastEvent({
      type: 'acknowledgment.timeout',
      ...timeout
    });
  }

  private broadcastEvent(event: any) {
    for (const client of this.clients.values()) {
      this.sendMessage(client.ws, event);
    }
  }

  private sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.sendMessage(ws, {
      type: 'error',
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start the enhanced WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Enhanced WebSocket server started on port ${this.port}`);
        console.log(`✨ Features: Guaranteed delivery, read receipts, multi-instance support`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.deliverySystem.shutdown();
    
    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    
    this.clients.clear();
    
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('✅ Enhanced WebSocket server stopped');
        resolve();
      });
    });
  }

  /**
   * Get system statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      pendingMessages: this.deliverySystem.getAllPendingMessages().length,
      agentInstances: Array.from(this.clients.values()).map(client => ({
        agentId: client.agentId,
        instanceId: client.instanceId,
        lastHeartbeat: client.lastHeartbeat,
        capabilities: client.capabilities
      }))
    };
  }
}