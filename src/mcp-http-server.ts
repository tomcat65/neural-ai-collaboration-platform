import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { MemoryManager } from './unified-server/memory/index.js';
import {
  CreateEntitiesRequestSchema,
  CreateRelationsRequestSchema,
  AddObservationsRequestSchema,
  SearchNodesRequestSchema,
  OpenNodesRequestSchema,
} from './types.js';
import { userTeamTools, getUserTeamToolHandler } from './tools/userTeamTools.js';
import { UnifiedToolSchemas } from './shared/toolSchemas.js';
import { MessageHubIntegration } from './message-hub/hub-integration.js';

// Network-accessible MCP Server for AI-to-AI communication
export class NetworkMCPServer {
  private server: Server;
  private memoryManager: MemoryManager;
  private userTeamToolHandler: ReturnType<typeof getUserTeamToolHandler>;
  private app!: express.Application;
  private agentId: string;
  private sessionId: string;
  private port: number;
  private messageHub?: MessageHubIntegration;

  constructor(port: number = 5174, dbPath?: string) {
    this.port = port;
    this.memoryManager = new MemoryManager(dbPath);
    this.agentId = 'network-mcp-server';
    this.sessionId = 'mcp-network-session';
    
    this.server = new Server(
      {
        name: 'shared-memory-mcp-network',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // this.userTeamToolHandler = getUserTeamToolHandler(this.memoryManager);
    this.setupToolHandlers();
    this.setupExpressServer();
    this.registerWithUnifiedServer();
    this.initializeMessageHub();
  }

  private async initializeMessageHub() {
    try {
      const hubPort = parseInt(process.env.MESSAGE_HUB_PORT || '3003', 10);
      this.messageHub = new MessageHubIntegration(hubPort, this.port);
      this.messageHub.integrateWithMCPServer(this);
      
      // Add WebSocket notification middleware to existing routes
      this.app.use('/ai-message', this.messageHub.createNotificationMiddleware());
      
      console.log(`🔗 Message Hub integration initialized on port ${hubPort}`);
    } catch (error) {
      console.error('❌ Failed to initialize Message Hub:', error);
    }
  }

  private setupExpressServer() {
    this.app = express();
    this.app.use(cors());
    
    // Apply raw parser specifically to /ai-message route before any JSON parsing
    this.app.use('/ai-message', express.raw({ type: '*/*', limit: '10mb' }));
    
    // API key middleware (enabled when API_KEY is set)
    this.app.use((req: any, res: any, next: any) => {
      const open = new Set<string>(['/health']);
      if (!process.env.API_KEY || open.has(req.path)) return next();
      const headerKey = (req.headers['x-api-key'] as string) || (req.headers['X-API-Key'] as string);
      const queryKey = (req.query && (req.query.api_key as string)) || undefined;
      const provided = headerKey || queryKey;
      if (provided === process.env.API_KEY) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    });

    // Apply JSON parser to all other routes
    this.app.use((req, res, next) => {
      if (req.path === '/ai-message') {
        return next(); // Skip JSON parsing for ai-message - already handled by raw
      }
      express.json()(req, res, next);
    });

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: 'network-mcp-server',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        port: this.port,
        agentId: this.agentId
      });
    });

    // Direct HTTP API endpoints for MCP tools (immediate access)
    this.app.get('/api/tools', async (_req, res) => {
      try {
        const tools = await this._handleToolsList();
        res.json(tools);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;
        const result = await this._handleToolCall(toolName, args);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    this.app.get('/api/tools/search_nodes/:query', async (req, res) => {
      try {
        const { query } = req.params;
        const result = await this._handleToolCall('search_nodes', { query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // MCP over HTTP endpoint - JSON-RPC over HTTP (not SSE)
    this.app.post('/mcp', async (req, res) => {
      // Set proper JSON headers first
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      
      try {
        console.log('🔗 MCP Request received:', req.body);
        
        const { jsonrpc = '2.0', id, method, params = {} } = req.body || {};
        const defaultProtocolVersion = '2024-11-05';
        const requestedProtocolVersion = (params && typeof params === 'object' ? (params as any)?.protocolVersion : undefined)
          ?? (req.body?.protocolVersion)
          ?? defaultProtocolVersion;
        let result;
        
        // Handle empty requests (initialization handshake)
        if (!method) {
          console.log('🤝 MCP Initialization handshake');
          return res.json({
            jsonrpc: '2.0',
            id: id ?? 1,
            result: {
              protocolVersion: requestedProtocolVersion,
              capabilities: {
                tools: {},
                prompts: {},
                resources: {}
              },
              serverInfo: {
                name: 'shared-memory-mcp-network',
                version: '0.1.0'
              }
            }
          });
        }

        // Handle MCP methods with proper JSON-RPC response format
        switch (method) {
          case 'initialize':
            result = {
              protocolVersion: requestedProtocolVersion,
              capabilities: {
                tools: {},
                prompts: {},
                resources: {}
              },
              serverInfo: {
                name: 'shared-memory-mcp-network',
                version: '0.1.0'
              }
            };
            break;
            
          case 'tools/list':
            result = await this._handleToolsList();
            break;
            
          case 'tools/call':
            result = await this._handleToolCall(params.name, params.arguments);
            break;
            
          default:
            return res.json({
              jsonrpc: '2.0',
              id: id ?? 1,
              error: {
                code: -32601,
                message: `Method not found: ${method}`
              }
            });
        }
        
        console.log('✅ MCP request processed via HTTP');
        return res.json({
          jsonrpc: '2.0',
          id: id ?? 1,
          result
        });
        
      } catch (error) {
        console.error('❌ MCP request error:', error);
        return res.json({
          jsonrpc: '2.0',
          id: (req.body?.id ?? 1),
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        });
      }
    });

    // Server-Sent Events endpoint for MCP communication
    this.app.get('/mcp/events', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      console.log('🔄 SSE client connected for MCP events');

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
        console.log('📡 SSE client disconnected');
      });
    });

    // Direct AI-to-AI messaging endpoint - handles raw JSON data
    this.app.post('/ai-message', async (req: any, res) => {
      console.error('🚨 ENDPOINT HIT - IMMEDIATE LOG');
      try {
        console.error('🔍 ULTRA DEBUG - Request received');
        console.error('🔍 ULTRA DEBUG - Headers:', req.headers);
        console.error('🔍 ULTRA DEBUG - Body type:', typeof req.body);
        console.error('🔍 ULTRA DEBUG - Body:', req.body);
        console.error('🔍 ULTRA DEBUG - Is Buffer:', Buffer.isBuffer(req.body));
        console.error('🔍 ULTRA DEBUG - Body constructor:', req.body?.constructor?.name);
        
        let parsedData: any;
        
        // Handle different body types
        if (Buffer.isBuffer(req.body)) {
          console.log('🔍 ULTRA DEBUG - Processing as Buffer');
          const rawString = req.body.toString('utf8');
          console.log('🔍 Raw string length:', rawString.length);
          console.log('🔍 Raw string sample:', rawString.substring(0, 300));
          
          try {
            parsedData = JSON.parse(rawString);
            console.log('✅ JSON parsed successfully');
          } catch (parseError: any) {
            console.log('❌ JSON parse failed:', parseError.message);
            console.log('🔍 Error position:', parseError.message.match(/position (\d+)/)?.[1]);
            
            // Try various cleaning strategies
            let cleanedString = rawString;
            
            // Remove non-printable characters except common ones
            cleanedString = cleanedString.replace(/[^\x20-\x7E\n\r\t]/g, '');
            console.log('🧹 After non-printable removal:', cleanedString.substring(0, 200));
            
            try {
              parsedData = JSON.parse(cleanedString);
              console.log('✅ JSON parsed after cleaning');
            } catch (secondParseError: any) {
              console.log('❌ Second parse failed:', secondParseError.message);
              
              // Last resort: try to extract basic fields manually
              try {
                const fromMatch = rawString.match(/"from"\s*:\s*"([^"]+)"/);
                const toMatch = rawString.match(/"to"\s*:\s*"([^"]+)"/);
                const messageMatch = rawString.match(/"(?:message|content)"\s*:\s*"([^"]+)"/);
                
                parsedData = {
                  from: fromMatch?.[1] || 'unknown',
                  to: toMatch?.[1] || 'unknown',
                  message: messageMatch?.[1] || 'Failed to parse message content',
                  content: messageMatch?.[1] || 'Failed to parse message content'
                };
                console.log('🔧 Manual extraction result:', parsedData);
              } catch (manualError) {
                console.log('❌ Manual extraction failed:', manualError);
                parsedData = { from: 'unknown', to: 'unknown', message: 'Parse error', content: 'Parse error' };
              }
            }
          }
        } else if (typeof req.body === 'string') {
          console.log('🔍 ULTRA DEBUG - Processing as String');
          console.log('🔍 String content:', req.body.substring(0, 300));
          try {
            parsedData = JSON.parse(req.body);
            console.log('✅ String JSON parsed successfully');
          } catch (parseError: any) {
            console.log('❌ String JSON parse failed:', parseError.message);
            parsedData = { from: 'unknown', to: 'unknown', message: req.body, content: req.body };
          }
        } else if (typeof req.body === 'object' && req.body !== null) {
          console.log('🔍 ULTRA DEBUG - Processing as Object');
          parsedData = req.body;
        } else {
          console.log('🔍 ULTRA DEBUG - Unknown body type, using fallback');
          parsedData = { from: 'unknown', to: 'unknown', message: 'Unknown body type', content: 'Unknown body type' };
        }
        
        console.error('🔍 ULTRA DEBUG - Final parsed data:', JSON.stringify(parsedData, null, 2));
        
        const from = parsedData.from || 'system';
        const explicitTo = parsedData.to || parsedData.agentId;
        const messageType = parsedData.messageType || parsedData.type || 'direct';
        const priority = parsedData.priority || 'normal';
        const content = parsedData.content || parsedData.message || parsedData.payload?.content || parsedData.payload?.message;
        const broadcast = parsedData.broadcast === true || explicitTo === '*';
        const excludeSelf = parsedData.excludeSelf !== false; // default true
        const capSelector: string[] | undefined = parsedData.toCapabilities || parsedData.capabilities;

        console.error('🔍 ULTRA DEBUG - Extracted fields:');
        console.error('  from:', from);
        console.error('  to:', explicitTo);
        console.error('  content:', content);
        console.error('  messageType:', messageType);
        console.error('  broadcast:', broadcast);
        console.error('  toCapabilities:', capSelector);
        
        if (!content) {
          return res.status(400).json({ error: 'Missing required field: content' });
        }

        // Resolve recipients: direct, broadcast, or by capabilities
        let recipients: string[] = [];
        if (!broadcast && explicitTo) {
          recipients = [explicitTo];
        } else if (broadcast) {
          const regs = await this.memoryManager.search('agent_registration', { shared: true });
          recipients = regs
            .map((r: any) => r?.content?.agentId)
            .filter((id: any) => typeof id === 'string' && id.length > 0);
          if (excludeSelf) recipients = recipients.filter(id => id !== from);
        } else if (capSelector && capSelector.length > 0) {
          const want = capSelector.map((c: string) => String(c).toLowerCase());
          const regs = await this.memoryManager.search('agent_registration', { shared: true });
          recipients = regs
            .filter((r: any) => Array.isArray(r?.content?.capabilities))
            .filter((r: any) => {
              const caps = r.content.capabilities.map((c: any) => String(c).toLowerCase());
              return want.every(w => caps.includes(w));
            })
            .map((r: any) => r.content.agentId)
            .filter((id: any) => typeof id === 'string' && id.length > 0);
          if (excludeSelf) recipients = recipients.filter(id => id !== from);
        } else {
          return res.status(400).json({ error: 'Missing recipient: provide `to`, `broadcast: true`, or `toCapabilities`' });
        }

        // De-duplicate recipients
        recipients = Array.from(new Set(recipients));

        const results: { to: string; messageId: string }[] = [];
        for (const to of recipients) {
          console.log(`💬 AI Message: ${from} → ${to}: ${content}`);

          const messageId = await this.memoryManager.store(from || 'system', {
            id: `message-${Date.now()}`,
            to,
            target: to,
            content,
            message: content,
            messageType,
            priority,
            timestamp: new Date().toISOString()
          }, 'shared', 'ai_message');

          await this.publishEventToUnified('ai.message', {
            from,
            to,
            content,
            messageType,
            priority,
            messageId
          });

          results.push({ to, messageId });
        }

        return res.json({
          status: results.length > 0 ? 'delivered' : 'no_recipients',
          recipients,
          sentCount: results.length,
          messageIds: results,
          selection: {
            mode: broadcast ? 'broadcast' : (capSelector?.length ? 'capabilities' : 'direct'),
            capabilities: capSelector || [],
            excludeSelf
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ AI message error:', error);
        return res.status(500).json({ error: 'Message delivery failed' });
      }
    });

    // Get messages for an AI agent (supports optional filtering via query)
    this.app.get('/ai-messages/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        const { since, messageType, limit } = req.query as { since?: string; messageType?: string; limit?: string };
        
        // Search for messages where this agent is the recipient (to or target field)
        // We need to search for content that contains the agentId in either "to" or "target" field
        const toSearchResults = await this.memoryManager.search(`"to":"${agentId}"`, { shared: true });
        const targetSearchResults = await this.memoryManager.search(`"target":"${agentId}"`, { shared: true });
        
        // Also search for messages sent by this agent
        const sentMessages = await this.memoryManager.search(agentId, { shared: true });
        
        // Combine and filter for actual messages (type: ai_message)
        const allResults = [...toSearchResults, ...targetSearchResults, ...sentMessages];
        let messageResults = allResults.filter(result => {
          // Check if this is an AI message by examining the content structure
          return result.content && (result.content.message || result.content.to || result.content.target);
        });

        // Apply optional messageType filter
        if (messageType) {
          const wanted = String(messageType).toLowerCase();
          messageResults = messageResults.filter(r => {
            const t = (r.content?.messageType || r.content?.type || '').toString().toLowerCase();
            return t === wanted;
          });
        }

        // Apply optional since filter
        if (since) {
          const sinceDate = new Date(since);
          if (!isNaN(sinceDate.getTime())) {
            messageResults = messageResults.filter(r => {
              const ts = new Date(r.timestamp || r.content?.timestamp);
              return !isNaN(ts.getTime()) && ts >= sinceDate;
            });
          }
        }

        // Remove duplicates and format response
        const uniqueMessages = new Map();
        messageResults.forEach(result => {
          if (!uniqueMessages.has(result.id)) {
            uniqueMessages.set(result.id, {
              id: result.id,
              content: result.content,
              timestamp: result.timestamp,
              from: result.source || 'unknown'
            });
          }
        });
        const list = Array.from(uniqueMessages.values());
        const max = limit ? Math.max(0, Math.min(parseInt(String(limit), 10) || 50, list.length)) : list.length;
        res.json({
          agentId,
          messages: list.slice(0, max)
        });

      } catch (error) {
        console.error('❌ Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
      }
    });
    
    // Debug endpoint to see all stored messages
    this.app.get('/debug/all-messages', async (req, res) => {
      try {
        const searchResults = await this.memoryManager.search('', { shared: true });
        res.json({
          total: searchResults.length,
          messages: searchResults.filter(r => r.content && (r.content.message || r.content.content))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Comprehensive system status endpoint
    this.app.get('/system/status', async (req, res) => {
      try {
        const memoryStatus = await this.memoryManager.getSystemStatus();
        
        // Get memory statistics
        const memoryStats = {
          individualAgents: this.memoryManager.getMemorySystem().individual.size,
          sharedKnowledge: this.memoryManager.getSharedMemory().knowledge.length,
          activeTasks: this.memoryManager.getSharedMemory().tasks.tasks.size,
          projectArtifacts: this.memoryManager.getSharedMemory().artifacts.length,
          consensusDecisions: this.memoryManager.getSharedMemory().decisions.length
        };

        // Get advanced system statistics if available
        let advancedStats: any = {};
        if (memoryStatus.advancedSystemsEnabled) {
          try {
            if (memoryStatus.redis.connected && this.memoryManager.redisClient) {
              const redisStats = await this.memoryManager.redisClient.getCacheStats();
              advancedStats.redis = redisStats;
            }
            
            if (memoryStatus.weaviate.connected && this.memoryManager.weaviateClient) {
              const weaviateStats = await this.memoryManager.weaviateClient.getStatistics();
              advancedStats.weaviate = weaviateStats;
            }
            
            // Neo4j stats would require additional implementation
            advancedStats.neo4j = { status: 'connected', note: 'Statistics not yet implemented' };
          } catch (statsError) {
            console.warn('⚠️ Error getting advanced system statistics:', statsError);
          }
        }

        const systemStatus = {
          timestamp: new Date().toISOString(),
          service: 'shared-memory-mcp',
          version: '0.1.0',
          uptime: process.uptime(),
          memory: {
            used: process.memoryUsage(),
            system: memoryStats
          },
          databases: memoryStatus,
          advanced: advancedStats,
          messageHub: this.messageHub ? {
            enabled: true,
            port: 3003,
            status: 'active'
          } : {
            enabled: false
          },
          endpoints: {
            health: `/health`,
            aiMessages: `/ai-message`,
            getMessages: `/ai-messages/:agentId`,
            mcpProtocol: `/mcp`,
            systemStatus: `/system/status`,
            debug: `/debug/all-messages`
          }
        };

        res.json(systemStatus);
      } catch (error) {
        console.error('❌ System status error:', error);
        res.status(500).json({ 
          error: 'Failed to get system status',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private async registerWithUnifiedServer() {
    try {
      const baseUrl = process.env.UNIFIED_SERVER_URL;
      if (!baseUrl) {
        console.debug('Unified server URL not set; skipping registration');
        return;
      }
      const response = await fetch(`${baseUrl}/api/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: this.agentId,
          name: 'Network MCP Server',
          capabilities: ['ai-to-ai-messaging', 'mcp-protocol', 'memory-management'],
          sessionId: this.sessionId,
          endpoint: `http://localhost:${this.port}`
        })
      });
      
      if (response.ok) {
        console.log('✅ Network MCP Server registered with unified platform');
      } else {
        console.warn('⚠️ Failed to register with unified platform:', response.status);
      }
    } catch (error) {
      console.warn('⚠️ Unified server not available:', error);
    }
  }

  private async publishEventToUnified(type: string, payload: any) {
    try {
      const baseUrl = process.env.UNIFIED_SERVER_URL;
      if (!baseUrl) return; // Silently skip when not configured
      await fetch(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: this.agentId,
          sessionId: this.sessionId,
          type,
          payload
        })
      });
    } catch (error) {
      console.warn('⚠️ Failed to publish event to unified server:', error);
    }
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: UnifiedToolSchemas.send_ai_message.name,
            description: UnifiedToolSchemas.send_ai_message.description,
            inputSchema: UnifiedToolSchemas.send_ai_message.inputSchema
          },
          {
            name: 'get_ai_messages',
            description: 'Get messages sent to this AI agent',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'AI agent ID to get messages for' }
              },
              required: ['agentId']
            }
          },
          {
            name: UnifiedToolSchemas.create_entities.name,
            description: UnifiedToolSchemas.create_entities.description,
            inputSchema: UnifiedToolSchemas.create_entities.inputSchema,
          },
          // Note: `search_nodes` is deprecated and intentionally omitted from tools list.
          {
            name: UnifiedToolSchemas.add_observations.name,
            description: UnifiedToolSchemas.add_observations.description,
            inputSchema: UnifiedToolSchemas.add_observations.inputSchema,
          },
          {
            name: UnifiedToolSchemas.create_relations.name,
            description: UnifiedToolSchemas.create_relations.description,
            inputSchema: UnifiedToolSchemas.create_relations.inputSchema,
          },
          {
            name: UnifiedToolSchemas.read_graph.name,
            description: UnifiedToolSchemas.read_graph.description,
            inputSchema: UnifiedToolSchemas.read_graph.inputSchema,
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      return await this._handleToolCall(name, args);
    });
  }

  private async _handleToolsList() {
    return {
      tools: [
        {
          name: UnifiedToolSchemas.send_ai_message.name,
          description: UnifiedToolSchemas.send_ai_message.description,
          inputSchema: UnifiedToolSchemas.send_ai_message.inputSchema
        },
        {
          name: 'get_ai_messages',
          description: 'Get messages sent to this AI agent',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string', description: 'AI agent ID to get messages for' }
            },
            required: ['agentId']
          }
        },
        {
          name: 'create_entities',
          description: 'Create multiple new entities in the knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'The name of the entity' },
                    entityType: { type: 'string', description: 'The type of the entity' },
                    observations: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'An array of observation contents associated with the entity',
                    },
                  },
                  required: ['name', 'entityType', 'observations'],
                },
              },
            },
            required: ['entities'],
          },
        },
        // Note: `search_nodes` is deprecated and intentionally omitted from tools list.
        {
          name: 'add_observations',
          description: 'Add new observations to existing entities in the knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              observations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    entityName: { type: 'string', description: 'The name of the entity to add the observations to' },
                    contents: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'An array of observation contents to add' 
                    }
                  },
                  required: ['entityName', 'contents']
                }
              }
            },
            required: ['observations']
          }
        },
        {
          name: 'create_relations',
          description: 'Create multiple new relations between entities in the knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              relations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string', description: 'The name of the entity where the relation starts' },
                    to: { type: 'string', description: 'The name of the entity where the relation ends' },
                    relationType: { type: 'string', description: 'The type of the relation' }
                  },
                  required: ['from', 'to', 'relationType']
                }
              }
            },
            required: ['relations']
          }
        },
        {
          name: 'read_graph',
          description: 'Read the entire knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    };
  }

  private async _handleToolCall(name: string, args: any = {}) {
    try {
      switch (name) {
        case 'send_ai_message': {
          // Normalize args and forward to HTTP endpoint which handles routing
          const payload = {
            from: args.from || args.agentId || this.agentId,
            to: args.to || args.agentId,
            content: args.content ?? args.message,
            message: args.content ?? args.message, // keep legacy field for compatibility with endpoint
            messageType: args.messageType || args.type || 'direct',
            priority: args.priority || 'normal',
            toCapabilities: args.toCapabilities || args.capabilities,
            capabilities: args.toCapabilities || args.capabilities,
            broadcast: args.broadcast === true || (args.to === '*'),
            excludeSelf: args.excludeSelf !== false
          };

          if (!payload.content) {
            throw new Error('Missing required field: content');
          }

          const response = await fetch(`http://localhost:${this.port}/ai-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await response.json();
          return {
            content: [
              { type: 'text', text: JSON.stringify(result, null, 2) }
            ]
          };
        }

        case 'get_ai_messages': {
          const { agentId } = args;
          
          const response = await fetch(`http://localhost:${this.port}/ai-messages/${agentId}`);
          const result = await response.json();
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'create_entities': {
          const parsed = CreateEntitiesRequestSchema.parse(args);
          const agent = args.agentId || this.agentId;
          
          const createdEntities = await Promise.all(parsed.entities.map(async entity => {
            const entityData = {
              name: entity.name,
              type: entity.entityType,
              observations: entity.observations,
              createdBy: agent,
              timestamp: new Date().toISOString()
            };
            
            const entityId = await this.memoryManager.store(agent, entityData, 'shared', 'entity');
            return { id: entityId, ...entityData };
          }));

          await this.publishEventToUnified('knowledge.created', {
            entities: createdEntities,
            agent: agent
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(createdEntities, null, 2),
              },
            ],
          };
        }

        case 'search_nodes': {
          const { query, limit = 50 } = args;
          const searchType = 'graph';
          const searchResults = await this.memoryManager.search(query, { shared: true });
          const results = searchResults.slice(0, limit);
          if (!(global as any)._deprecated_search_nodes_logged) {
            console.warn('⚠️ `search_nodes` is deprecated. Use `search_entities` with { searchType: "graph" }');
            (global as any)._deprecated_search_nodes_logged = true;
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  query,
                  searchType,
                  deprecated: true,
                  total: results.length,
                  results
                }, null, 2),
              },
            ],
          };
        }

        case 'add_observations': {
          const { observations } = args;
          const agent = args.agentId || this.agentId;
          
          const results = await Promise.all(observations.map(async (obs: any) => {
            const observationData = {
              entityName: obs.entityName,
              contents: obs.contents,
              addedBy: agent,
              timestamp: new Date().toISOString()
            };
            
            const observationId = await this.memoryManager.store(agent, observationData, 'shared', 'observation');
            return { id: observationId, ...observationData };
          }));

          await this.publishEventToUnified('knowledge.updated', {
            observations: results,
            agent: agent
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  added: results.length,
                  observations: results
                }, null, 2),
              },
            ],
          };
        }

        case 'create_relations': {
          const { relations } = args;
          const agent = args.agentId || this.agentId;
          
          const createdRelations = await Promise.all(relations.map(async (relation: any) => {
            const relationData = {
              from: relation.from,
              to: relation.to,
              relationType: relation.relationType,
              createdBy: agent,
              timestamp: new Date().toISOString()
            };
            
            const relationId = await this.memoryManager.store(agent, relationData, 'shared', 'relation');
            return { id: relationId, ...relationData };
          }));

          await this.publishEventToUnified('knowledge.relations.created', {
            relations: createdRelations,
            agent: agent
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  created: createdRelations.length,
                  relations: createdRelations
                }, null, 2),
              },
            ],
          };
        }

        case 'read_graph': {
          const agent = args.agentId || this.agentId;
          
          // Get all entities, relations, and observations
          const entities = await this.memoryManager.search('', { shared: true });
          const entitiesOnly = entities.filter(e => e.content?.type === 'entity');
          const relationsOnly = entities.filter(e => e.content?.type === 'relation');
          const observationsOnly = entities.filter(e => e.content?.type === 'observation');
          
          const graphData = {
            timestamp: new Date().toISOString(),
            requestedBy: agent,
            statistics: {
              totalNodes: entities.length,
              entities: entitiesOnly.length,
              relations: relationsOnly.length,
              observations: observationsOnly.length
            },
            graph: {
              entities: entitiesOnly,
              relations: relationsOnly,
              observations: observationsOnly
            }
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(graphData, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          { type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
        ],
        isError: true,
      };
    }
  }

  async start() {
    // Start Message Hub WebSocket server first
    if (this.messageHub) {
      await this.messageHub.start();
    }

    return new Promise<void>((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`🌐 Network MCP Server started on port ${this.port}`);
        console.log(`📡 MCP Endpoint: http://localhost:${this.port}/mcp`);
        console.log(`💬 AI Messaging: http://localhost:${this.port}/ai-message`);
        console.log(`📊 Health Check: http://localhost:${this.port}/health`);
        if (this.messageHub) {
          const hubPort = this.messageHub.getPort();
          console.log(`📡 Message Hub WebSocket: ws://localhost:${hubPort}`);
          console.log('⚡ Real-time notifications: <1 second message discovery');
        }
        console.log('🤖 Ready for AI-to-AI communication!');
        resolve();
      });
    });
  }

  close() {
    this.memoryManager.close();
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.MCP_PORT || '5174');
  const server = new NetworkMCPServer(port);
  
  server.start().catch((error) => {
    console.error('Failed to start Network MCP Server:', error);
    process.exit(1);
  });
}
