import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { MemoryManager } from './memory/index.js';
import { CollaborationHub } from './collaboration/index.js';
import { CollaborativeEventSystem } from './events/index.js';
import { EventType } from './types/events.js';
import { OnboardingManager } from './onboarding/index.js';
import { UnifiedDiscoveryService } from './onboarding/unified-discovery-service.js';
import { createOnboardingRoutes } from './routes/onboarding.js';

// Import types directly to avoid conflicts
import type {
  MemorySystem as MemorySystemType,
  IndividualMemory,
  SharedMemory,
  Task,
  ConsensusHistory,
  SharedKnowledge,
  ProjectArtifacts
} from './types/memory.js';

// Import TaskStatus as a value, not a type
import { TaskStatus } from './types/memory.js';

// Human notification system
interface HumanNotification {
  id: string;
  type: 'intervention_required' | 'decision_needed' | 'approval_requested' | 'error_alert' | 'system_update';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  agentId?: string;
  sessionId?: string;
  timestamp: string;
  acknowledged: boolean;
  actionRequired: boolean;
  context?: any;
}

class HumanNotificationSystem {
  private notifications: Map<string, HumanNotification> = new Map();
  private callbacks: ((notification: HumanNotification) => void)[] = [];

  addNotification(notification: Omit<HumanNotification, 'id' | 'timestamp' | 'acknowledged'>): string {
    const id = uuidv4();
    const fullNotification: HumanNotification = {
      ...notification,
      id,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };
    
    this.notifications.set(id, fullNotification);
    this.broadcastNotification(fullNotification);
    
    console.log(`🔔 Human notification: ${notification.title} (${notification.priority})`);
    return id;
  }

  acknowledgeNotification(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.acknowledged = true;
      this.broadcastNotification(notification);
      return true;
    }
    return false;
  }

  getNotifications(includeAcknowledged = false): HumanNotification[] {
    return Array.from(this.notifications.values())
      .filter(n => includeAcknowledged || !n.acknowledged)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  onNotification(callback: (notification: HumanNotification) => void) {
    this.callbacks.push(callback);
  }

  private broadcastNotification(notification: HumanNotification) {
    this.callbacks.forEach(callback => callback(notification));
  }
}

// Server configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001;

interface UnifiedServerConfig {
  memory: {
    databasePath: string;
    maxMemorySize: number;
  };
  collaboration: {
    maxConcurrentTasks: number;
    taskTimeoutMs: number;
  };
  events: {
    maxEventHistory: number;
    eventRetentionDays: number;
  };
  mcp: {
    enabled: boolean;
    serverPath: string;
    port: number;
    autoRestart: boolean;
  };
}

class UnifiedServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private memoryManager: MemoryManager;
  private collaborationHub: CollaborationHub;
  private eventSystem: CollaborativeEventSystem;
  private onboardingManager: OnboardingManager;
  private unifiedDiscoveryService: UnifiedDiscoveryService;
  private humanNotificationSystem: HumanNotificationSystem;
  private config: UnifiedServerConfig;
  private connectedClients: Map<string, WebSocket> = new Map();
  private mcpProcess: ChildProcess | null = null;

  constructor(config: UnifiedServerConfig) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    // Initialize systems
    this.memoryManager = new MemoryManager(config.memory.databasePath);
    this.eventSystem = new CollaborativeEventSystem(config.memory.databasePath);
    this.collaborationHub = new CollaborationHub(this.eventSystem, this.memoryManager);
    this.onboardingManager = new OnboardingManager(
      this.memoryManager, 
      this.collaborationHub, 
      this.eventSystem
    );
    this.unifiedDiscoveryService = new UnifiedDiscoveryService(
      this.onboardingManager, 
      this.eventSystem,
      {
        enableWebSocketDiscovery: false, // Disabled - ANP Router not available on port 8082
        enableAPIDiscovery: false,       // Disabled - ANP Router not available on port 8081
        enableMCPDiscovery: true,
        enableHTTPDiscovery: true,
        enableAIToAIWelcome: true,
        mentorPoolEnabled: true,
        autoOnboardingEnabled: true,
        discoveryTimeout: 30000,
        capabilityNegotiationTimeout: 5000,
        maxDiscoveryAttempts: 3
      }
    );
    this.humanNotificationSystem = new HumanNotificationSystem();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((_req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${_req.method} ${_req.path} - ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'unified-multi-agent-server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        systems: {
          memory: true,
          collaboration: true,
          events: true
        }
      });
    });

    // Agent management routes
    this.app.post('/api/agents/register', async (req, res) => {
      try {
        const { agentId, name, type, capabilities } = req.body;
        
        // Store agent information in memory
        const agentInfo = {
          id: agentId,
          name,
          type,
          capabilities: capabilities || [],
          status: 'online',
          lastSeen: new Date(),
          createdAt: new Date()
        };

        await this.memoryManager.store(agentId, agentInfo, 'individual', 'agent_profile');
        
        // Trigger agent discovery for auto-onboarding
        await this.eventSystem.publishEvent({
          sessionId: 'system',
          agentId: 'system',
          type: 'agent.registered' as any, // Trigger discovery
          payload: {
            agentId,
            agentType: type,
            capabilities: capabilities || [],
            clientInfo: {
              userAgent: req.headers['user-agent'],
              platform: req.headers['x-platform'] || 'unknown'
            }
          }
        });
        
        // Publish agent join event
        await this.eventSystem.publishEvent({
          sessionId: 'system',
          agentId: 'system',
          type: EventType.AGENT_JOIN,
          payload: {
            agentId,
            name,
            type,
            capabilities
          }
        });

        res.json({ 
          success: true, 
          status: 'registered',
          agentId,
          message: `Agent ${name} registered successfully`
        });
      } catch (error) {
        console.error('Agent registration error:', error);
        res.status(500).json({ error: 'Agent registration failed' });
      }
    });

    this.app.get('/api/agents', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const agents = Array.from(memorySystem.individual.keys()).map(agentId => {
          return {
            id: agentId,
            name: agentId, // Use agentId as name for now
            type: 'unknown',
            status: 'online',
            lastSeen: new Date()
          };
        });
        res.json({ agents, total: agents.length });
      } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ error: 'Failed to get agents' });
      }
    });

    // Memory system routes
    this.app.get('/api/memory/search', async (req, res) => {
      try {
        const query = req.query.query as string;
        const scope = (req.query.scope as 'individual' | 'shared' | 'all') || 'all';
        const results = await this.memoryManager.search(query, scope as any);
        res.json({ results, total: results.length });
      } catch (error) {
        console.error('Memory search error:', error);
        res.status(500).json({ error: 'Memory search failed' });
      }
    });

    this.app.post('/api/memory/store', async (req, res) => {
      try {
        const { agentId, memory, scope, type } = req.body;
        // Ensure memory object has required structure
        const memoryData = memory || {};
        if (!memoryData.tags) {
          memoryData.tags = [];
        }
        const memoryId = await this.memoryManager.store(agentId, memoryData, scope, type);
        res.json({ success: true, memoryId });
      } catch (error) {
        console.error('Memory store error:', error);
        res.status(500).json({ error: 'Memory store failed' });
      }
    });

    // Collaboration routes
    this.app.get('/api/collaboration/tasks', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const tasks = Array.from(memorySystem.shared.tasks.tasks.values());
        res.json({ tasks, total: tasks.length });
      } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
      }
    });

    this.app.post('/api/collaboration/tasks', async (req, res) => {
      try {
        const { sessionId, agentId, description, requirements, parentTaskId } = req.body;
        
        // Provide default requirements if none are provided
        const defaultRequirements = {
          skills: [],
          tools: [],
          dependencies: [],
          deliverables: [],
          acceptanceCriteria: []
        };
        
        const task = await this.collaborationHub.createTask(
          sessionId || 'default-session', 
          agentId, 
          description, 
          requirements || defaultRequirements, 
          parentTaskId
        );
        res.json({ success: true, task });
      } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
      }
    });

    this.app.post('/api/collaboration/tasks/:taskId/assign', async (req, res) => {
      try {
        const { taskId } = req.params;
        const { sessionId, agentId, assignedBy } = req.body;
        const memorySystem = this.memoryManager.getMemorySystem();
        const task = memorySystem.shared.tasks.tasks.get(taskId);
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        const assignment = await this.collaborationHub.assignTask(sessionId, task, agentId, assignedBy);
        res.json({ success: true, assignment });
      } catch (error) {
        console.error('Assign task error:', error);
        res.status(500).json({ error: 'Failed to assign task' });
      }
    });

    // Phase 2: Advanced Collaboration Endpoints
    this.app.post('/api/collaboration/consensus', async (req, res) => {
      try {
        const { sessionId, agentId, title, description, options, participants, impact, deadline } = req.body;
        const decision = {
          id: uuidv4(),
          title,
          description,
          options,
          impact: impact || 'medium',
          deadline: deadline ? new Date(deadline) : new Date(Date.now() + 24 * 60 * 60 * 1000) // Default 24h
        };
        
        const consensusRequest = await this.collaborationHub.requestConsensus(sessionId, agentId, decision, participants);
        res.json({ success: true, consensusRequest });
      } catch (error) {
        console.error('Consensus request error:', error);
        res.status(500).json({ error: 'Failed to request consensus' });
      }
    });

    this.app.post('/api/collaboration/consensus/vote', async (req, res) => {
      try {
        const { sessionId, agentId, requestId, vote, reasoning, confidence } = req.body;
        
        // Process the vote through the collaboration hub
        await this.collaborationHub.processConsensusVote({
          requestId,
          vote,
          reasoning,
          confidence: confidence || 0.8
        }, agentId);
        
        res.json({ success: true, message: 'Vote submitted successfully' });
      } catch (error) {
        console.error('Consensus vote error:', error);
        res.status(500).json({ error: 'Failed to submit vote' });
      }
    });

    this.app.get('/api/collaboration/consensus/status', async (req, res) => {
      try {
        const { requestId } = req.query;
        
        if (requestId) {
          // Get specific consensus request status
          const consensusRequest = this.collaborationHub.getActiveConsensus(requestId as string);
          if (!consensusRequest) {
            res.status(404).json({ error: 'Consensus request not found' });
            return;
          }
          res.json({ success: true, consensusRequest });
        } else {
          // Get all active consensus requests
          const activeConsensus = this.collaborationHub.getAllActiveConsensus();
          res.json({ success: true, activeConsensus });
        }
      } catch (error) {
        console.error('Consensus status error:', error);
        res.status(500).json({ error: 'Failed to get consensus status' });
      }
    });

    this.app.post('/api/collaboration/conflict/resolve', async (req, res) => {
      try {
        const { sessionId, agentId, conflictId, strategy, resolution } = req.body;
        
        const resolutionResult = await this.collaborationHub.resolveConflict(conflictId, strategy);
        res.json({ success: true, resolution: resolutionResult });
      } catch (error) {
        console.error('Conflict resolution error:', error);
        res.status(500).json({ error: 'Failed to resolve conflict' });
      }
    });

    this.app.post('/api/collaboration/tasks/decompose', async (req, res) => {
      try {
        const { sessionId, agentId, taskId, strategy, maxSubtasks } = req.body;
        const memorySystem = this.memoryManager.getMemorySystem();
        const task = memorySystem.shared.tasks.tasks.get(taskId);
        
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        
        const subtasks = await this.collaborationHub.decomposeTask(sessionId, task, agentId);
        res.json({ success: true, subtasks });
      } catch (error) {
        console.error('Task decomposition error:', error);
        res.status(500).json({ error: 'Failed to decompose task' });
      }
    });

    this.app.post('/api/collaboration/tasks/assign', async (req, res) => {
      try {
        const { sessionId, agentId, taskId, agentIds, strategy } = req.body;
        const memorySystem = this.memoryManager.getMemorySystem();
        const task = memorySystem.shared.tasks.tasks.get(taskId);
        
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        
        // Intelligent assignment based on strategy
        const assignedAgent = await this.collaborationHub.intelligentlyAssignTask(task, agentIds, strategy);
        const assignment = await this.collaborationHub.assignTask(sessionId, task, assignedAgent, agentId);
        
        res.json({ success: true, assignment, assignedAgent });
      } catch (error) {
        console.error('Intelligent assignment error:', error);
        res.status(500).json({ error: 'Failed to assign task' });
      }
    });

    this.app.get('/api/collaboration/analytics', async (req, res) => {
      try {
        const { timeRange, metrics } = req.query;
        const timeRangeStr = timeRange as string || '24h';
        const metricsArray = metrics ? (metrics as string).split(',') : ['tasks', 'events', 'consensus', 'conflicts'];
        
        const analytics = await this.collaborationHub.generateAnalytics(timeRangeStr, metricsArray);
        res.json({ success: true, analytics });
      } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
      }
    });

    // Event routes
    this.app.get('/api/events', async (req, res) => {
      try {
        const filter: any = {
          sessionId: req.query.sessionId as string,
          agentId: req.query.agentId as string,
          type: req.query.type as any,
          limit: req.query.limit ? parseInt(String(req.query.limit)) : 100
        };

        if (req.query.startTime) {
          filter.startTime = new Date(String(req.query.startTime));
        }
        if (req.query.endTime) {
          filter.endTime = new Date(String(req.query.endTime));
        }

        const events = await this.eventSystem.getEventHistory(filter);
        res.json({ events, total: events.length });
      } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ error: 'Failed to get events' });
      }
    });

    this.app.post('/api/events', async (req, res) => {
      try {
        const eventData = req.body;
        
        // Validate and sanitize event data
        if (!eventData.sessionId) {
          eventData.sessionId = 'default-session';
        }
        if (!eventData.payload) {
          eventData.payload = {};
        }
        if (!eventData.agentId) {
          eventData.agentId = 'unknown-agent';
        }
        if (!eventData.type) {
          eventData.type = 'generic';
        }
        
        // Ensure payload is a valid object and sanitize any problematic characters
        if (typeof eventData.payload === 'string') {
          try {
            // First sanitize the string to remove bad escaped characters
            const sanitizedPayload = eventData.payload
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');
            
            eventData.payload = JSON.parse(sanitizedPayload);
          } catch (parseError) {
            console.warn('Invalid JSON payload, using empty object:', parseError);
            eventData.payload = {};
          }
        }
        
        // Sanitize any string values in payload to prevent JSON escape issues
        if (eventData.payload && typeof eventData.payload === 'object') {
          eventData.payload = this.sanitizePayload(eventData.payload);
        }
        
        // Ensure payload is never null or undefined
        if (!eventData.payload) {
          eventData.payload = {};
        }
        
        const eventId = await this.eventSystem.publishEvent(eventData);
        res.json({ success: true, eventId });
      } catch (error) {
        console.error('Log event error:', error);
        res.status(500).json({ error: 'Failed to log event' });
      }
    });

    // Dashboard-specific routes
    this.app.get('/api/dashboard/status', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const tasks = Array.from(memorySystem.shared.tasks.tasks.values());
        const recentEvents = await this.eventSystem.getEventHistory({ limit: 10 });

        const activeTasks = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS);
        const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);

        res.json({
          tasks: {
            total: tasks.length,
            active: activeTasks.length,
            completed: completedTasks.length,
            completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0
          },
          events: {
            recent: recentEvents.length,
            total: await this.eventSystem.getEventHistory().then(events => events.length)
          },
          system: {
            uptime: process.uptime()
          }
        });
      } catch (error) {
        console.error('Dashboard status error:', error);
        res.status(500).json({ error: 'Failed to get dashboard status' });
      }
    });

    // WebSocket connection endpoint
    this.app.get('/api/ws/connect', (_req, res) => {
      res.json({
        wsUrl: `ws://localhost:${WS_PORT}`,
        connectionId: uuidv4()
      });
    });

    // Onboarding routes
    this.app.use('/api/onboarding', createOnboardingRoutes(this.onboardingManager));

    // Unified Discovery Service routes
    this.app.get('/api/discovery/agents', (_req, res) => {
      const discoveredAgents = Array.from(this.unifiedDiscoveryService.getDiscoveredAgents().entries())
        .map(([id, event]) => ({ id, ...event }));
      res.json({ agents: discoveredAgents });
    });

    this.app.get('/api/discovery/announcements', (_req, res) => {
      const announcements = Array.from(this.unifiedDiscoveryService.getAgentAnnouncements().entries())
        .map(([id, announcement]) => ({ id, ...announcement }));
      res.json({ announcements });
    });

    this.app.get('/api/discovery/protocols', (_req, res) => {
      const protocols = Array.from(this.unifiedDiscoveryService.getProtocols().entries())
        .map(([protocolName, protocol]) => ({ protocolName, ...protocol }));
      res.json({ protocols });
    });

    this.app.get('/api/discovery/negotiations', (_req, res) => {
      const negotiations = Array.from(this.unifiedDiscoveryService.getCapabilityNegotiations().entries())
        .map(([id, negotiation]) => ({ id, ...negotiation }));
      res.json({ negotiations });
    });

    this.app.post('/api/discovery/mentor/:agentId', (req, res) => {
      try {
        this.unifiedDiscoveryService.addMentor(req.params.agentId);
        res.json({ success: true, message: `${req.params.agentId} added to unified mentor pool` });
      } catch (error) {
        res.status(500).json({ error: 'Failed to add mentor' });
      }
    });

    this.app.post('/api/discovery/start', async (_req, res) => {
      try {
        await this.unifiedDiscoveryService.start();
        res.json({ success: true, message: 'Unified Discovery Service started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to start discovery service' });
      }
    });

    this.app.post('/api/discovery/stop', async (_req, res) => {
      try {
        await this.unifiedDiscoveryService.stop();
        res.json({ success: true, message: 'Unified Discovery Service stopped' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to stop discovery service' });
      }
    });

    // Vue UI Dashboard endpoints
    this.app.get('/api/analytics', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const agents = Array.from(memorySystem.individual.keys());
        const events = await this.eventSystem.getEventHistory({ limit: 1000 });
        
        // Calculate analytics data
        const totalEvents = events.length;
        const activeAgents = agents.length;
        const successRate = 94.5; // Mock success rate
        const avgResponseTime = 245; // Mock response time
        
        // Generate mock trends data
        const now = new Date();
        const labels = [];
        const eventCounts = [];
        const successRates = [];
        
        for (let i = 5; i >= 0; i--) {
          const time = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
          labels.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          eventCounts.push(Math.floor(Math.random() * 200) + 100);
          successRates.push(Math.floor(Math.random() * 10) + 90);
        }
        
        // Mock agent performance data
        const agentPerformance = agents.slice(0, 3).map((_agentId, index) => ({
          name: `Agent ${String.fromCharCode(65 + index)}`,
          events: Math.floor(Math.random() * 300) + 100,
          successRate: Math.floor(Math.random() * 10) + 90,
          avgTime: Math.floor(Math.random() * 100) + 150
        }));
        
        // Mock event types
        const eventTypes = [
          { type: 'Query', count: Math.floor(totalEvents * 0.6), percentage: 60.0 },
          { type: 'Process', count: Math.floor(totalEvents * 0.3), percentage: 30.0 },
          { type: 'Analyze', count: Math.floor(totalEvents * 0.1), percentage: 10.0 }
        ];
        
        // Mock system health
        const systemHealth = {
          cpu: Math.floor(Math.random() * 30) + 50,
          memory: Math.floor(Math.random() * 30) + 60,
          network: Math.floor(Math.random() * 30) + 40,
          storage: Math.floor(Math.random() * 30) + 30
        };
        
        res.json({
          totalEvents,
          activeAgents,
          successRate,
          avgResponseTime,
          overview: {
            totalEvents,
            activeAgents,
            successRate,
            avgResponseTime
          },
          trends: {
            labels,
            events: eventCounts,
            successRates
          },
          agentPerformance,
          eventTypes,
          systemHealth
        });
      } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
      }
    });

    this.app.get('/api/activity-pulse', async (req, res) => {
      try {
        const timeRange = req.query.timeRange as string || '24h';
        const events = await this.eventSystem.getEventHistory({ limit: 100 });
        
        // Generate pulse data based on time range
        const pulseData = [];
        const now = new Date();
        const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 1;
        
        for (let i = hours - 1; i >= 0; i--) {
          const time = new Date(now.getTime() - i * 60 * 60 * 1000);
          pulseData.push({
            timestamp: time.toISOString(),
            eventCount: Math.floor(Math.random() * 50) + 10,
            activeAgents: Math.floor(Math.random() * 5) + 2
          });
        }
        
        res.json({
          totalEvents: events.length,
          timeRange,
          pulseData
        });
      } catch (error) {
        console.error('Activity pulse error:', error);
        res.status(500).json({ error: 'Failed to get activity pulse' });
      }
    });

    this.app.get('/api/agent-status', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const agents = Array.from(memorySystem.individual.keys()).map(agentId => {
          const agentData = memorySystem.individual.get(agentId);
          return {
            agentId,
            name: agentId, // Use agentId as name since IndividualMemory doesn't have name
            type: 'unknown', // Default type since IndividualMemory doesn't have type
            status: 'online',
            eventsCount: Math.floor(Math.random() * 100) + 10,
            successRate: Math.random() * 0.2 + 0.8, // 80-100%
            averageResponseTime: Math.floor(Math.random() * 200) + 100,
            lastSeen: new Date().toISOString()
          };
        });
        
        res.json({ agents });
      } catch (error) {
        console.error('Agent status error:', error);
        res.status(500).json({ error: 'Failed to get agent status' });
      }
    });

    this.app.post('/api/agent-ping/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        const memorySystem = this.memoryManager.getMemorySystem();
        const agentData = memorySystem.individual.get(agentId);
        
        if (!agentData) {
          res.status(404).json({ error: 'Agent not found' });
          return;
        }
        
        // Simulate ping response
        res.json({
          success: true,
          agentId,
          responseTime: Math.floor(Math.random() * 100) + 50,
          status: 'online',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Agent ping error:', error);
        res.status(500).json({ error: 'Failed to ping agent' });
      }
    });

    this.app.get('/api/collaboration/register', async (_req, res) => {
      try {
        res.json({ success: true, message: 'Collaboration registration endpoint ready' });
      } catch (error) {
        console.error('Collaboration registration error:', error);
        res.status(500).json({ error: 'Failed to register collaboration' });
      }
    });

    this.app.post('/api/collaboration/register', async (req, res) => {
      try {
        const { agentId, agentType, capabilities } = req.body;
        
        // Store collaboration agent info
        await this.memoryManager.store(agentId, {
          name: agentId,
          type: agentType,
          capabilities: capabilities || [],
          status: 'online',
          lastSeen: new Date(),
          createdAt: new Date()
        }, 'individual', 'collaboration_agent');
        
        res.json({ success: true, agentId, message: 'Collaboration agent registered' });
      } catch (error) {
        console.error('Collaboration registration error:', error);
        res.status(500).json({ error: 'Failed to register collaboration agent' });
      }
    });

    this.app.get('/api/collaboration/agents', async (_req, res) => {
      try {
        const memorySystem = this.memoryManager.getMemorySystem();
        const agents = Array.from(memorySystem.individual.keys())
          .filter(agentId => {
            // Filter based on agentId pattern or other criteria since IndividualMemory doesn't have type
            return agentId.includes('collaboration') || agentId.includes('dashboard');
          })
          .map(agentId => {
            const agentData = memorySystem.individual.get(agentId);
            return {
              id: agentId,
              name: agentId, // Use agentId as name
              type: 'collaboration_agent', // Default type
              capabilities: agentData?.capabilities?.map(cap => cap.name) || [],
              status: 'online',
              lastSeen: new Date().toISOString()
            };
          });
        
        res.json({ agents });
      } catch (error) {
        console.error('Collaboration agents error:', error);
        res.status(500).json({ error: 'Failed to get collaboration agents' });
      }
    });

    this.app.post('/api/collaboration/message', async (req, res) => {
      try {
        const { message, targetAgent } = req.body;
        
        // Log the coordination message
        await this.eventSystem.publishEvent({
          sessionId: 'collaboration',
          agentId: 'vue-dashboard-collaboration',
          type: EventType.AGENT_MESSAGE,
          payload: {
            message,
            targetAgent,
            timestamp: new Date().toISOString()
          }
        });
        
        res.json({ success: true, message: 'Coordination message sent' });
      } catch (error) {
        console.error('Collaboration message error:', error);
        res.status(500).json({ error: 'Failed to send coordination message' });
      }
    });

    // Human notification endpoints
    this.app.get('/api/notifications', async (_req, res) => {
      try {
        const includeAcknowledged = _req.query.includeAcknowledged === 'true';
        const notifications = this.humanNotificationSystem.getNotifications(includeAcknowledged);
        res.json({ notifications });
      } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
      }
    });

    this.app.post('/api/notifications/:id/acknowledge', async (req, res) => {
      try {
        const { id } = req.params;
        const success = this.humanNotificationSystem.acknowledgeNotification(id);
        if (success) {
          res.json({ success: true, message: 'Notification acknowledged' });
        } else {
          res.status(404).json({ error: 'Notification not found' });
        }
      } catch (error) {
        console.error('Acknowledge notification error:', error);
        res.status(500).json({ error: 'Failed to acknowledge notification' });
      }
    });

    this.app.post('/api/notifications', async (req, res) => {
      try {
        const { type, priority, title, message, agentId, sessionId, actionRequired, context } = req.body;
        const notificationId = this.humanNotificationSystem.addNotification({
          type,
          priority,
          title,
          message,
          agentId,
          sessionId,
          actionRequired: actionRequired || false,
          context
        });
        res.json({ success: true, notificationId, message: 'Notification created' });
      } catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({ error: 'Failed to create notification' });
      }
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket, _req) => {
      const connectionId = uuidv4();
      this.connectedClients.set(connectionId, ws);

      console.log(`WebSocket client connected: ${connectionId}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        connectionId,
        message: 'Connected to Unified Multi-Agent Server',
        timestamp: new Date().toISOString()
      }));

      ws.on('message', async (data) => {
        try {
          const messageStr = data.toString();
          let message;
          
          try {
            message = JSON.parse(messageStr);
          } catch (parseError) {
            console.error('Invalid JSON in WebSocket message:', parseError);
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Invalid JSON format',
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          await this.handleWebSocketMessage(connectionId, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: new Date().toISOString()
          }));
        }
      });

      ws.on('close', () => {
        this.connectedClients.delete(connectionId);
        console.log(`WebSocket client disconnected: ${connectionId}`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${connectionId}:`, error);
        this.connectedClients.delete(connectionId);
      });
    });

    console.log(`WebSocket server listening on port ${WS_PORT}`);
  }

  private async handleWebSocketMessage(connectionId: string, message: any) {
    const ws = this.connectedClients.get(connectionId);
    if (!ws) return;

    try {
      switch (message.type) {
        case 'create_task':
          const defaultRequirements = {
            skills: [],
            tools: [],
            dependencies: [],
            deliverables: [],
            acceptanceCriteria: []
          };
          const task = await this.collaborationHub.createTask(
            message.sessionId || 'default-session',
            message.agentId,
            message.description,
            message.requirements || defaultRequirements,
            message.parentTaskId
          );
          this.broadcastToAll({
            type: 'task_created',
            data: task,
            timestamp: new Date().toISOString()
          });
          break;

        case 'log_event':
          const eventId = await this.eventSystem.publishEvent(message.data);
          this.broadcastToAll({
            type: 'event_logged',
            data: { eventId, ...message.data },
            timestamp: new Date().toISOString()
          });
          break;

        case 'notify_human':
          // AI agents can use this to notify humans
          const notificationId = this.humanNotificationSystem.addNotification({
            type: message.notificationType || 'intervention_required',
            priority: message.priority || 'medium',
            title: message.title,
            message: message.message,
            agentId: message.agentId,
            sessionId: message.sessionId,
            actionRequired: message.actionRequired || false,
            context: message.context
          });
          
          // Broadcast notification to all connected clients
          this.broadcastToAll({
            type: 'human_notification',
            data: {
              id: notificationId,
              type: message.notificationType,
              priority: message.priority,
              title: message.title,
              message: message.message,
              agentId: message.agentId,
              timestamp: new Date().toISOString(),
              actionRequired: message.actionRequired
            },
            timestamp: new Date().toISOString()
          });
          break;

        case 'memory_store':
          const memoryId = await this.memoryManager.store(
            message.agentId,
            message.memory,
            message.scope,
            message.type
          );
          this.broadcastToAll({
            type: 'memory_stored',
            data: { memoryId, agentId: message.agentId },
            timestamp: new Date().toISOString()
          });
          break;

        case 'memory_search':
          const results = await this.memoryManager.search(message.query, message.scope);
          ws.send(JSON.stringify({
            type: 'memory_search_results',
            data: results,
            timestamp: new Date().toISOString()
          }));
          break;

        case 'heartbeat':
          ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      console.error('WebSocket message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Message processing failed',
        timestamp: new Date().toISOString()
      }));
    }
  }

  private broadcastToAll(message: any) {
    const messageStr = JSON.stringify(message);
    this.connectedClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Error broadcasting message:', error);
        }
      }
    });
  }

  /**
   * Sanitize payload to prevent JSON escape issues
   */
  private sanitizePayload(payload: any): any {
    if (typeof payload === 'string') {
      // Remove or escape problematic characters
      return payload
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    }
    
    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizePayload(item));
    }
    
    if (payload && typeof payload === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(payload)) {
        sanitized[key] = this.sanitizePayload(value);
      }
      return sanitized;
    }
    
    return payload;
  }

  private setupEventHandlers() {
    // Handle collaboration events
    this.eventSystem.on('event', async (event) => {
      console.log(`📡 Event received: ${event.type} from ${event.agentId}`);
      
      // Broadcast to all connected clients
      this.broadcastToAll({
        type: 'event_received',
        data: event,
        timestamp: new Date().toISOString()
      });
    });
  }

  private async startMcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🌐 Starting Network MCP Server on port ${this.config.mcp.port}...`);
      
      try {
        // Spawn Network MCP server process
        this.mcpProcess = spawn('node', [this.config.mcp.serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            DATABASE_PATH: this.config.memory.databasePath,
            MCP_PORT: this.config.mcp.port.toString(),
            MCP_SERVER_MODE: 'network'
          }
        });

        // Handle process events
        this.mcpProcess.on('spawn', () => {
          console.log(`✅ MCP Server spawned successfully (PID: ${this.mcpProcess?.pid})`);
          resolve();
        });

        this.mcpProcess.on('error', (error) => {
          console.error('❌ MCP Server spawn error:', error);
          reject(error);
        });

        this.mcpProcess.on('exit', (code, signal) => {
          console.log(`🔗 MCP Server exited with code ${code}, signal ${signal}`);
          
          // Auto-restart if enabled and exit was unexpected
          if (this.config.mcp.autoRestart && code !== 0) {
            console.log('🔄 Auto-restarting MCP Server...');
            setTimeout(() => {
              this.startMcpServer().catch(console.error);
            }, 2000);
          }
        });

        // Log MCP server output
        this.mcpProcess.stdout?.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.log(`[MCP] ${output}`);
          }
        });

        this.mcpProcess.stderr?.on('data', (data) => {
          const error = data.toString().trim();
          if (error) {
            console.error(`[MCP Error] ${error}`);
          }
        });

        // Resolve immediately if process spawns successfully
        setTimeout(() => {
          if (this.mcpProcess && !this.mcpProcess.killed) {
            resolve();
          }
        }, 1000);

      } catch (error) {
        console.error('❌ Failed to start MCP server:', error);
        reject(error);
      }
    });
  }

  private async stopMcpServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.mcpProcess) {
        console.log('🔗 Stopping MCP Server...');
        
        // Set up exit handler
        const exitHandler = () => {
          console.log('✅ MCP Server stopped');
          this.mcpProcess = null;
          resolve();
        };

        this.mcpProcess.once('exit', exitHandler);
        
        // Try graceful shutdown first
        this.mcpProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds if needed
        setTimeout(() => {
          if (this.mcpProcess && !this.mcpProcess.killed) {
            console.log('🔗 Force killing MCP Server...');
            this.mcpProcess.kill('SIGKILL');
            exitHandler();
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }

  async start() {
    try {
      // Start MCP server if enabled
      if (this.config.mcp.enabled) {
        await this.startMcpServer();
      }

      // Start the server
      this.server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Unified Multi-Agent Server started successfully!`);
        console.log(`📊 REST API: http://localhost:${PORT}`);
        console.log(`🔌 WebSocket: ws://localhost:${WS_PORT}`);
        console.log(`📈 Dashboard: http://localhost:${PORT}/health`);
        console.log('');
        console.log(`💾 Memory System: ✅ Initialized`);
        console.log(`🤝 Collaboration: ✅ Active`);
        console.log(`📢 Events: ✅ Active`);
        if (this.config.mcp.enabled && this.mcpProcess) {
          console.log(`🌐 Network MCP Server: ✅ Running (PID: ${this.mcpProcess.pid}, Port: ${this.config.mcp.port})`);
        }
        console.log('');
        console.log('🎯 Ready for multi-agent collaboration!');
      });
    } catch (error) {
      console.error('Failed to start Unified Server:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('🛑 Stopping Unified Multi-Agent Server...');
    
    // Stop MCP server
    await this.stopMcpServer();

    // Close WebSocket connections
    this.connectedClients.forEach((ws) => {
      ws.close();
    });
    this.connectedClients.clear();

    // Close WebSocket server
    this.wss.close();

    // Close HTTP server
    this.server.close();

    // Cleanup systems
    this.memoryManager.close();
    this.eventSystem.close();

    console.log('✅ Server stopped successfully');
  }
}

// Default configuration
const defaultConfig: UnifiedServerConfig = {
  memory: {
    databasePath: './data/unified-memory.db',
    maxMemorySize: 1000
  },
  collaboration: {
    maxConcurrentTasks: 50,
    taskTimeoutMs: 300000 // 5 minutes
  },
  events: {
    maxEventHistory: 10000,
    eventRetentionDays: 30
  },
  mcp: {
    enabled: true,
    serverPath: './dist/unified-neural-mcp-server.js',
    port: 6174,
    autoRestart: true
  }
};

// Start server if this file is run directly (ES module compatibility)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const server = new UnifiedServer(defaultConfig);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { UnifiedServer };
export type { UnifiedServerConfig };