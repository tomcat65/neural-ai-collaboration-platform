// Unified Multi-Agent Collaboration Server
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { CollaborativeEventSystem } from './events/index.js';
import { MemoryManager } from './memory/index.js';
import { CollaborationHub } from './collaboration/index.js';
import { EventType } from './types/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UnifiedCollaborationServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private eventSystem: CollaborativeEventSystem;
  private memoryManager: MemoryManager;
  private collaborationHub: CollaborationHub;
  private port: number;
  private agents: Map<string, { ws: WebSocket; status: string; lastSeen: Date }>;

  constructor(port: number = 5174) {
    this.port = port;
    this.agents = new Map();
    
    // Initialize core components
    this.eventSystem = new CollaborativeEventSystem();
    this.memoryManager = new MemoryManager();
    this.collaborationHub = new CollaborationHub(this.eventSystem, this.memoryManager);
    
    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    
    // Create HTTP server
    this.server = createServer(this.app);
    
    // Initialize WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
    
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true
    }));
    
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Static file serving for dashboard
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // Request logging
    this.app.use((req, _res, next) => {
      console.log(`🌐 ${req.method} ${req.path} from ${req.ip}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health.json', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        agents: this.agents.size,
        uptime: process.uptime()
      });
    });

    // Agent registration
    this.app.post('/api/agents/register', async (req, res) => {
      const { agentId, name, type, capabilities } = req.body;
      
      try {
        // Register agent in memory
        await this.memoryManager.store(agentId, {
          name,
          type,
          capabilities,
          registeredAt: new Date()
        }, 'individual', 'profile');

        // Publish agent join event
        await this.eventSystem.publishEvent({
          sessionId: 'registration',
          agentId,
          type: EventType.AGENT_JOIN,
          payload: { name, type, capabilities }
        });

        res.json({ success: true, agentId });
        console.log(`🤖 Agent registered: ${name} (${agentId})`);
      } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
        console.error('❌ Agent registration failed:', error);
      }
    });

    // Task management
    this.app.post('/api/tasks', async (req, res) => {
      const { sessionId, agentId, description, requirements } = req.body;
      
      try {
        const task = await this.collaborationHub.createTask(
          sessionId,
          agentId,
          description,
          requirements
        );
        
        res.json({ success: true, task });
      } catch (error) {
        res.status(500).json({ error: 'Task creation failed' });
        console.error('❌ Task creation failed:', error);
      }
    });

    this.app.get('/api/tasks', async (_req, res) => {
      try {
        const tasks = await this.memoryManager.retrieve(
          { type: 'shared' },
          { shared: true }
        );
        
        res.json({ tasks });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
      }
    });

    // Event history
    this.app.get('/api/events', async (req, res) => {
      const { sessionId, agentId, type, limit } = req.query;
      
      try {
        const events = await this.eventSystem.getEventHistory({
          sessionId: sessionId as string,
          agentId: agentId as string,
          type: type as any,
          limit: limit ? parseInt(limit as string) : 100
        });
        
        res.json({ events });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch events' });
      }
    });

    // Memory operations
    this.app.post('/api/memory/store', async (req, res) => {
      const { agentId, memory, scope, type } = req.body;
      
      try {
        const id = await this.memoryManager.store(agentId, memory, scope, type);
        res.json({ success: true, id });
      } catch (error) {
        res.status(500).json({ error: 'Memory storage failed' });
      }
    });

    this.app.post('/api/memory/search', async (req, res) => {
      const { query, scope } = req.body;
      
      try {
        const results = await this.memoryManager.search(query, scope);
        res.json({ results });
      } catch (error) {
        res.status(500).json({ error: 'Memory search failed' });
      }
    });

    // Collaboration endpoints
    this.app.post('/api/collaboration/consensus', async (req, res) => {
      const { sessionId, agentId, decision, participants } = req.body;
      
      try {
        const consensusRequest = await this.collaborationHub.requestConsensus(
          sessionId,
          agentId,
          decision,
          participants
        );
        
        res.json({ success: true, consensusRequest });
      } catch (error) {
        res.status(500).json({ error: 'Consensus request failed' });
      }
    });

    this.app.post('/api/collaboration/broadcast', async (req, res) => {
      const { message } = req.body;
      
      try {
        await this.collaborationHub.broadcastToAgents(message);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Broadcast failed' });
      }
    });

    // Analytics and dashboard data
    this.app.get('/api/analytics', (_req, res) => {
      const recentEvents = this.eventSystem.getRecentEvents(50);
      const agentList = Array.from(this.agents.entries()).map(([id, data]) => ({
        id,
        status: data.status,
        lastSeen: data.lastSeen
      }));

      res.json({
        agents: agentList,
        recentEvents: recentEvents.slice(-10),
        totalEvents: recentEvents.length,
        activeAgents: agentList.filter(a => a.status === 'online').length,
        timestamp: new Date().toISOString()
      });
    });

    // Serve dashboard
    this.app.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });

    // Fallback for SPA routing
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, _req) => {
      console.log('🔌 New WebSocket connection');

      ws.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('❌ WebSocket message error:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        // Remove agent from active connections
        for (const [agentId, agentData] of this.agents.entries()) {
          if (agentData.ws === ws) {
            agentData.status = 'offline';
            console.log(`🔌 Agent ${agentId} disconnected`);
            break;
          }
        }
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Multi-Agent Collaboration Platform',
        timestamp: new Date().toISOString()
      }));
    });
  }

  private async handleWebSocketMessage(ws: WebSocket, data: any): Promise<void> {
    const { type, payload } = data;

    switch (type) {
      case 'agent_connect':
        await this.handleAgentConnect(ws, payload);
        break;
        
      case 'agent_message':
        await this.handleAgentMessage(payload);
        break;
        
      case 'task_update':
        await this.handleTaskUpdate(payload);
        break;
        
      case 'heartbeat':
        await this.handleHeartbeat(payload.agentId);
        break;
        
      default:
        ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }));
    }
  }

  private async handleAgentConnect(ws: WebSocket, payload: any): Promise<void> {
    const { agentId, name, type } = payload;
    
    this.agents.set(agentId, {
      ws,
      status: 'online',
      lastSeen: new Date()
    });

    // Add to event system
    this.eventSystem.addWebSocketClient(agentId, ws);

    // Publish agent join event
    await this.eventSystem.publishEvent({
      sessionId: 'websocket',
      agentId,
      type: EventType.AGENT_JOIN,
      payload: { name, type }
    });

    ws.send(JSON.stringify({
      type: 'connected',
      agentId,
      message: 'Successfully connected to collaboration platform'
    }));

    console.log(`🤖 Agent ${name} (${agentId}) connected via WebSocket`);
  }

  private async handleAgentMessage(payload: any): Promise<void> {
    const { fromAgent, toAgent, message, sessionId } = payload;
    
    await this.eventSystem.publishAgentMessage(
      fromAgent,
      sessionId || 'websocket',
      message,
      toAgent
    );
  }

  private async handleTaskUpdate(payload: any): Promise<void> {
    const { taskId, agentId, status, progress } = payload;
    
    await this.eventSystem.publishEvent({
      sessionId: 'websocket',
      agentId,
      type: EventType.TASK_UPDATED,
      payload: { taskId, status, progress }
    });
  }

  private async handleHeartbeat(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = new Date();
      agent.status = 'online';
    }
  }

  private setupEventHandlers(): void {
    // Handle collaboration events
    this.eventSystem.on('event', (event) => {
      // Log important events
      if ([
        EventType.TASK_CREATED,
        EventType.CONSENSUS_REACHED,
        EventType.CONFLICT_DETECTED
      ].includes(event.type)) {
        console.log(`📊 Collaboration Event: ${event.type} from ${event.agentId}`);
      }
    });

    // Monitor agent activity
    setInterval(() => {
      const now = new Date();
      for (const [agentId, agentData] of this.agents.entries()) {
        const timeSinceLastSeen = now.getTime() - agentData.lastSeen.getTime();
        
        if (timeSinceLastSeen > 60000 && agentData.status === 'online') {
          agentData.status = 'idle';
        } else if (timeSinceLastSeen > 300000 && agentData.status === 'idle') {
          agentData.status = 'offline';
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`🚀 Unified Multi-Agent Collaboration Platform started on port ${this.port}`);
        console.log(`📊 Dashboard: http://localhost:${this.port}`);
        console.log(`🔌 WebSocket: ws://localhost:${this.port}`);
        console.log(`🏥 Health: http://localhost:${this.port}/health.json`);
        
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          this.memoryManager.close();
          console.log('🛑 Unified Multi-Agent Collaboration Platform stopped');
          resolve();
        });
      });
    });
  }

  // Public API for external integration
  getEventSystem(): CollaborativeEventSystem {
    return this.eventSystem;
  }

  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  getCollaborationHub(): CollaborationHub {
    return this.collaborationHub;
  }

  getActiveAgents(): Array<{ id: string; status: string; lastSeen: Date }> {
    return Array.from(this.agents.entries()).map(([id, data]) => ({
      id,
      status: data.status,
      lastSeen: data.lastSeen
    }));
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new UnifiedCollaborationServer();
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await server.stop();
    process.exit(0);
  });
  
  server.start().catch(console.error);
}