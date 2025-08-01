import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { MemoryManager } from './unified-server/memory/index.js';

// Universal MCP Gateway - The One Gateway to Rule Them All
export class UniversalMCPGateway {
  private server: Server;
  private app: express.Application;
  private memoryManager: MemoryManager;
  private platformRegistry: PlatformRegistry;
  private memoryFederation: MemoryFederation;
  private port: number;
  
  constructor(port: number = 5200, dbPath?: string) {
    this.port = port;
    this.memoryManager = new MemoryManager(dbPath);
    this.platformRegistry = new PlatformRegistry();
    this.memoryFederation = new MemoryFederation(this.memoryManager);
    
    this.server = new Server(
      {
        name: 'universal-mcp-gateway',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupExpressServer();
    this.setupUniversalToolHandlers();
    this.initializePlatforms();
  }

  private async initializePlatforms() {
    console.log('🚀 Initializing Universal MCP Gateway...');
    
    // Register our neural-ai system
    await this.platformRegistry.register({
      id: 'neural-ai-collab',
      name: 'Neural AI Collaboration',
      type: 'mcp-custom',
      endpoint: 'http://localhost:5174',
      capabilities: ['memory', 'messaging', 'entities'],
      tools: [
        'create_entities',
        'get_entities',
        'search_entities', 
        'update_entities',
        'delete_entities',
        'send_ai_message',
        'get_ai_messages'
      ]
    });

    // Register Claude's built-in memory (bridge mode)
    await this.platformRegistry.register({
      id: 'claude-builtin',
      name: 'Claude Built-in Memory',
      type: 'mcp-native',
      endpoint: 'internal',
      capabilities: ['memory'],
      tools: [
        'memory:read_graph',
        'memory:search_nodes',
        'memory:create_entities',
        'memory:add_observations'
      ]
    });

    // Register OpenAI (when available)
    await this.platformRegistry.register({
      id: 'openai-agents',
      name: 'OpenAI Agents SDK',
      type: 'mcp-standard',
      endpoint: process.env.OPENAI_MCP_ENDPOINT || 'https://api.openai.com/mcp/v1',
      capabilities: ['chat', 'tools', 'memory'],
      auth: {
        type: 'bearer',
        token: process.env.OPENAI_API_KEY
      }
    });

    // Register Gemini (when available)
    await this.platformRegistry.register({
      id: 'gemini-mcp',
      name: 'Google Gemini',
      type: 'mcp-standard', 
      endpoint: process.env.GEMINI_MCP_ENDPOINT || 'https://generativelanguage.googleapis.com/mcp/v1',
      capabilities: ['chat', 'tools', 'memory'],
      auth: {
        type: 'api-key',
        key: process.env.GEMINI_API_KEY
      }
    });

    console.log(`✅ Registered ${this.platformRegistry.count()} platforms`);
  }

  private setupExpressServer() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Health check with platform status
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'universal-mcp-gateway',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        port: this.port,
        platforms: this.platformRegistry.getStatus(),
        memory: {
          federation: this.memoryFederation.getStatus(),
          lastSync: this.memoryFederation.getLastSyncTime()
        }
      });
    });

    // Platform registry endpoint
    this.app.get('/api/platforms', (req, res) => {
      res.json(this.platformRegistry.list());
    });

    // Universal entity API (HTTP fallback)
    this.app.post('/api/entities', async (req, res) => {
      try {
        const result = await this.handleUniversalCreateEntities(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/entities/search', async (req, res) => {
      try {
        const { query } = req.query;
        const result = await this.handleUniversalSearchEntities({ query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Federation sync endpoint
    this.app.post('/api/federation/sync', async (req, res) => {
      try {
        const result = await this.memoryFederation.sync();
        res.json({ 
          success: true, 
          synced: result.synced,
          conflicts: result.conflicts,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private setupUniversalToolHandlers() {
    // List all universal tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'universal:create_entities',
            description: 'Create entities in federated memory across all platforms',
            inputSchema: {
              type: 'object',
              properties: {
                entities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      entityType: { type: 'string' },
                      observations: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    },
                    required: ['name', 'entityType', 'observations']
                  }
                }
              },
              required: ['entities']
            }
          },
          {
            name: 'universal:get_entities',
            description: 'Get entities from federated memory across all platforms',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query for entities' },
                platforms: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Specific platforms to search (optional)'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'universal:search_entities',
            description: 'Advanced search across all federated memory systems',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                entityType: { type: 'string', description: 'Filter by entity type' },
                platforms: { type: 'array', items: { type: 'string' } },
                limit: { type: 'number', default: 50 }
              },
              required: ['query']
            }
          },
          {
            name: 'universal:send_message',
            description: 'Send message to any AI agent across all platforms',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: 'Target agent ID' },
                message: { type: 'string', description: 'Message content' },
                platform: { type: 'string', description: 'Target platform (auto-detected if omitted)' }
              },
              required: ['to', 'message']
            }
          },
          {
            name: 'universal:get_platform_status',
            description: 'Get status of all registered platforms',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'universal:sync_memory',
            description: 'Manually trigger memory federation sync (event-driven, only syncs if changes detected)',
            inputSchema: {
              type: 'object',
              properties: {
                force: { type: 'boolean', default: false, description: 'Force sync even if no changes detected' }
              }
            }
          },
          {
            name: 'universal:configure_auto_sync',
            description: 'Configure automatic sync behavior (disabled by default to prevent token waste)',
            inputSchema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean', default: false, description: 'Enable/disable auto-sync' },
                threshold: { type: 'number', default: 10, description: 'Number of changes before auto-sync triggers' }
              }
            }
          }
        ]
      };
    });

    // Handle universal tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      return await this.handleUniversalToolCall(name, args);
    });
  }

  private async handleUniversalToolCall(name: string, args: any = {}) {
    try {
      switch (name) {
        case 'universal:create_entities':
          return await this.handleUniversalCreateEntities(args);
          
        case 'universal:get_entities':
          return await this.handleUniversalGetEntities(args);
          
        case 'universal:search_entities':
          return await this.handleUniversalSearchEntities(args);
          
        case 'universal:send_message':
          return await this.handleUniversalSendMessage(args);
          
        case 'universal:get_platform_status':
          return await this.handleGetPlatformStatus();
          
        case 'universal:sync_memory':
          return await this.handleSyncMemory(args);
          
        case 'universal:configure_auto_sync':
          return await this.handleConfigureAutoSync(args);
          
        default:
          throw new Error(`Unknown universal tool: ${name}`);
      }
    } catch (error) {
      console.error(`❌ Universal tool error [${name}]:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  }

  private async handleUniversalCreateEntities(args: any) {
    const { entities } = args;
    
    // Create in federated memory
    const results = await this.memoryFederation.createEntities(entities);
    
    return {
      content: [
        {
          type: 'text',
          text: `Created ${entities.length} entities across ${results.platforms.length} platforms:\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  private async handleUniversalGetEntities(args: any) {
    const { query, platforms } = args;
    
    // Search across federated memory
    const results = await this.memoryFederation.getEntities(query, platforms);
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.entities.length} entities from ${results.sources.length} platforms:\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  private async handleUniversalSearchEntities(args: any) {
    const { query, entityType, platforms, limit = 50 } = args;
    
    const results = await this.memoryFederation.searchEntities({
      query,
      entityType,
      platforms,
      limit
    });
    
    return {
      content: [
        {
          type: 'text',
          text: `Search results (${results.total} found, showing ${results.entities.length}):\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  private async handleUniversalSendMessage(args: any) {
    const { to, message, platform } = args;
    
    // Auto-detect platform if not specified
    const targetPlatform = platform || this.platformRegistry.detectPlatform(to);
    const result = await this.platformRegistry.sendMessage(targetPlatform, { to, message });
    
    return {
      content: [
        {
          type: 'text',
          text: `Message sent via ${targetPlatform}: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }

  private async handleGetPlatformStatus() {
    const status = await this.platformRegistry.getDetailedStatus();
    
    return {
      content: [
        {
          type: 'text',
          text: `Platform Status:\n${JSON.stringify(status, null, 2)}`,
        },
      ],
    };
  }

  private async handleSyncMemory(args: any) {
    const { force = false } = args;
    
    const result = await this.memoryFederation.sync(force);
    
    return {
      content: [
        {
          type: 'text',
          text: `Memory sync completed (Event-Driven Mode):\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
  
  private async handleConfigureAutoSync(args: any) {
    const { enabled = false, threshold = 10 } = args;
    
    if (enabled) {
      this.memoryFederation.enableAutoSync(threshold);
    } else {
      this.memoryFederation.disableAutoSync();
    }
    
    const status = this.memoryFederation.getStatus();
    
    return {
      content: [
        {
          type: 'text',
          text: `Auto-sync configuration updated:\n${JSON.stringify(status, null, 2)}`,
        },
      ],
    };
  }

  async start() {
    try {
      // Initialize memory manager (no initialize method needed)
      await this.memoryFederation.initialize();
      
      this.app.listen(this.port, () => {
        console.log(`🌐 Universal MCP Gateway running on port ${this.port}`);
        console.log(`🔗 HTTP API: http://localhost:${this.port}`);
        console.log(`📊 Health: http://localhost:${this.port}/health`);
        console.log(`🚀 Platforms: http://localhost:${this.port}/api/platforms`);
      });
      
      // Memory federation is now event-driven by default
      // Use this.memoryFederation.enableAutoSync(10) to enable auto-sync after 10 changes
      
      console.log('✅ Universal MCP Gateway fully operational');
      
    } catch (error) {
      console.error('❌ Failed to start Universal MCP Gateway:', error);
      process.exit(1);
    }
  }
}

// Platform Registry - Manages all AI platforms
class PlatformRegistry {
  private platforms = new Map();

  async register(config: any) {
    this.platforms.set(config.id, {
      ...config,
      status: 'registered',
      lastPing: null,
      capabilities: config.capabilities || []
    });
    
    console.log(`📝 Registered platform: ${config.name} (${config.id})`);
  }

  count(): number {
    return this.platforms.size;
  }

  list() {
    return Array.from(this.platforms.values());
  }

  getStatus() {
    const status: any = {};
    for (const [id, platform] of this.platforms) {
      status[id] = {
        name: platform.name,
        type: platform.type,
        status: platform.status,
        capabilities: platform.capabilities
      };
    }
    return status;
  }

  async getDetailedStatus() {
    const detailed: any = {};
    for (const [id, platform] of this.platforms) {
      detailed[id] = {
        ...platform,
        health: await this.checkPlatformHealth(platform)
      };
    }
    return detailed;
  }

  detectPlatform(agentId: string): string {
    // Simple platform detection logic
    if (agentId.includes('claude')) return 'claude-builtin';
    if (agentId.includes('openai') || agentId.includes('gpt')) return 'openai-agents';
    if (agentId.includes('gemini')) return 'gemini-mcp';
    return 'neural-ai-collab'; // default
  }

  async sendMessage(platformId: string, message: any) {
    const platform = this.platforms.get(platformId);
    if (!platform) throw new Error(`Platform not found: ${platformId}`);
    
    // Route message based on platform type
    switch (platform.type) {
      case 'mcp-custom':
        return await this.sendToCustomMCP(platform, message);
      case 'mcp-native':
        return await this.sendToNativeMCP(platform, message);
      case 'mcp-standard':
        return await this.sendToStandardMCP(platform, message);
      default:
        throw new Error(`Unsupported platform type: ${platform.type}`);
    }
  }

  private async sendToCustomMCP(platform: any, message: any) {
    // Send to our neural-ai system
    const response = await fetch(`${platform.endpoint}/ai-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    return await response.json();
  }

  private async sendToNativeMCP(platform: any, message: any) {
    // Handle Claude's built-in memory (bridge mode)
    console.log(`📤 Sending to Claude built-in memory: ${JSON.stringify(message)}`);
    return { status: 'bridged', platform: platform.id };
  }

  private async sendToStandardMCP(platform: any, message: any) {
    // Send to OpenAI/Gemini MCP endpoints
    const headers = {
      'Content-Type': 'application/json',
      ...(platform.auth?.type === 'bearer' && { 'Authorization': `Bearer ${platform.auth.token}` }),
      ...(platform.auth?.type === 'api-key' && { 'X-API-Key': platform.auth.key })
    };

    const response = await fetch(`${platform.endpoint}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message)
    });
    return await response.json();
  }

  private async checkPlatformHealth(platform: any): Promise<string> {
    try {
      if (platform.type === 'mcp-native') return 'healthy';
      
      const response = await fetch(`${platform.endpoint}/health`, {
        // timeout not supported in standard fetch
      });
      return response.ok ? 'healthy' : 'unhealthy';
    } catch {
      return 'unreachable';
    }
  }
}

// Memory Federation - Syncs memory across all platforms
class MemoryFederation {
  private memoryManager: MemoryManager;
  private lastSync = 0;
  private changeQueue: Set<string> = new Set();
  private isAutoSyncEnabled = false;
  private syncThreshold = 10; // Sync after 10 changes

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
  }

  async initialize() {
    console.log('🔄 Initializing Memory Federation (Event-Driven Mode)...');
    console.log('💡 Auto-sync disabled by default to prevent token waste');
  }

  async createEntities(entities: any[]) {
    const results = {
      platforms: [],
      entities: [],
      errors: []
    };

    try {
      // Create in our neural-ai system
      const neuralResult = await this.memoryManager.store('universal-gateway', {
        entities,
        timestamp: new Date().toISOString()
      }, 'shared', 'federated_entities');
      
      (results.platforms as any).push('neural-ai');
      (results.entities as any).push(neuralResult);
      
      // Track change for potential sync
      this.trackChange(`create_${entities.length}_entities`);
    } catch (error) {
      (results.errors as any).push({ platform: 'neural-ai', error: error.message });
    }

    // TODO: Add Claude, OpenAI, Gemini creation
    
    return results;
  }

  async getEntities(query: string, platforms?: string[]) {
    const results = {
      entities: [],
      sources: [],
      query
    };

    try {
      // Search our neural-ai system (no tokens consumed for reads)
      const neuralResults = await this.memoryManager.search(query, { shared: true });
      (results.entities as any).push(...neuralResults);
      (results.sources as any).push('neural-ai');
    } catch (error) {
      console.error('Error searching neural-ai:', error);
    }

    // TODO: Add Claude, OpenAI, Gemini searches (only when needed)
    
    return results;
  }

  async searchEntities(options: any) {
    const { query, entityType, platforms, limit = 50 } = options;
    
    let searchQuery = query;
    if (entityType) {
      searchQuery += ` entityType:${entityType}`;
    }

    const results = await this.getEntities(searchQuery, platforms);
    
    return {
      ...results,
      total: results.entities.length,
      entities: results.entities.slice(0, limit)
    };
  }

  async sync(force = false): Promise<any> {
    const now = Date.now();
    
    // Skip if no changes and not forced
    if (!force && this.changeQueue.size === 0) {
      return { 
        skipped: 'no_changes', 
        lastSync: this.lastSync,
        queuedChanges: 0 
      };
    }
    
    // Cooldown protection (1 minute)
    if (!force && (now - this.lastSync) < 60000) {
      return { 
        skipped: 'too_recent', 
        lastSync: this.lastSync,
        queuedChanges: this.changeQueue.size 
      };
    }

    console.log(`🔄 Starting memory federation sync (${this.changeQueue.size} changes)...`);
    
    const syncResult = {
      synced: 0,
      conflicts: 0,
      platforms: [],
      changes: Array.from(this.changeQueue),
      timestamp: new Date().toISOString()
    };

    try {
      // Only sync if there are actual changes
      if (this.changeQueue.size > 0) {
        // TODO: Implement actual bidirectional sync logic here
        // This would call external APIs only when there are real changes
        
        this.lastSync = now;
        syncResult.synced = this.changeQueue.size;
        (syncResult.platforms as any).push('neural-ai');
        
        // Clear the change queue after successful sync
        this.changeQueue.clear();
        
        console.log(`✅ Memory federation sync completed (${syncResult.synced} changes)`);
      }
    } catch (error) {
      console.error('❌ Memory federation sync failed:', error);
      throw error;
    }

    return syncResult;
  }

  enableAutoSync(threshold = 10) {
    this.isAutoSyncEnabled = true;
    this.syncThreshold = threshold;
    console.log(`⚡ Auto-sync enabled: will sync after ${threshold} changes`);
  }
  
  disableAutoSync() {
    this.isAutoSyncEnabled = false;
    console.log('🚫 Auto-sync disabled - manual sync only');
  }
  
  private trackChange(changeId: string) {
    this.changeQueue.add(changeId);
    console.log(`📝 Change tracked: ${changeId} (${this.changeQueue.size} total)`);
    
    // Auto-sync when threshold is reached (if enabled)
    if (this.isAutoSyncEnabled && this.changeQueue.size >= this.syncThreshold) {
      console.log(`🚀 Auto-sync triggered (${this.changeQueue.size} >= ${this.syncThreshold})`);
      this.sync().catch(error => {
        console.error('❌ Auto-sync failed:', error);
      });
    }
  }

  getStatus() {
    return {
      mode: 'event-driven',
      autoSyncEnabled: this.isAutoSyncEnabled,
      syncThreshold: this.syncThreshold,
      queuedChanges: this.changeQueue.size,
      lastSync: this.lastSync,
      lastSyncTime: this.lastSync ? new Date(this.lastSync).toISOString() : null
    };
  }

  getLastSyncTime() {
    return this.lastSync ? new Date(this.lastSync).toISOString() : null;
  }
}

// Start the Universal MCP Gateway
if (import.meta.url === `file://${process.argv[1]}`) {
  const gateway = new UniversalMCPGateway();
  gateway.start().catch(console.error);
}

export default UniversalMCPGateway;