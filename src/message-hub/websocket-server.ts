import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { createServer } from 'http';

// WebSocket event types for real-time notifications
export interface MessageHubEvent {
  type: 'message.new' | 'message.read' | 'agent.online' | 'agent.offline' | 'heartbeat';
  agentId?: string;
  targetAgentId?: string;
  messageId?: string;
  content?: any;
  timestamp: string;
}

// Connected client information
interface ConnectedClient {
  ws: WebSocket;
  agentId: string;
  lastHeartbeat: Date;
  subscriptions: Set<string>; // Agent IDs this client wants notifications for
}

/**
 * WebSocket Notification Server for Centralized Message Hub
 * Port: 3002
 * Purpose: Real-time notifications for <1 second message discovery
 */
export class MessageHubWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private server: any;
  private clients: Map<string, ConnectedClient> = new Map();
  private port: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 3003) {
    super();
    this.port = port;
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('🔌 New WebSocket connection from:', req.socket.remoteAddress);
      
      // Connection ID for tracking
      const connectionId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Handle initial connection
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(connectionId, ws, message);
        } catch (error) {
          console.error('❌ Invalid JSON from WebSocket client:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON format',
            timestamp: new Date().toISOString()
          }));
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
      ws.send(JSON.stringify({
        type: 'connection.welcome',
        connectionId,
        message: 'Connected to Message Hub WebSocket',
        timestamp: new Date().toISOString()
      }));
    });

    console.log(`📡 WebSocket server configured on port ${this.port}`);
  }

  private handleClientMessage(connectionId: string, ws: WebSocket, message: any) {
    switch (message.type) {
      case 'register':
        this.handleClientRegistration(connectionId, ws, message);
        break;
      
      case 'subscribe':
        this.handleSubscription(connectionId, message);
        break;
      
      case 'unsubscribe':
        this.handleUnsubscription(connectionId, message);
        break;
      
      case 'heartbeat':
        this.handleHeartbeat(connectionId);
        break;
      
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
          timestamp: new Date().toISOString()
        }));
    }
  }

  private handleClientRegistration(connectionId: string, ws: WebSocket, message: any) {
    if (!message.agentId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'agentId required for registration',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    const client: ConnectedClient = {
      ws,
      agentId: message.agentId,
      lastHeartbeat: new Date(),
      subscriptions: new Set()
    };

    // Auto-subscribe to own messages
    client.subscriptions.add(message.agentId);

    this.clients.set(connectionId, client);

    // Notify that agent is online
    this.broadcastEvent({
      type: 'agent.online',
      agentId: message.agentId,
      timestamp: new Date().toISOString()
    });

    ws.send(JSON.stringify({
      type: 'registration.success',
      agentId: message.agentId,
      connectionId,
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    }));

    console.log(`✅ Agent registered: ${message.agentId} (${connectionId})`);
  }

  private handleSubscription(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) {
      return; // Client not registered
    }

    if (message.targetAgentId) {
      client.subscriptions.add(message.targetAgentId);
      client.ws.send(JSON.stringify({
        type: 'subscription.success',
        targetAgentId: message.targetAgentId,
        timestamp: new Date().toISOString()
      }));
    }
  }

  private handleUnsubscription(connectionId: string, message: any) {
    const client = this.clients.get(connectionId);
    if (!client) {
      return; // Client not registered
    }

    if (message.targetAgentId) {
      client.subscriptions.delete(message.targetAgentId);
      client.ws.send(JSON.stringify({
        type: 'unsubscription.success',
        targetAgentId: message.targetAgentId,
        timestamp: new Date().toISOString()
      }));
    }
  }

  private handleHeartbeat(connectionId: string) {
    const client = this.clients.get(connectionId);
    if (client) {
      client.lastHeartbeat = new Date();
      client.ws.send(JSON.stringify({
        type: 'heartbeat.ack',
        timestamp: new Date().toISOString()
      }));
    }
  }

  private handleClientDisconnect(connectionId: string) {
    const client = this.clients.get(connectionId);
    if (client) {
      // Notify that agent is offline
      this.broadcastEvent({
        type: 'agent.offline',
        agentId: client.agentId,
        timestamp: new Date().toISOString()
      });

      this.clients.delete(connectionId);
      console.log(`🔌 Agent disconnected: ${client.agentId} (${connectionId})`);
    }
  }

  /**
   * Broadcast event to all subscribed clients
   * This is the core notification mechanism for <1 second message discovery
   */
  public broadcastEvent(event: MessageHubEvent) {
    const eventStr = JSON.stringify(event);
    let notifiedClients = 0;

    this.clients.forEach((client, connectionId) => {
      // Check if client is interested in this event
      const shouldNotify = this.shouldNotifyClient(client, event);
      
      if (shouldNotify && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(eventStr);
          notifiedClients++;
        } catch (error) {
          console.error(`❌ Failed to send to client ${connectionId}:`, error);
          this.handleClientDisconnect(connectionId);
        }
      }
    });

    console.log(`📡 Event broadcast: ${event.type} → ${notifiedClients} clients`);
    
    // Emit to internal event system for logging/metrics
    this.emit('event.broadcast', event, notifiedClients);
  }

  private shouldNotifyClient(client: ConnectedClient, event: MessageHubEvent): boolean {
    switch (event.type) {
      case 'message.new':
        // Notify if client subscribed to the target agent
        return event.targetAgentId ? client.subscriptions.has(event.targetAgentId) : false;
      
      case 'message.read':
        // Notify if client subscribed to sender or receiver
        return Boolean((event.agentId && client.subscriptions.has(event.agentId)) ||
               (event.targetAgentId && client.subscriptions.has(event.targetAgentId)));
      
      case 'agent.online':
      case 'agent.offline':
        // Notify all clients about agent status changes
        return true;
      
      case 'heartbeat':
        // Only notify the specific agent
        return event.agentId === client.agentId;
      
      default:
        return false;
    }
  }

  /**
   * Public method for Message Hub API to notify new messages
   * This enables <1 second message discovery
   */
  public notifyNewMessage(messageId: string, from: string, to: string, content?: string) {
    this.broadcastEvent({
      type: 'message.new',
      messageId,
      agentId: from,
      targetAgentId: to,
      content: content ? { preview: content.substring(0, 100) } : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Public method to notify message read status
   */
  public notifyMessageRead(messageId: string, from: string, to: string) {
    this.broadcastEvent({
      type: 'message.read',
      messageId,
      agentId: from,
      targetAgentId: to,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start the WebSocket server
   */
  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`📡 Message Hub WebSocket Server started on port ${this.port}`);
        console.log(`🔄 Real-time notifications enabled for <1s message discovery`);
        
        // Start heartbeat monitoring
        this.startHeartbeatMonitoring();
        
        resolve();
      });
    });
  }

  /**
   * Monitor client heartbeats and cleanup dead connections
   */
  private startHeartbeatMonitoring() {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeoutMs = 60000; // 1 minute timeout

      this.clients.forEach((client, connectionId) => {
        const timeSinceHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > timeoutMs) {
          console.log(`⏰ Client timeout: ${client.agentId} (${connectionId})`);
          this.handleClientDisconnect(connectionId);
        }
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop the WebSocket server
   */
  public async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();

    // Close the server
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('📡 Message Hub WebSocket Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get connection statistics
   */
  public getStats() {
    const stats = {
      connectedClients: this.clients.size,
      totalSubscriptions: 0,
      clientDetails: [] as any[]
    };

    this.clients.forEach((client, connectionId) => {
      stats.totalSubscriptions += client.subscriptions.size;
      stats.clientDetails.push({
        connectionId,
        agentId: client.agentId,
        subscriptions: Array.from(client.subscriptions),
        lastHeartbeat: client.lastHeartbeat
      });
    });

    return stats;
  }
}