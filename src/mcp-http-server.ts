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
      this.messageHub = new MessageHubIntegration(3003, this.port);
      this.messageHub.integrateWithMCPServer(this);
      
      // Add WebSocket notification middleware to existing routes
      this.app.use('/ai-message', this.messageHub.createNotificationMiddleware());
      
      console.log('🔗 Message Hub integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Message Hub:', error);
    }
  }

  private setupExpressServer() {
    this.app = express();
    this.app.use(cors());
    
    // Apply raw parser specifically to /ai-message route before any JSON parsing
    this.app.use('/ai-message', express.raw({ type: '*/*', limit: '10mb' }));
    
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

    // MCP over HTTP endpoint - this is where external AIs connect
    this.app.post('/mcp', async (_req, res) => {
      try {
        console.log('🔗 MCP Request received:', _req.body);
        
        // Create SSE transport for this request
        const transport = new SSEServerTransport('/mcp/events', res);
        
        // Connect the MCP server to this transport
        await this.server.connect(transport);
        
        console.log('✅ MCP client connected via HTTP');
      } catch (error) {
        console.error('❌ MCP connection error:', error);
        res.status(500).json({ error: 'MCP connection failed' });
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
        
        const { from, to, message, type, content } = parsedData;
        
        console.error('🔍 ULTRA DEBUG - Extracted fields:');
        console.error('  from:', from);
        console.error('  to:', to);
        console.error('  message:', message);
        console.error('  content:', content);
        console.error('  type:', type);
        console.error('  payload:', parsedData.payload);
        
        const actualMessage = message || content || parsedData.payload?.message || parsedData.payload?.content;
        
        console.error('🔍 ULTRA DEBUG - actualMessage result:', actualMessage);
        console.log(`💬 AI Message: ${from} → ${to}: ${actualMessage}`);
        
        // Store message in memory system
        const messageId = await this.memoryManager.store(from, {
          id: `message-${Date.now()}`,
          to,
          message: actualMessage,
          type: type || 'direct',
          timestamp: new Date().toISOString()
        }, 'shared', 'ai_message');

        // Send to unified server for routing
        await this.publishEventToUnified('ai.message', {
          from,
          to,
          message: actualMessage,
          type: type || 'direct',
          messageId: messageId
        });

        res.json({
          status: 'delivered',
          messageId: messageId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ AI message error:', error);
        res.status(500).json({ error: 'Message delivery failed' });
      }
    });

    // Get messages for an AI agent
    this.app.get('/ai-messages/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        
        // Search for messages addressed to this agent
        const searchResults = await this.memoryManager.search(`to ${agentId}`, { shared: true });
        
        res.json({
          agentId,
          messages: searchResults.map(result => ({
            id: result.id,
            content: result.content,
            timestamp: result.timestamp,
            from: result.source || 'unknown'
          }))
        });

      } catch (error) {
        console.error('❌ Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
      }
    });
  }

  private async registerWithUnifiedServer() {
    try {
      const response = await fetch('http://localhost:3000/api/agents/register', {
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
      await fetch('http://localhost:3000/api/events', {
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
            name: 'send_ai_message',
            description: 'Send a direct message to another AI agent',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: 'Target AI agent ID' },
                message: { type: 'string', description: 'Message content' },
                type: { type: 'string', description: 'Message type', default: 'direct' }
              },
              required: ['to', 'message']
            }
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
          // Add more tools as needed...
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      return await this._handleToolCall(name, args);
    });
  }

  private async _handleToolCall(name: string, args: any = {}) {
    try {
      switch (name) {
        case 'send_ai_message': {
          const { to, message, type } = args;
          const from = args.agentId || this.agentId;
          
          // Use the HTTP endpoint
          const response = await fetch(`http://localhost:${this.port}/ai-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to, message, type })
          });
          
          const result = await response.json() as { messageId: string };
          
          return {
            content: [
              {
                type: 'text',
                text: `Message sent successfully. ID: ${result.messageId}`,
              },
            ],
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
          console.log(`📡 Message Hub WebSocket: ws://localhost:3003`);
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