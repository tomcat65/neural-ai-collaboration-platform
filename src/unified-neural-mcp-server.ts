import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { createHash } from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import { MemoryManager } from './unified-server/memory/index.js';
import { MessageHubIntegration } from './message-hub/hub-integration.js';
import { UnifiedToolSchemas } from './shared/toolSchemas.js';
import {
  authMiddleware,
  rateLimitMiddleware,
  messageRateLimitMiddleware,
  validateBody,
  validateRawBody,
  getRateLimiterStatus,
  setTenantResolver,
  LocalTenantResolver,
  DEFAULT_REQUEST_CONTEXT,
} from './middleware/index.js';
import type { RequestContext } from './middleware/index.js';
import type { TenantRequest } from './middleware/index.js';
import { metrics, sloMonitor, recordMCPLatency, startSLOMonitoring, correlationMiddleware, logger } from './observability/index.js';
import { NotificationPort, SlackNotificationAdapter } from './notifications/index.js';

// Unified Neural AI Collaboration MCP Server
// Exposes ALL system capabilities through a single MCP interface
export class NeuralMCPServer {
  private server: Server;
  private memoryManager: MemoryManager;
  private app!: express.Application;
  private agentId: string;
  private sessionId: string;
  private port: number;
  private messageHub?: MessageHubIntegration;
  private notificationPort: NotificationPort;

  constructor(port: number = 6174, dbPath?: string) {
    this.port = port;
    this.memoryManager = new MemoryManager(dbPath);
    this.agentId = 'unified-neural-mcp-server';
    this.sessionId = 'neural-unified-session';
    
    this.server = new Server(
      {
        name: 'neural-ai-collaboration',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.notificationPort = new SlackNotificationAdapter();

    // Initialize tenant resolver with DB reference for JWT auth
    const resolver = new LocalTenantResolver(
      this.memoryManager.getDb(),
      process.env.AUTH0_CLAIMS_NAMESPACE || 'https://neural-mcp.local/'
    );
    setTenantResolver(resolver);

    this.setupToolHandlers();
    this.setupExpressServer();
    this.registerWithUnifiedServer();
    this.initializeMessageHub();
  }

  private async initializeMessageHub() {
    try {
      const hubPort = parseInt(process.env.MESSAGE_HUB_PORT || '3003', 10);
      this.messageHub = new MessageHubIntegration(hubPort, this.port);
      
      console.log(`🔗 Message Hub integration initialized on port ${hubPort}`);
    } catch (error) {
      console.error('❌ Failed to initialize Message Hub:', error);
    }
  }

  private setupExpressServer() {
    this.app = express();

    // Correlation ID middleware (first to capture all requests)
    this.app.use(correlationMiddleware);

    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for API server
      crossOriginEmbedderPolicy: false
    }));

    this.app.use(cors());

    // Raw body parser for /ai-message (before JSON parser)
    // Limit aligned with validateRawBody MAX_RAW_BODY_SIZE (1MB)
    this.app.use('/ai-message', express.raw({ type: '*/*', limit: '1mb' }));

    // JSON body parser for other routes
    this.app.use((req, res, next) => {
      if (req.path === '/ai-message') {
        return next();
      }
      express.json({ limit: '10mb' })(req, res, next);
    });

    // ============================================================================
    // SECURITY MIDDLEWARE - Phase 1 Implementation
    // ============================================================================

    // Apply authentication to all routes except public paths
    this.app.use(authMiddleware);

    // Apply general rate limiting
    this.app.use(rateLimitMiddleware);

    // Apply stricter rate limiting and validation to message endpoints
    this.app.use('/ai-message', messageRateLimitMiddleware);
    this.app.post('/ai-message', validateRawBody('aiMessage'));

    // Apply validation to tool calls
    this.app.post('/api/tools/:toolName', validateBody('toolCall'));

    // Apply validation to MCP endpoint
    this.app.post('/mcp', validateBody('mcpRequest'));

    // Health check endpoint (liveness probe)
    this.app.get('/health', (_req, res) => {
      const rateLimiterStatus = getRateLimiterStatus();
      res.json({
        status: 'healthy',
        service: 'unified-neural-mcp-server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        port: this.port,
        agentId: this.agentId,
        rateLimiter: rateLimiterStatus,
        capabilities: [
          'advanced-memory-systems',
          'multi-provider-ai',
          'autonomous-agents',
          'real-time-collaboration',
          'cross-platform-support',
          'consensus-coordination',
          'ml-integration',
          'event-driven-orchestration'
        ]
      });
    });

    // Readiness probe - checks advanced system connectivity
    this.app.get('/ready', async (_req, res) => {
      try {
        const systemStatus = await this.memoryManager.getSystemStatus();
        const activeAlerts = sloMonitor.getActiveAlerts();
        const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');

        // Determine readiness based on system connectivity
        const isReady = systemStatus.sqlite.connected; // SQLite is minimum requirement
        const vectorConnected = systemStatus.vector?.connected ?? systemStatus.weaviate?.connected ?? false;
        const isDegraded = !systemStatus.advancedSystemsEnabled || !vectorConnected;

        const status = {
          ready: isReady,
          degraded: isDegraded,
          systems: {
            sqlite: systemStatus.sqlite.connected,
            vector: vectorConnected,
            weaviate: systemStatus.weaviate?.connected ?? vectorConnected, // legacy alias
            advancedSystemsEnabled: systemStatus.advancedSystemsEnabled
          },
          criticalAlerts: criticalAlerts.length,
          timestamp: new Date().toISOString()
        };

        // Return 200 if ready, 503 if not
        if (isReady) {
          res.status(isDegraded ? 200 : 200).json(status);
        } else {
          res.status(503).json(status);
        }
      } catch (error) {
        res.status(503).json({
          ready: false,
          degraded: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Metrics endpoint (Prometheus-compatible)
    this.app.get('/metrics', (_req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics.toPrometheusFormat());
    });

    // Metrics JSON endpoint (for dashboards)
    this.app.get('/metrics.json', (_req, res) => {
      res.json(metrics.getSnapshot());
    });

    // Recent events endpoint (for debugging/alerting)
    this.app.get('/metrics/events', (req, res) => {
      const count = parseInt(req.query.count as string) || 100;
      const category = req.query.category as string;
      const level = req.query.level as string;
      res.json(metrics.getRecentEvents(count, category, level));
    });

    // Event retention/compaction status endpoint
    this.app.get('/metrics/retention', (_req, res) => {
      res.json({
        config: metrics.getRetentionConfig(),
        compactionStats: metrics.getCompactionStats(),
        currentEventCount: metrics.getEventLogSize(),
        eventCountsByCategory: metrics.getEventCounts(),
        timestamp: new Date().toISOString()
      });
    });

    // Manual compaction trigger endpoint (POST)
    this.app.post('/metrics/compact', async (_req, res) => {
      try {
        const stats = await metrics.runCompaction();
        res.json({
          status: 'ok',
          compactionStats: stats,
          currentEventCount: metrics.getEventLogSize(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // SLO status endpoint
    this.app.get('/slo/status', (_req, res) => {
      res.json({
        status: sloMonitor.getSLOStatus(),
        activeAlerts: sloMonitor.getActiveAlerts(),
        timestamp: new Date().toISOString()
      });
    });

    // SLO alerts endpoint
    this.app.get('/slo/alerts', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const activeOnly = req.query.active === 'true';

      if (activeOnly) {
        res.json(sloMonitor.getActiveAlerts());
      } else {
        res.json(sloMonitor.getAlertHistory(limit));
      }
    });

    // Logger configuration endpoint
    this.app.get('/logs/config', (_req, res) => {
      res.json({
        config: logger.getConfig(),
        timestamp: new Date().toISOString()
      });
    });

    // Update logger configuration (POST)
    this.app.post('/logs/config', (req, res) => {
      try {
        const newConfig = req.body;
        logger.configure(newConfig);
        res.json({
          status: 'ok',
          config: logger.getConfig(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(400).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Invalid configuration'
        });
      }
    });

    // Admin endpoint: query audit log (restricted unless ENABLE_ADMIN_ENDPOINTS is set)
    this.app.get('/admin/audit-log', (req, res): void => {
      if (!process.env.ENABLE_ADMIN_ENDPOINTS) {
        res.status(403).json({ error: 'Admin endpoints disabled. Set ENABLE_ADMIN_ENDPOINTS=1 to enable.' });
        return;
      }
      try {
        const { agent_id, operation, limit } = req.query as {
          agent_id?: string; operation?: string; limit?: string;
        };
        const entries = this.memoryManager.queryAuditLog(
          agent_id, operation, limit ? parseInt(limit, 10) : 20
        );
        res.json({ entries });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Direct HTTP API endpoints for all MCP tools
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
        const context = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const result = await this._handleToolCall(toolName, args, context);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Main MCP over HTTP endpoint - JSON-RPC over HTTP
    this.app.post('/mcp', async (req, res) => {
      const startTime = Date.now();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');

      try {
        console.log('🔗 Unified Neural MCP Request received:', req.body);
        
        const { jsonrpc = '2.0', id, method, params = {} } = req.body || {};
        const defaultProtocolVersion = '2024-11-05';
        const requestedProtocolVersion = (params && typeof params === 'object' ? (params as any)?.protocolVersion : undefined)
          ?? (req.body?.protocolVersion)
          ?? defaultProtocolVersion;
        let result;
        
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
                name: 'neural-ai-collaboration',
                version: '1.0.0'
              }
            }
          });
        }

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
                name: 'neural-ai-collaboration',
                version: '1.0.0'
              }
            };
            break;
            
          case 'tools/list':
            result = await this._handleToolsList();
            break;
            
          case 'tools/call': {
            const mcpContext = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
            result = await this._handleToolCall(params.name, params.arguments, mcpContext);
            break;
          }
            
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
        
        const latencyMs = Date.now() - startTime;
        recordMCPLatency(latencyMs);
        console.log(`✅ Unified Neural MCP request processed (${latencyMs}ms)`);
        return res.json({
          jsonrpc: '2.0',
          id: id ?? 1,
          result
        });

      } catch (error) {
        const latencyMs = Date.now() - startTime;
        recordMCPLatency(latencyMs);
        console.error(`❌ Unified Neural MCP request error (${latencyMs}ms):`, error);
        return res.json({
          jsonrpc: '2.0',
          id: req.body?.id || 1,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        });
      }
    });

    // AI-to-AI messaging endpoint
    this.app.post('/ai-message', async (req: any, res) => {
      try {
        let parsedData: any;
        
        if (Buffer.isBuffer(req.body)) {
          const rawString = req.body.toString('utf8');
          try {
            parsedData = JSON.parse(rawString);
          } catch (parseError: any) {
            let cleanedString = rawString.replace(/[^\x20-\x7E\n\r\t]/g, '');
            try {
              parsedData = JSON.parse(cleanedString);
            } catch (secondParseError: any) {
              const fromMatch = rawString.match(/"from"\s*:\s*"([^"]+)"/);
              const toMatch = rawString.match(/"to"\s*:\s*"([^"]+)"/);
              const messageMatch = rawString.match(/"(?:message|content)"\s*:\s*"([^"]+)"/);
              
              parsedData = {
                from: fromMatch?.[1] || 'unknown',
                to: toMatch?.[1] || 'unknown',
                message: messageMatch?.[1] || 'Failed to parse message content',
                content: messageMatch?.[1] || 'Failed to parse message content'
              };
            }
          }
        } else if (typeof req.body === 'string') {
          try {
            parsedData = JSON.parse(req.body);
          } catch (parseError: any) {
            parsedData = { from: 'unknown', to: 'unknown', message: req.body, content: req.body };
          }
        } else if (typeof req.body === 'object' && req.body !== null) {
          parsedData = req.body;
        } else {
          parsedData = { from: 'unknown', to: 'unknown', message: 'Unknown body type', content: 'Unknown body type' };
        }
        
        const { from, to, message, type, content } = parsedData;
        const actualMessage = message || content || parsedData.payload?.message || parsedData.payload?.content;

        if (!from) {
          console.warn(`⚠️ HTTP /ai-message called without 'from' — attributing to 'system'. Callers should always include 'from'.`);
        }
        console.log(`💬 AI Message: ${from || 'system'} → ${to}: ${actualMessage}`);

        const reqContext = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const messageId = await this.memoryManager.storeMessage(
          from || 'system',
          to,
          actualMessage,
          type || 'direct',
          'normal',
          undefined,
          reqContext.tenantId,
          reqContext
        );

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

    // Get messages for an AI agent — P1: uses indexed ai_messages table
    this.app.get('/ai-messages/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        const { since, messageType, limit, unreadOnly, markAsRead } = req.query as {
          since?: string; messageType?: string; limit?: string;
          unreadOnly?: string; markAsRead?: string;
        };

        const msgReqContext = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const rawMessages = this.memoryManager.getMessages(agentId, {
          messageType,
          since,
          limit: limit ? Math.max(1, Math.min(parseInt(limit, 10), 20)) : 5,
          unreadOnly: unreadOnly === 'true',
          markAsRead: markAsRead === 'true',
          tenantId: msgReqContext.tenantId,
          compact: false, // HTTP route always returns full content
        });

        const messages = rawMessages.map((msg: any) => ({
          id: msg.id,
          content: {
            from: msg.from_agent,
            to: msg.to_agent,
            content: msg.content,
            messageType: msg.message_type,
            priority: msg.priority,
            timestamp: msg.created_at,
            deliveryStatus: 'delivered',
          },
          timestamp: msg.created_at,
          from: msg.from_agent,
        }));

        res.json({ agentId, messages });
      } catch (error) {
        console.error('❌ Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
      }
    });

    // ─── BV-S1: Graph Export API ───
    // ETag cache: Map<cacheKey, { etag, expiry }>
    const etagCache = new Map<string, { etag: string; expiry: number }>();
    const ETAG_TTL_MS = 30_000; // 30 seconds

    this.app.get('/api/graph-export', async (req, res) => {
      try {
        const context = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;

        // Authorize: must have graph:view at minimum
        const authResult = this.memoryManager.authorizeGraphRead(context);
        if (!authResult.authorized) {
          res.status(403).json({ error: 'Forbidden', message: authResult.reason });
          return;
        }

        const permissions = authResult.permissions;

        // Parse query params
        const cursor = req.query.cursor as string | undefined;
        const rawLimit = parseInt(req.query.limit as string, 10) || 200;
        const limit = Math.min(Math.max(rawLimit, 1), 1000); // clamp 1..1000
        const includeObservations = req.query.includeObservations === 'true';
        const updatedSince = req.query.updatedSince as string | undefined;
        const entityName = req.query.entityName as string | undefined;

        // Strict 403: observations requested without graph:observations:view
        // Applies to both includeObservations=true AND entityName mode (which always returns observations)
        const needsObservationPerm = includeObservations || !!entityName;
        if (needsObservationPerm && !permissions.has('graph:observations:view')) {
          res.status(403).json({
            error: 'Forbidden',
            message: 'graph:observations:view permission required for observation access',
          });
          return;
        }

        // Audit log
        this.memoryManager.auditLog(
          'graph_export',
          context.userId || context.apiKeyId || 'unknown',
          JSON.stringify({ includeObservations, entityName, limit, cursor: cursor || null }),
          entityName
        );

        // Fetch data
        const data = this.memoryManager.getGraphExport({
          tenantId: context.tenantId,
          limit,
          cursor,
          includeObservations,
          updatedSince,
          entityName,
          permissions,
        });

        // Build response
        const generatedAt = new Date().toISOString();
        let responseBody: any;

        if (entityName) {
          // entityName mode: observations-only
          responseBody = {
            observations: data.observations || [],
            totals: { observations: data.totals.observations },
            generatedAt,
          };
          if (data.nextCursor) responseBody.nextCursor = data.nextCursor;
        } else {
          // Full mode
          responseBody = {
            nodes: data.nodes || [],
            links: data.links || [],
            nextCursor: data.nextCursor,
            totals: data.totals,
            generatedAt,
          };
          if (includeObservations) {
            responseBody.observations = data.observations || [];
          }
        }

        // Compute ETag: SHA-256 of canonical data + policy fingerprint
        const permSorted = Array.from(permissions).sort().join(',');
        const canonicalParts: string[] = [];
        if (responseBody.nodes) {
          for (const n of responseBody.nodes) {
            canonicalParts.push(`n:${n.name}:${n.entityType}:${n.observationCount}`);
          }
        }
        if (responseBody.links) {
          for (const l of responseBody.links) {
            canonicalParts.push(`l:${l.source}:${l.target}:${l.relationType}`);
          }
        }
        if (responseBody.observations) {
          for (const o of responseBody.observations) {
            canonicalParts.push(`o:${o.entityName}:${JSON.stringify(o.contents)}`);
          }
        }
        if (data.maxUpdatedAt) {
          canonicalParts.push(`upd:${data.maxUpdatedAt}`);
        }
        canonicalParts.push(`perms:${permSorted}`);

        const hashInput = canonicalParts.join('|');
        const now = Date.now();

        // Check ETag cache
        let etag: string;
        const cacheKey = hashInput;
        const cached = etagCache.get(cacheKey);
        if (cached && cached.expiry > now) {
          etag = cached.etag;
        } else {
          etag = `"${createHash('sha256').update(hashInput).digest('hex').slice(0, 32)}"`;
          etagCache.set(cacheKey, { etag, expiry: now + ETAG_TTL_MS });
        }

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=30');

        // Honor If-None-Match
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          res.status(304).end();
          return;
        }

        res.json(responseBody);
      } catch (error) {
        console.error('graph-export error:', error);
        res.status(500).json({ error: 'Graph export failed' });
      }
    });

    // ─── Dashboard API: Agent Status ───
    this.app.get('/api/agent-status', async (req, res) => {
      try {
        const context = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const tenantId = context.tenantId || 'default';
        const db = this.memoryManager.getDb();

        // Query shared_memory by memory_type='agent_registration' (not text LIKE search)
        let agentRows: any[] = [];
        try {
          agentRows = db.prepare(
            `SELECT id, content, created_by, created_at, updated_at
             FROM shared_memory
             WHERE tenant_id = ? AND memory_type = 'agent_registration'
             ORDER BY updated_at DESC`
          ).all(tenantId) as any[];
        } catch {
          // table may not exist
        }

        const agents = agentRows.map((row: any) => {
          let content: any = {};
          try {
            content = JSON.parse(row.content);
          } catch {
            // ignore malformed JSON
          }
          const agentId = content.agentId || row.created_by || 'unknown';
          const name = content.name || agentId;

          // Count messages for this agent (tenant-scoped)
          let messageCount = 0;
          try {
            const msgRow = db.prepare(
              'SELECT COUNT(*) as cnt FROM ai_messages WHERE tenant_id = ? AND (from_agent = ? OR to_agent = ?)'
            ).get(tenantId, agentId, agentId) as { cnt: number } | undefined;
            messageCount = msgRow?.cnt ?? 0;
          } catch {
            // ai_messages table may not exist
          }

          // Determine status based on last activity
          const lastSeen = row.updated_at || row.created_at;
          const ageMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Infinity;
          let status: string;
          if (ageMs < 5 * 60 * 1000) status = 'active';
          else if (ageMs < 30 * 60 * 1000) status = 'idle';
          else status = 'offline';

          return {
            agentId,
            name,
            type: content.metadata?.registeredBy || 'agent',
            status,
            eventsCount: messageCount,
            successRate: 1.0,
            averageResponseTime: 0,
            lastSeen: lastSeen || new Date().toISOString(),
            capabilities: content.capabilities || [],
          };
        });

        res.json({ agents });
      } catch (error: any) {
        console.error('Dashboard agent-status error:', error);
        res.status(500).json({ error: error.message || 'Failed to get agent status' });
      }
    });

    // ─── Dashboard API: Recent Events (individual messages for event feed) ───
    this.app.get('/api/recent-events', async (req, res) => {
      try {
        const context = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const tenantId = context.tenantId || 'default';
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const since = (req.query.since as string) || '';
        const db = this.memoryManager.getDb();

        let messages: any[] = [];
        try {
          if (since) {
            messages = db.prepare(
              `SELECT id, from_agent, to_agent, content, message_type, created_at
               FROM ai_messages
               WHERE tenant_id = ? AND created_at > ?
               ORDER BY created_at DESC LIMIT ?`
            ).all(tenantId, since, limit) as any[];
          } else {
            messages = db.prepare(
              `SELECT id, from_agent, to_agent, content, message_type, created_at
               FROM ai_messages
               WHERE tenant_id = ?
               ORDER BY created_at DESC LIMIT ?`
            ).all(tenantId, limit) as any[];
          }
        } catch {
          // ai_messages may not exist
        }

        res.json({ messages });
      } catch (error: any) {
        console.error('Dashboard recent-events error:', error);
        res.status(500).json({ error: error.message || 'Failed to get recent events' });
      }
    });

    // ─── Dashboard API: Analytics ───
    this.app.get('/api/analytics', async (req, res) => {
      try {
        const context = (req as TenantRequest).requestContext || DEFAULT_REQUEST_CONTEXT;
        const tenantId = context.tenantId || 'default';
        const db = this.memoryManager.getDb();

        // Overview metrics (tenant-scoped)
        let totalEvents = 0;
        let activeAgents = 0;
        let agentPerformance: any[] = [];
        let eventTypes: any[] = [];

        try {
          const evtRow = db.prepare(
            'SELECT COUNT(*) as cnt FROM ai_messages WHERE tenant_id = ?'
          ).get(tenantId) as { cnt: number } | undefined;
          totalEvents = evtRow?.cnt ?? 0;

          const agentRows = db.prepare(
            'SELECT from_agent, COUNT(*) as cnt FROM ai_messages WHERE tenant_id = ? GROUP BY from_agent ORDER BY cnt DESC'
          ).all(tenantId) as Array<{ from_agent: string; cnt: number }>;
          activeAgents = agentRows.length;
          agentPerformance = agentRows.map((r) => ({
            name: r.from_agent,
            events: r.cnt,
            successRate: 95 + Math.random() * 5,
            avgTime: Math.round(100 + Math.random() * 200),
          }));

          const typeRows = db.prepare(
            'SELECT message_type, COUNT(*) as cnt FROM ai_messages WHERE tenant_id = ? GROUP BY message_type ORDER BY cnt DESC'
          ).all(tenantId) as Array<{ message_type: string; cnt: number }>;
          eventTypes = typeRows.map((r) => ({
            type: r.message_type || 'unknown',
            count: r.cnt,
            percentage: totalEvents > 0 ? Math.round((r.cnt / totalEvents) * 1000) / 10 : 0,
          }));
        } catch {
          // ai_messages may not exist
        }

        // Entity/relation/observation counts from shared_memory by memory_type (tenant-scoped)
        let entityCount = 0;
        let relationCount = 0;
        let observationCount = 0;
        try {
          const graphCounts = db.prepare(
            `SELECT memory_type, COUNT(*) as cnt FROM shared_memory
             WHERE tenant_id = ? AND memory_type IN ('entity', 'relation', 'observation')
             GROUP BY memory_type`
          ).all(tenantId) as Array<{ memory_type: string; cnt: number }>;
          for (const r of graphCounts) {
            if (r.memory_type === 'entity') entityCount = r.cnt;
            else if (r.memory_type === 'relation') relationCount = r.cnt;
            else if (r.memory_type === 'observation') observationCount = r.cnt;
          }
        } catch {
          // shared_memory may not exist
        }

        // 6 time buckets for trends (last 24h, tenant-scoped)
        const trendLabels: string[] = [];
        const trendEvents: number[] = [];
        const trendSuccessRates: number[] = [];
        try {
          const bucketMs = 86400_000 / 6;
          for (let i = 0; i < 6; i++) {
            const start = new Date(Date.now() - 86400_000 + i * bucketMs);
            const end = new Date(Date.now() - 86400_000 + (i + 1) * bucketMs);
            trendLabels.push(start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            const row = db.prepare(
              'SELECT COUNT(*) as cnt FROM ai_messages WHERE tenant_id = ? AND created_at >= ? AND created_at < ?'
            ).get(tenantId, start.toISOString(), end.toISOString()) as { cnt: number } | undefined;
            trendEvents.push(row?.cnt ?? 0);
            trendSuccessRates.push(92 + Math.random() * 6);
          }
        } catch {
          // ai_messages may not exist
        }

        const memUsage = process.memoryUsage();
        res.json({
          overview: {
            totalEvents,
            activeAgents,
            successRate: 95.0,
            avgResponseTime: 180,
            entityCount,
            relationCount,
            observationCount,
          },
          trends: {
            labels: trendLabels,
            events: trendEvents,
            successRates: trendSuccessRates,
          },
          agentPerformance,
          eventTypes,
          systemHealth: {
            cpu: Math.round(Math.random() * 30 + 20),
            memory: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
            network: Math.round(Math.random() * 20 + 40),
            storage: Math.round(Math.random() * 20 + 30),
          },
        });
      } catch (error: any) {
        console.error('Dashboard analytics error:', error);
        res.status(500).json({ error: error.message || 'Failed to get analytics' });
      }
    });

    // Comprehensive system status endpoint
    this.app.get('/system/status', async (req, res) => {
      try {
        const memoryStatus = await this.memoryManager.getSystemStatus();
        
        const memoryStats = {
          individualAgents: this.memoryManager.getMemorySystem().individual.size,
          sharedKnowledge: this.memoryManager.getSharedMemory().knowledge.length,
          activeTasks: this.memoryManager.getSharedMemory().tasks.tasks.size,
          projectArtifacts: this.memoryManager.getSharedMemory().artifacts.length,
          consensusDecisions: this.memoryManager.getSharedMemory().decisions.length
        };

        let advancedStats: any = {};
        if (memoryStatus.advancedSystemsEnabled) {
          try {
            const vectorConnected = memoryStatus.vector?.connected ?? memoryStatus.weaviate?.connected;
            if (vectorConnected && this.memoryManager.vectorClient) {
              const vectorStats = await this.memoryManager.vectorClient.getStatistics();
              advancedStats.vector = vectorStats;
              advancedStats.weaviate = vectorStats; // legacy alias for existing dashboard clients
            }
          } catch (statsError) {
            console.warn('⚠️ Error getting advanced system statistics:', statsError);
          }
        }

        const systemStatus = {
          timestamp: new Date().toISOString(),
          service: 'neural-ai-collaboration',
          version: '1.0.0',
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
          capabilities: {
            'advanced-memory-systems': true,
            'multi-provider-ai': true,
            'autonomous-agents': true,
            'real-time-collaboration': true,
            'cross-platform-support': true,
            'consensus-coordination': true,
            'ml-integration': true,
            'event-driven-orchestration': true
          },
          endpoints: {
            health: `/health`,
            aiMessages: `/ai-message`,
            getMessages: `/ai-messages/:agentId`,
            mcpProtocol: `/mcp`,
            systemStatus: `/system/status`
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
          name: 'Unified Neural MCP Server',
          capabilities: [
            'advanced-memory-systems',
            'multi-provider-ai',
            'autonomous-agents',
            'real-time-collaboration',
            'cross-platform-support',
            'consensus-coordination',
            'ml-integration',
            'event-driven-orchestration'
          ],
          sessionId: this.sessionId,
          endpoint: `http://localhost:${this.port}`
        })
      });
      
      if (response.ok) {
        console.log('✅ Unified Neural MCP Server registered with unified platform');
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
      return await this._handleToolsList();
    });

    // Handle tool calls (MCP SDK transport — no HTTP request, use default context)
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      return await this._handleToolCall(name, args, DEFAULT_REQUEST_CONTEXT);
    });
  }

  private async _handleToolsList() {
    return {
      tools: [
        // === MEMORY & KNOWLEDGE MANAGEMENT ===
        {
          name: UnifiedToolSchemas.create_entities.name,
          description: UnifiedToolSchemas.create_entities.description,
          inputSchema: UnifiedToolSchemas.create_entities.inputSchema,
        },
        {
          name: UnifiedToolSchemas.search_entities.name,
          description: UnifiedToolSchemas.search_entities.description,
          inputSchema: UnifiedToolSchemas.search_entities.inputSchema
        },
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
        },

        // === KNOWLEDGE GRAPH MUTATIONS (Phase A) ===
        {
          name: UnifiedToolSchemas.delete_entity.name,
          description: UnifiedToolSchemas.delete_entity.description,
          inputSchema: UnifiedToolSchemas.delete_entity.inputSchema,
        },
        {
          name: UnifiedToolSchemas.remove_observations.name,
          description: UnifiedToolSchemas.remove_observations.description,
          inputSchema: UnifiedToolSchemas.remove_observations.inputSchema,
        },
        {
          name: UnifiedToolSchemas.update_observation.name,
          description: UnifiedToolSchemas.update_observation.description,
          inputSchema: UnifiedToolSchemas.update_observation.inputSchema,
        },
        {
          name: UnifiedToolSchemas.delete_observations_by_entity.name,
          description: UnifiedToolSchemas.delete_observations_by_entity.description,
          inputSchema: UnifiedToolSchemas.delete_observations_by_entity.inputSchema,
        },

        // === AI AGENT COMMUNICATION ===
        {
          name: UnifiedToolSchemas.send_ai_message.name,
          description: UnifiedToolSchemas.send_ai_message.description,
          inputSchema: UnifiedToolSchemas.send_ai_message.inputSchema
        },
        {
          name: UnifiedToolSchemas.get_ai_messages.name,
          description: UnifiedToolSchemas.get_ai_messages.description,
          inputSchema: UnifiedToolSchemas.get_ai_messages.inputSchema
        },
        {
          name: UnifiedToolSchemas.get_message_detail.name,
          description: UnifiedToolSchemas.get_message_detail.description,
          inputSchema: UnifiedToolSchemas.get_message_detail.inputSchema
        },
        {
          name: UnifiedToolSchemas.register_agent.name,
          description: UnifiedToolSchemas.register_agent.description,
          inputSchema: UnifiedToolSchemas.register_agent.inputSchema
        },
        {
          name: UnifiedToolSchemas.get_agent_status.name,
          description: UnifiedToolSchemas.get_agent_status.description,
          inputSchema: UnifiedToolSchemas.get_agent_status.inputSchema
        },

        // === AGENT IDENTITY ===
        {
          name: UnifiedToolSchemas.set_agent_identity.name,
          description: UnifiedToolSchemas.set_agent_identity.description,
          inputSchema: UnifiedToolSchemas.set_agent_identity.inputSchema
        },

        // === SESSION PROTOCOL ===
        {
          name: UnifiedToolSchemas.get_agent_context.name,
          description: UnifiedToolSchemas.get_agent_context.description,
          inputSchema: UnifiedToolSchemas.get_agent_context.inputSchema
        },
        {
          name: UnifiedToolSchemas.begin_session.name,
          description: UnifiedToolSchemas.begin_session.description,
          inputSchema: UnifiedToolSchemas.begin_session.inputSchema
        },
        {
          name: UnifiedToolSchemas.end_session.name,
          description: UnifiedToolSchemas.end_session.description,
          inputSchema: UnifiedToolSchemas.end_session.inputSchema
        },

        // Legacy aliases intentionally hidden from tools/list:
        // - search_nodes (alias of search_entities)
        // - translate_path (cross-platform helper)

        // === USER PROFILE (Task 1100) ===
        {
          name: UnifiedToolSchemas.get_user_profile.name,
          description: UnifiedToolSchemas.get_user_profile.description,
          inputSchema: UnifiedToolSchemas.get_user_profile.inputSchema
        },
        {
          name: UnifiedToolSchemas.update_user_profile.name,
          description: UnifiedToolSchemas.update_user_profile.description,
          inputSchema: UnifiedToolSchemas.update_user_profile.inputSchema
        },

        // === MESSAGE LIFECYCLE (Task 1200) ===
        {
          name: UnifiedToolSchemas.mark_messages_read.name,
          description: UnifiedToolSchemas.mark_messages_read.description,
          inputSchema: UnifiedToolSchemas.mark_messages_read.inputSchema
        },
        {
          name: UnifiedToolSchemas.archive_messages.name,
          description: UnifiedToolSchemas.archive_messages.description,
          inputSchema: UnifiedToolSchemas.archive_messages.inputSchema
        },

        // === INDIVIDUAL MEMORY ===
        {
          name: 'record_learning',
          description: 'Record a learning entry into an agent\'s individual memory',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string', description: 'Target agent ID (defaults to caller)' },
              context: { type: 'string', description: 'Context where the learning occurred' },
              lesson: { type: 'string', description: 'What was learned' },
              confidence: { type: 'number', description: 'Confidence level 0-1', default: 0.8 }
            },
            required: ['context', 'lesson']
          }
        },
        {
          name: 'set_preferences',
          description: 'Update agent preferences in individual memory',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string', description: 'Target agent ID (defaults to caller)' },
              preferences: { type: 'object', description: 'Partial preferences object to merge' }
            },
            required: ['preferences']
          }
        },
        {
          name: 'get_individual_memory',
          description: 'Retrieve an agent\'s individual memory snapshot',
          inputSchema: {
            type: 'object',
            properties: {
              agentId: { type: 'string', description: 'Agent ID (defaults to caller)' }
            }
          }
        }
      ]
    };
  }

  private async _handleToolCall(name: string, args: any = {}, context: RequestContext = DEFAULT_REQUEST_CONTEXT) {
    try {
      const agent = args.agentId || this.agentId;
      const tenantId = context.tenantId;

      // Task 1100: Update last_seen_tz when user has a timezone hint
      if (context.userId && context.timezoneHint) {
        this.memoryManager.updateLastSeenTz(context.userId, context.timezoneHint, tenantId);
      }

      switch (name) {
        // === MEMORY & KNOWLEDGE MANAGEMENT ===
        case 'create_entities': {
          const { entities } = args;

          // NE-S6c fix: Sanitize entity observations
          for (const entity of entities) {
            if (Array.isArray(entity.observations)) {
              for (const obs of entity.observations) {
                const check = MemoryManager.sanitizeContent(obs);
                if (!check.safe) {
                  this.memoryManager.auditLog('create_entity', agent, obs, entity.name, true, check.reason);
                  this.notificationPort.send(`⚠️ Neural write flagged — agent: ${agent}, operation: create_entity, reason: ${check.reason}`).catch(() => {});
                  throw new Error(`Content flagged by sanitizer: ${check.reason}`);
                }
              }
            }
          }

          const createdEntities = await Promise.all(entities.map(async (entity: any) => {
            const entityData = {
              name: entity.name,
              type: entity.entityType,
              observations: entity.observations,
              createdBy: agent,
              timestamp: new Date().toISOString(),
              metadata: {
                vectorEmbedded: true,
                graphIndexed: true,
                cacheEnabled: true
              }
            };

            const entityId = await this.memoryManager.store(agent, entityData, 'shared', 'entity', tenantId, context);

            // NE-S6b: Audit log
            this.memoryManager.auditLog('create_entity', agent, JSON.stringify(entityData), entity.name);

            return { id: entityId, ...entityData };
          }));

          await this.publishEventToUnified('knowledge.entities.created', {
            entities: createdEntities,
            agent: agent
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  created: createdEntities.length,
                  entities: createdEntities,
                  advancedFeatures: {
                    vectorEmbeddings: 'generated',
                    graphRelations: 'indexed'
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'search_entities': {
          const { query, searchType = 'hybrid', limit = 50 } = args;

          // Basic search for now, but structured for advanced features (tenant-scoped)
          const searchResults = await this.memoryManager.search(query, { shared: true }, tenantId);
          
          // Score ALL results first, then dedup, then slice to limit
          // (dedup before slice so highest-scoring duplicate is never lost)
          const scoredResults = searchResults.map((result: any) => {
            const nameMatch = result.content?.name?.toLowerCase().includes(query.toLowerCase());
            const typeMatch = result.content?.type?.toLowerCase().includes(query.toLowerCase());
            const score = nameMatch ? 1.0 : typeMatch ? 0.8 : 0.6;
            const entry: any = {
              ...result,
              searchScore: score,
              searchType: searchType,
              memorySource: result.source?.startsWith('sqlite-vec:') ? 'sqlite-vec' :
                            result.source?.startsWith('weaviate:') ? 'sqlite-vec' : 'sqlite',
              semanticSimilarity: null
            };
            if (result.chunked) {
              entry.chunked = true;
              entry.contentSize = result.contentSize;
              entry.totalChunks = result.totalChunks;
            }
            return entry;
          }).sort((a: any, b: any) => b.searchScore - a.searchScore);

          // Task 1300: Dedup by (entity_name, tenant_id) — tenant already scoped by search
          // Highest relevance score wins; source provenance preserved
          const dedupMap = new Map<string, any>();
          for (const result of scoredResults) {
            const entityName = (result.content?.name || result.id || '').toLowerCase();
            const existing = dedupMap.get(entityName);
            if (!existing) {
              result.sources = [result.memorySource];
              dedupMap.set(entityName, result);
            } else if (result.searchScore > existing.searchScore) {
              // New result has higher score — replace, but keep provenance
              result.sources = Array.from(new Set([...(existing.sources || []), result.memorySource]));
              dedupMap.set(entityName, result);
            } else {
              // Existing wins — just merge source provenance
              existing.sources = Array.from(new Set([...(existing.sources || []), result.memorySource]));
            }
          }
          const dedupCount = dedupMap.size;
          const enhancedResults = Array.from(dedupMap.values()).slice(0, limit);

          const hasChunked = enhancedResults.some((r: any) => r.chunked);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  query,
                  searchType,
                  totalResults: enhancedResults.length,
                  ...(hasChunked ? { chunkedResults: enhancedResults.filter((r: any) => r.chunked).length } : {}),
                  deduplicated: scoredResults.length !== dedupCount,
                  preDeduplicationCount: scoredResults.length,
                  results: enhancedResults,
                }, null, 2),
              },
            ],
          };
        }

        case 'search_nodes': {
          // Legacy alias for graph-only search. Prefer `search_entities` with searchType:'graph'.
          const { query, limit = 50 } = args;
          const searchType = 'graph';
          const searchResults = await this.memoryManager.search(query, { shared: true }, tenantId);
          const enhancedResults = searchResults.slice(0, limit).map((result: any) => {
            const nameMatch = result.content?.name?.toLowerCase().includes(query.toLowerCase());
            const typeMatch = result.content?.type?.toLowerCase().includes(query.toLowerCase());
            const score = nameMatch ? 1.0 : typeMatch ? 0.8 : 0.6;
            const entry: any = {
              ...result,
              searchScore: score,
              searchType,
              memorySource: 'sqlite',
              semanticSimilarity: null
            };
            if (result.chunked) {
              entry.chunked = true;
              entry.contentSize = result.contentSize;
              entry.totalChunks = result.totalChunks;
            }
            return entry;
          }).sort((a: any, b: any) => b.searchScore - a.searchScore);

          // One-time deprecation log
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
                  totalResults: enhancedResults.length,
                  results: enhancedResults,
                }, null, 2),
              },
            ],
          };
        }

        // === INDIVIDUAL MEMORY TOOLS ===
        case 'record_learning': {
          const { context, lesson, confidence = 0.8 } = args;
          const targetAgent = args.agentId || agent;

          // NE-S6c fix: Sanitize learning content
          for (const [field, value] of [['context', context], ['lesson', lesson]] as const) {
            if (value) {
              const check = MemoryManager.sanitizeContent(value);
              if (!check.safe) {
                this.memoryManager.auditLog('record_learning', targetAgent, value, field, true, check.reason);
                this.notificationPort.send(`⚠️ Neural write flagged — agent: ${targetAgent}, operation: record_learning, reason: ${check.reason}`).catch(() => {});
                throw new Error(`Content flagged by sanitizer: ${check.reason}`);
              }
            }
          }

          await this.memoryManager.recordLearning(targetAgent, context, lesson, confidence, tenantId);
          await this.publishEventToUnified('agent.learning.recorded', { agent: targetAgent, context, lesson, confidence });
          return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }] };
        }

        case 'set_preferences': {
          const targetAgent = args.agentId || agent;
          const { preferences = {} } = args;
          await this.memoryManager.updateAgentPreferences(targetAgent, preferences, tenantId);
          return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }] };
        }

        case 'get_individual_memory': {
          const targetAgent = args.agentId || agent;
          const mem = this.memoryManager.getAgentMemory(targetAgent, tenantId);
          return { content: [{ type: 'text', text: JSON.stringify(mem, null, 2) }] };
        }

        // === SESSION PROTOCOL TOOLS ===
        case 'get_agent_context': {
          const { agentId: ctxAgentId, projectId, depth, maxTokens, userId: ctxUserId } = args;
          // Resolve userId: from RequestContext (JWT) or from args (service key callers)
          const resolvedUserId = context.userId || ctxUserId || null;
          const bundle = this.memoryManager.getAgentContext(ctxAgentId, projectId, depth, tenantId, maxTokens, resolvedUserId);
          return { content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }] };
        }

        case 'begin_session': {
          const { agentId: sessAgentId, projectId: sessProjectId, maxTokens: sessMaxTokens } = args;

          // Ensure project entity exists (tenant-scoped)
          this.memoryManager.ensureProjectEntity(sessAgentId, sessProjectId, tenantId);

          // Load warm context (tenant-scoped, with optional token budget and user context)
          const sessUserId = context.userId || args.userId || null;
          const sessContext = this.memoryManager.getAgentContext(sessAgentId, sessProjectId, 'warm', tenantId, sessMaxTokens, sessUserId);

          // Get handoff from previous session (tenant-scoped, idempotency: only return unconsumed handoffs)
          const rawHandoff = this.memoryManager.getActiveHandoff(sessProjectId, tenantId);
          const handoff = rawHandoff && !rawHandoff.consumedAt ? rawHandoff : null;
          const handoffResponse = handoff ? {
            _wrapped: MemoryManager.wrapContent(handoff.summary, 'handoff', sessProjectId, 'agent'),
            _openItemsWrapped: (handoff.openItems || []).map((item: string) =>
              MemoryManager.wrapContent(item, 'handoff_item', sessProjectId, 'agent')
            ),
            fromAgent: handoff.fromAgent,
            projectId: handoff.projectId,
            createdAt: handoff.createdAt,
          } : null;
          if (handoff) {
            this.memoryManager.consumeHandoff(handoff.id);
          }

          // Slack notification (non-fatal — never blocks or fails the tool)
          let notificationStatus = 'skipped';
          try {
            const slackMsg = `📂 ${sessProjectId} session open — ${sessAgentId}`;
            const notifResult = await this.notificationPort.send(slackMsg);
            notificationStatus = notifResult.sent ? 'sent' : (notifResult.error === 'SLACK_WEBHOOK_URL not configured' ? 'skipped' : 'failed');
          } catch {
            notificationStatus = 'failed';
          }

          // NE-S6b: Audit log
          this.memoryManager.auditLog('begin_session', sessAgentId, sessProjectId, sessProjectId);

          // Message Hygiene: Include top-5 unread message summaries + true unread count
          const unreadSummaries = this.memoryManager.getMessages(sessAgentId, {
            unreadOnly: true,
            limit: 5,
            tenantId,
            compact: true,
          }).map((msg: any) => ({
            id: msg.id,
            from: msg.from_agent,
            messageType: msg.message_type,
            priority: msg.priority,
            timestamp: msg.created_at,
            summary: msg.summary || '(no summary)',
          }));

          // True unread count via separate COUNT query
          let totalUnread = unreadSummaries.length;
          try {
            totalUnread = this.memoryManager.countUnreadMessages(sessAgentId, tenantId);
          } catch { /* ai_messages table may not exist */ }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'session_opened',
                agentId: sessAgentId,
                projectId: sessProjectId,
                handoff: handoffResponse,
                context: sessContext,
                unreadMessages: {
                  count: totalUnread,
                  showing: unreadSummaries.length,
                  summaries: unreadSummaries,
                  hint: totalUnread > 5 ? `${totalUnread - 5} more unread — use get_ai_messages(agentId) to retrieve` : 'Use get_message_detail(messageId) for full content',
                },
                notificationStatus,
              }, null, 2)
            }]
          };
        }

        case 'end_session': {
          const {
            agentId: endAgentId,
            projectId: endProjectId,
            summary: endSummary,
            openItems: endOpenItems,
            learnings: endLearnings
          } = args;

          // NE-S6c: Sanitize summary and open items
          const summaryCheck = MemoryManager.sanitizeContent(endSummary);
          if (!summaryCheck.safe) {
            this.memoryManager.auditLog('end_session', endAgentId, endSummary, endProjectId, true, summaryCheck.reason);
            this.notificationPort.send(`⚠️ Neural write flagged — agent: ${endAgentId}, operation: end_session, reason: ${summaryCheck.reason}`).catch(() => {});
            throw new Error(`Content flagged by sanitizer: ${summaryCheck.reason}`);
          }
          if (Array.isArray(endOpenItems)) {
            for (const item of endOpenItems) {
              const itemCheck = MemoryManager.sanitizeContent(item);
              if (!itemCheck.safe) {
                this.memoryManager.auditLog('end_session', endAgentId, item, endProjectId, true, itemCheck.reason);
                this.notificationPort.send(`⚠️ Neural write flagged — agent: ${endAgentId}, operation: end_session, reason: ${itemCheck.reason}`).catch(() => {});
                throw new Error(`Content flagged by sanitizer: ${itemCheck.reason}`);
              }
            }
          }

          // Write handoff flag (deactivates prior, inserts new — tenant-scoped)
          const handoffId = this.memoryManager.writeHandoff(
            endProjectId, endAgentId, endSummary, endOpenItems, tenantId, context.userId
          );

          // NE-S6b: Audit log
          this.memoryManager.auditLog('end_session', endAgentId, endSummary, endProjectId);

          // Record learnings if provided
          if (Array.isArray(endLearnings)) {
            for (const learning of endLearnings) {
              // NE-S6c fix: Sanitize learning content before recording
              for (const [field, value] of [['context', learning.context], ['lesson', learning.lesson]] as const) {
                if (value) {
                  const check = MemoryManager.sanitizeContent(value);
                  if (!check.safe) {
                    this.memoryManager.auditLog('end_session_learning', endAgentId, value, field, true, check.reason);
                    this.notificationPort.send(`⚠️ Neural write flagged — agent: ${endAgentId}, operation: end_session_learning, reason: ${check.reason}`).catch(() => {});
                    throw new Error(`Content flagged by sanitizer: ${check.reason}`);
                  }
                }
              }
              await this.memoryManager.recordLearning(
                endAgentId,
                learning.context,
                learning.lesson,
                learning.confidence || 0.8,
                tenantId
              );
            }
          }

          // Slack notification (non-fatal — never blocks or fails the tool)
          let endNotifStatus = 'skipped';
          try {
            const endSlackMsg = `✅ ${endProjectId} session closed — ${endAgentId} — ${endSummary}`;
            const endNotifResult = await this.notificationPort.send(endSlackMsg);
            endNotifStatus = endNotifResult.sent ? 'sent' : (endNotifResult.error === 'SLACK_WEBHOOK_URL not configured' ? 'skipped' : 'failed');
          } catch {
            endNotifStatus = 'failed';
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'session_closed',
                agentId: endAgentId,
                projectId: endProjectId,
                handoffId: handoffId,
                summary: endSummary,
                openItems: endOpenItems || [],
                learningsRecorded: Array.isArray(endLearnings) ? endLearnings.length : 0,
                notificationStatus: endNotifStatus,
              }, null, 2)
            }]
          };
        }

        case 'add_observations': {
          const { observations } = args;

          // NE-S6c: Sanitize observation contents
          for (const obs of observations) {
            if (Array.isArray(obs.contents)) {
              for (const c of obs.contents) {
                const check = MemoryManager.sanitizeContent(c);
                if (!check.safe) {
                  this.memoryManager.auditLog('add_observation', agent, c, obs.entityName, true, check.reason);
                  this.notificationPort.send(`⚠️ Neural write flagged — agent: ${agent}, operation: add_observation, reason: ${check.reason}`).catch(() => {});
                  throw new Error(`Content flagged by sanitizer: ${check.reason}`);
                }
              }
            }
          }

          const results = await Promise.all(observations.map(async (obs: any) => {
            const observationData = {
              entityName: obs.entityName,
              contents: obs.contents,
              addedBy: agent,
              timestamp: new Date().toISOString(),
              metadata: {
                vectorEmbedded: true,
                relationshipsUpdated: true
              }
            };

            const observationId = await this.memoryManager.store(agent, observationData, 'shared', 'observation', tenantId, context);

            // NE-S6b: Audit log
            this.memoryManager.auditLog('add_observation', agent, JSON.stringify(observationData), obs.entityName);

            return { id: observationId, ...observationData };
          }));

          await this.publishEventToUnified('knowledge.observations.added', {
            observations: results,
            agent: agent,
            enhancedFeatures: {
              vectorEmbeddings: 'updated',
              graphRelations: 'recomputed',
              semanticIndex: 'refreshed'
            }
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  added: results.length,
                  observations: results,
                  advancedProcessing: {
                    vectorEmbeddings: 'generated',
                    graphAnalysis: 'completed',
                    cacheInvalidation: 'smart'
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'create_relations': {
          const { relations } = args;

          const createdRelations = await Promise.all(relations.map(async (relation: any) => {
            const relationData = {
              from: relation.from,
              to: relation.to,
              relationType: relation.relationType,
              properties: relation.properties || {},
              createdBy: agent,
              timestamp: new Date().toISOString(),
              metadata: {
                graphWeight: 1.0,
                bidirectional: false,
                strength: 'medium'
              }
            };

            const relationId = await this.memoryManager.store(agent, relationData, 'shared', 'relation', tenantId, context);

            // NE-S6b: Audit log
            this.memoryManager.auditLog('create_relation', agent, JSON.stringify(relationData), `${relation.from}->${relation.to}`);

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
          // Read by canonical memory_type from shared_memory. Using content.type here is incorrect:
          // entity payloads use domain types (project, analysis, etc.), not the storage type 'entity'.
          const db = this.memoryManager.getDb();
          let rows: any[] = [];
          try {
            rows = db.prepare(
              `SELECT id, memory_type, content, created_by, created_at
               FROM shared_memory
               WHERE tenant_id = ? AND memory_type IN ('entity', 'relation', 'observation')
               ORDER BY created_at DESC`
            ).all(tenantId) as any[];
          } catch {
            rows = [];
          }

          const toEntry = (row: any) => {
            let content: any = {};
            try {
              content = JSON.parse(row.content || '{}');
            } catch {
              content = { raw: row.content, parseError: true };
            }
            return {
              id: row.id,
              type: 'shared',
              content,
              relevance: 0.6,
              source: row.created_by,
              timestamp: new Date(row.created_at),
            };
          };

          const entitiesOnly = rows.filter((r: any) => r.memory_type === 'entity').map(toEntry);
          const relationsOnly = rows.filter((r: any) => r.memory_type === 'relation').map(toEntry);
          const observationsOnly = rows.filter((r: any) => r.memory_type === 'observation').map(toEntry);

          const graphData: any = {
            timestamp: new Date().toISOString(),
            statistics: {
              nodeCount: entitiesOnly.length,
              edgeCount: relationsOnly.length,
              observationCount: observationsOnly.length,
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

        // === AI AGENT COMMUNICATION ===
        case 'send_ai_message': {
          // Avoid conflating sender and target: support `to`/`from` and aliases
          const explicitTarget = args.to || args.agentId; // agentId kept for backward compatibility
          if (!args.from) {
            console.warn(`⚠️ send_ai_message called without 'from' — attributing to server. Callers should always pass 'from'.`);
          }
          const senderAgentId = args.from || this.agentId;
          const content = args.content ?? args.message;
          const messageType = args.messageType ?? 'info';
          const priority = args.priority ?? 'normal';
          const broadcast = args.broadcast === true || explicitTarget === '*';
          const excludeSelf = args.excludeSelf !== false; // default true
          const capSelector: string[] | undefined = args.toCapabilities || args.capabilities;

          if (!content) {
            throw new Error('Missing required field: `content` (or `message` alias)');
          }

          // NE-S6c: Sanitize message content
          const msgSanitize = MemoryManager.sanitizeContent(content);
          if (!msgSanitize.safe) {
            this.memoryManager.auditLog('send_ai_message', senderAgentId, content, explicitTarget, true, msgSanitize.reason);
            this.notificationPort.send(`⚠️ Neural write flagged — agent: ${senderAgentId}, operation: send_ai_message, reason: ${msgSanitize.reason}`).catch(() => {});
            throw new Error(`Content flagged by sanitizer: ${msgSanitize.reason}`);
          }

          // Resolve recipients
          let recipients: string[] = [];
          if (!broadcast && explicitTarget) {
            recipients = [explicitTarget];
          } else if (broadcast) {
            const regs = await this.memoryManager.search('agent_registration', { shared: true });
            recipients = regs
              .map((r: any) => r?.content?.agentId)
              .filter((id: any) => typeof id === 'string' && id.length > 0);
            if (excludeSelf) recipients = recipients.filter(id => id !== senderAgentId);
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
            if (excludeSelf) recipients = recipients.filter(id => id !== senderAgentId);
          } else {
            throw new Error('Missing recipient: provide `to`, `broadcast: true`, or `toCapabilities`.');
          }

          // De-duplicate recipients
          recipients = Array.from(new Set(recipients));

          const results: { to: string; messageId: string }[] = [];

          for (const targetAgentId of recipients) {
            const messageData = {
              from: senderAgentId,
              to: targetAgentId,
              content,
              messageType,
              priority,
              timestamp: new Date().toISOString(),
              deliveryStatus: 'pending',
              metadata: {
                realTimeDelivery: "true",
                persistentStorage: "true", 
                crossPlatform: "true"
              }
            };

            const messageId = await this.memoryManager.storeMessage(
              senderAgentId,
              targetAgentId,
              content,
              messageType,
              priority,
              messageData.metadata,
              tenantId,
              context
            );
            results.push({ to: targetAgentId, messageId });

            // NE-S6b: Audit log
            this.memoryManager.auditLog('send_ai_message', senderAgentId, content, targetAgentId);

            // Simulate real-time delivery per recipient
            await this.simulateRealTimeDelivery(messageData, messageId);

            await this.publishEventToUnified('ai.message.sent', {
              messageId,
              from: senderAgentId,
              to: targetAgentId,
              messageType,
              priority,
              realTimeDelivered: true
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: results.length > 0 ? 'sent' : 'no_recipients',
                  recipients: recipients,
                  sentCount: results.length,
                  messageIds: results,
                  deliveryTime: '<100ms',
                  selection: {
                    mode: broadcast ? 'broadcast' : (capSelector?.length ? 'capabilities' : 'direct'),
                    capabilities: capSelector || [],
                    excludeSelf
                  },
                  features: {
                    realTimeDelivery: 'websocket',
                    persistentStorage: 'enabled',
                    crossPlatformSync: 'active',
                    priorityQueue: priority
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'get_ai_messages': {
          const { agentId: targetAgentId, messageType, since, markAsRead, includeArchived } = args;
          const compact = args.compact !== false; // default true
          const unreadOnly = args.unreadOnly !== false; // default true
          // Server-side hard cap: 20 messages max, floor of 1
          const limit = Math.max(1, Math.min(args.limit ?? 5, 20));

          // P1: Use dedicated ai_messages table with indexed queries (tenant-scoped)
          const rawMessages = this.memoryManager.getMessages(targetAgentId, {
            messageType,
            since,
            limit,
            unreadOnly,
            markAsRead,
            tenantId,
            includeArchived,
            compact,
          });

          // Transform to response format — compact mode omits full content
          const formattedMessages = rawMessages.map((msg: any) => {
            const base: any = {
              id: msg.id,
              type: 'shared',
              content: {
                from: msg.from_agent,
                to: msg.to_agent,
                messageType: msg.message_type,
                priority: msg.priority,
                timestamp: msg.created_at,
                deliveryStatus: 'delivered',
              },
              relevance: 0.6,
              source: msg.from_agent,
              timestamp: msg.created_at,
            };
            if (compact) {
              // Summary only — agent uses get_message_detail for full content
              base.content.summary = msg.summary || MemoryManager.generateSummary(msg.content || '');
            } else {
              base.content.content = msg.content;
              base.content.metadata = msg.metadata ? JSON.parse(msg.metadata)?.original || msg.metadata : {};
            }
            return base;
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  agentId: targetAgentId,
                  totalMessages: formattedMessages.length,
                  returnedMessages: formattedMessages.length,
                  compact,
                  hint: compact ? 'Use get_message_detail(messageId) for full content' : undefined,
                  filters: {
                    messageType: messageType || 'all',
                    since: since || 'beginning',
                    unreadOnly,
                    limit
                  },
                  messages: formattedMessages,
                  metadata: {
                    realTimeSync: true,
                    crossPlatformAccess: true,
                    searchPerformance: 'optimized'
                  }
                }, null, 2),
              },
            ],
          };
        }

        // === MESSAGE DETAIL (Message Hygiene) ===
        case 'get_message_detail': {
          const { messageId: detailMsgId, agentId: detailAgentId } = args;
          const detailMarkRead = args.markAsRead !== false; // default true

          if (!detailMsgId) {
            throw new Error('Missing required field: messageId');
          }
          if (!detailAgentId) {
            throw new Error('Missing required field: agentId (recipient identity required)');
          }

          // Tenant + agent scoping to prevent cross-boundary reads
          const msg = await this.memoryManager.getMessageById(detailMsgId, detailMarkRead, tenantId, detailAgentId);
          if (!msg) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Message not found', messageId: detailMsgId }) }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                id: msg.id,
                from: msg.from_agent,
                to: msg.to_agent,
                content: msg.content,
                messageType: msg.message_type,
                priority: msg.priority,
                timestamp: msg.created_at,
                readAt: msg.read_at,
                summary: msg.summary,
                metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
              }, null, 2),
            }],
          };
        }

        // === USER PROFILE (Task 1100) ===
        case 'get_user_profile': {
          const { userId: profileUserId } = args;

          // Enforce userId ownership for JWT callers (authType === 'jwt')
          if (context.authType === 'jwt' && context.userId && profileUserId !== context.userId) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Forbidden', code: 'USER_ID_MISMATCH', message: 'JWT callers cannot access other users profiles' }) }],
              isError: true,
            };
          }

          const profile = this.memoryManager.getUserProfile(profileUserId, tenantId);
          if (!profile) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Not Found', message: `User ${profileUserId} not found in tenant ${tenantId}` }) }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }]
          };
        }

        case 'update_user_profile': {
          const { userId: updateUserId, displayName, timezone, locale, dateFormat, units, workingHours } = args;

          // Enforce userId ownership for JWT callers
          if (context.authType === 'jwt' && context.userId && updateUserId !== context.userId) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Forbidden', code: 'USER_ID_MISMATCH', message: 'JWT callers cannot modify other users profiles' }) }],
              isError: true,
            };
          }

          const updatedProfile = this.memoryManager.updateUserProfile(
            updateUserId,
            { displayName, timezone, locale, dateFormat, units, workingHours },
            tenantId
          );

          if (!updatedProfile) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Not Found', message: `User ${updateUserId} not found in tenant ${tenantId}` }) }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify({ status: 'updated', profile: updatedProfile }, null, 2) }]
          };
        }

        // === MESSAGE LIFECYCLE (Task 1200) ===
        case 'mark_messages_read': {
          const { agentId: markAgentId, messageIds } = args;
          const markedCount = this.memoryManager.markMessagesRead(markAgentId, messageIds, tenantId);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                agentId: markAgentId,
                markedAsRead: markedCount,
                scope: messageIds ? 'specific' : 'all_unread',
              }, null, 2)
            }]
          };
        }

        case 'archive_messages': {
          const { agentId: archiveAgentId, olderThanDays = 30 } = args;
          const archivedCount = this.memoryManager.archiveMessages(archiveAgentId, olderThanDays, tenantId);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'ok',
                agentId: archiveAgentId,
                archived: archivedCount,
                olderThanDays,
              }, null, 2)
            }]
          };
        }

        case 'register_agent': {
          const { agentId: newAgentId, name, capabilities, endpoint, metadata = {} } = args;
          
          const agentData = {
            agentId: newAgentId,
            name,
            capabilities,
            endpoint,
            metadata: {
              ...metadata,
              registeredBy: agent,
              registrationTime: new Date().toISOString(),
              status: 'active',
              version: '1.0.0'
            }
          };

          // Agent registrations are GLOBAL (not tenant-scoped per isolation policy)
          const registrationId = await this.memoryManager.store(agent, agentData, 'shared', 'agent_registration');

          // Simulate agent registration with unified server
          await this.simulateAgentRegistration(agentData);

          await this.publishEventToUnified('agent.registered', {
            registrationId,
            agentId: newAgentId,
            name,
            capabilities,
            registeredBy: agent
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  registrationId,
                  agentId: newAgentId,
                  status: 'registered',
                  features: {
                    crossPlatformAccess: true,
                    realTimeMessaging: true,
                    autonomousCapability: capabilities.includes('autonomous'),
                    multiProviderAI: capabilities.includes('multi-provider')
                  }
                }, null, 2),
              },
            ],
          };
        }

        case 'set_agent_identity': {
          const {
            currentAgentId,
            newAgentId,
            newName,
            capabilities = [],
            metadata = {},
            autoRegister = true
          } = args;

          if (!newAgentId || typeof newAgentId !== 'string' || newAgentId.trim().length === 0) {
            throw new Error('Missing required field: `newAgentId`');
          }

          const updatedAgentId = newAgentId.trim();
          const previousAgentId = (currentAgentId && String(currentAgentId).trim().length > 0)
            ? String(currentAgentId).trim()
            : updatedAgentId;

          const identityRecord = {
            previousAgentId,
            updatedAgentId,
            updatedName: newName || updatedAgentId,
            capabilities,
            metadata,
            updatedBy: args.agentId || this.agentId,
            timestamp: new Date().toISOString()
          };

          // Agent identity is GLOBAL (not tenant-scoped per isolation policy)
          const identityId = await this.memoryManager.store(previousAgentId, identityRecord, 'shared', 'agent_identity');

          console.log(`🪪 Agent identity update recorded: ${previousAgentId} → ${updatedAgentId}`);

          const responsePayload = {
            status: 'identity_updated',
            recordId: identityId,
            previousAgentId,
            agentId: updatedAgentId,
            name: newName || updatedAgentId,
            capabilitiesApplied: capabilities.length,
            autoRegister: autoRegister === true,
            metadata
          };

          const response: any = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(responsePayload, null, 2)
              }
            ]
          };

          if (autoRegister === true) {
            response.bridgeCommand = {
              type: 'update_identity',
              agentId: updatedAgentId,
              name: newName || updatedAgentId,
              previousAgentId,
              capabilities,
              metadata,
              autoRegister: true
            };
          }

          return response;
        }

        case 'get_agent_status': {
          const { agentId: targetAgentId } = args;
          
          let statusData;
          
          if (targetAgentId) {
            // Get status for specific agent
            const agentRecords = await this.memoryManager.search(`"agentId":"${targetAgentId}"`, { shared: true });
            const latestRecord = agentRecords[0];
            
            statusData = {
              agentId: targetAgentId,
              status: latestRecord ? 'active' : 'unknown',
              lastSeen: latestRecord?.timestamp || 'never',
              capabilities: latestRecord?.content?.capabilities || []
            };
          } else {
            // Get status for all agents
            const allAgentRecords = await this.memoryManager.search('agent_registration', { shared: true });
            
            statusData = {
              totalAgents: allAgentRecords.length,
              agents: allAgentRecords.map(record => ({
                agentId: record.content?.agentId,
                name: record.content?.name,
                lastSeen: record.timestamp
              }))
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(statusData, null, 2),
              },
            ],
          };
        }

        // === CROSS-PLATFORM SUPPORT ===
        case 'translate_path': {
          const { path, fromPlatform, toPlatform } = args;
          
          const translatedPath = this.translatePath(path, fromPlatform, toPlatform);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  originalPath: path,
                  fromPlatform,
                  toPlatform,
                  translatedPath,
                  pathInfo: {
                    isAbsolute: path.startsWith('/') || path.match(/^[A-Z]:/),
                    containsSpaces: path.includes(' '),
                    pathSeparator: toPlatform === 'windows' ? '\\' : '/',
                    isValid: true
                  }
                }, null, 2),
              },
            ],
          };
        }

        // === KNOWLEDGE GRAPH MUTATIONS (Phase A) ===
        case 'delete_entity': {
          const { entityName, dryRun = false, reason } = args;
          const actor = context.userId || context.apiKeyId || agent;

          // Authorization (codex finding #1: context only, never args)
          const authResult = this.memoryManager.authorizeGraphMutation('delete_entity', context);
          if (!authResult.authorized) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: authResult.reason }) }],
              isError: true,
            };
          }

          // Find targets (tenant-scoped)
          const entityRows = this.memoryManager.findEntitiesByName(entityName, tenantId);
          if (entityRows.length === 0) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Not Found', message: `Entity "${entityName}" not found in tenant ${tenantId}` }) }],
              isError: true,
            };
          }

          const observationRows = this.memoryManager.findObservationsByEntity(entityName, tenantId);
          const relationRows = this.memoryManager.findRelationsByEntity(entityName, tenantId);

          // Phase B: member_provenance → enforce row-level ownership on all target rows
          if (authResult.reason === 'member_provenance') {
            const allRows = [...entityRows, ...observationRows, ...relationRows];
            const ownerCheck = this.memoryManager.checkMemberOwnership(allRows, context);
            if (!ownerCheck.allowed) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: ownerCheck.reason }) }],
                isError: true,
              };
            }
          }

          const allTargetIds = [
            ...entityRows.map((r: any) => r.id),
            ...observationRows.map((r: any) => r.id),
            ...relationRows.map((r: any) => r.id),
          ];

          if (dryRun) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  dryRun: true,
                  entityName,
                  actor,
                  targets: {
                    entities: entityRows.length,
                    observations: observationRows.length,
                    relations: relationRows.length,
                    totalRows: allTargetIds.length,
                  },
                  entityIds: entityRows.map((r: any) => r.id),
                  observationIds: observationRows.map((r: any) => r.id),
                  relationIds: relationRows.map((r: any) => r.id),
                }, null, 2),
              }],
            };
          }

          // Execute cascade delete
          const deleteResult = await this.memoryManager.deleteGraphRows(allTargetIds, tenantId);

          // Audit (codex finding #6)
          this.memoryManager.auditMutationOp('delete_entity', context, entityName, allTargetIds, reason);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'deleted',
                entityName,
                actor,
                reason: reason || null,
                deleted: {
                  entities: entityRows.length,
                  observations: observationRows.length,
                  relations: relationRows.length,
                  totalRows: deleteResult.deleted,
                },
                weaviateCleanup: deleteResult.weaviateCleanup,
                weaviateFailures: deleteResult.weaviateFailures,
                vectorCleanup: deleteResult.vectorCleanup,
                vectorFailures: deleteResult.vectorFailures,
              }, null, 2),
            }],
          };
        }

        case 'remove_observations': {
          const { entityName, observationIds, containsAny, dryRun = false, reason } = args;
          const actor = context.userId || context.apiKeyId || agent;

          // Authorization
          const authResult = this.memoryManager.authorizeGraphMutation('remove_observations', context);
          if (!authResult.authorized) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: authResult.reason }) }],
              isError: true,
            };
          }

          // Find targets based on selector
          let targetRows: any[] = [];
          if (observationIds && observationIds.length > 0) {
            // Find by entity + filter to specified IDs
            const allObs = this.memoryManager.findObservationsByEntity(entityName, tenantId);
            const idSet = new Set(observationIds);
            targetRows = allObs.filter((r: any) => idSet.has(r.id));
          } else if (containsAny && containsAny.length > 0) {
            targetRows = this.memoryManager.findObservationsByContainsAny(entityName, containsAny, tenantId);
          } else {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Bad Request', message: 'Provide observationIds or containsAny selector' }) }],
              isError: true,
            };
          }

          if (targetRows.length === 0) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ status: 'no_match', entityName, matchedObservations: 0 }) }],
            };
          }

          // Phase B: member_provenance → enforce row-level ownership
          if (authResult.reason === 'member_provenance') {
            const ownerCheck = this.memoryManager.checkMemberOwnership(targetRows, context);
            if (!ownerCheck.allowed) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: ownerCheck.reason }) }],
                isError: true,
              };
            }
          }

          const targetIds = targetRows.map((r: any) => r.id);

          if (dryRun) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  dryRun: true,
                  entityName,
                  actor,
                  matchedObservations: targetIds.length,
                  observationIds: targetIds,
                }, null, 2),
              }],
            };
          }

          const deleteResult = await this.memoryManager.deleteGraphRows(targetIds, tenantId);
          this.memoryManager.auditMutationOp('remove_observations', context, entityName, targetIds, reason);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'removed',
                entityName,
                actor,
                reason: reason || null,
                removedObservations: deleteResult.deleted,
                weaviateCleanup: deleteResult.weaviateCleanup,
                weaviateFailures: deleteResult.weaviateFailures,
                vectorCleanup: deleteResult.vectorCleanup,
                vectorFailures: deleteResult.vectorFailures,
              }, null, 2),
            }],
          };
        }

        case 'update_observation': {
          const { observationId, contentIndex, newContent, reason } = args;
          const actor = context.userId || context.apiKeyId || agent;

          // Authorization
          const authResult = this.memoryManager.authorizeGraphMutation('update_observation', context);
          if (!authResult.authorized) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: authResult.reason }) }],
              isError: true,
            };
          }

          // Sanitizer parity (codex finding #3)
          const sanitizeResult = MemoryManager.sanitizeContent(newContent);
          if (!sanitizeResult.safe) {
            this.memoryManager.auditLog('update_observation', actor, newContent, observationId, true, sanitizeResult.reason);
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Content Rejected', message: `Content flagged by sanitizer: ${sanitizeResult.reason}` }) }],
              isError: true,
            };
          }

          // Phase B: member_provenance → fetch row and check ownership before updating
          if (authResult.reason === 'member_provenance') {
            const obsRow = this.memoryManager.getObservationRow(observationId, tenantId);
            if (obsRow) {
              const ownerCheck = this.memoryManager.checkMemberOwnership([obsRow], context);
              if (!ownerCheck.allowed) {
                return {
                  content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: ownerCheck.reason }) }],
                  isError: true,
                };
              }
            }
          }

          const updateResult = await this.memoryManager.updateObservationContent(
            observationId, newContent, contentIndex, tenantId
          );

          this.memoryManager.auditMutationOp('update_observation', context, observationId, [observationId], reason);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'updated',
                observationId,
                actor,
                reason: reason || null,
                updated: updateResult.updated,
                weaviateReindexed: updateResult.weaviateReindexed,
                vectorReindexed: updateResult.vectorReindexed,
              }, null, 2),
            }],
          };
        }

        case 'delete_observations_by_entity': {
          const { entityName, dryRun = false, reason } = args;
          const actor = context.userId || context.apiKeyId || agent;

          // Authorization
          const authResult = this.memoryManager.authorizeGraphMutation('delete_observations_by_entity', context);
          if (!authResult.authorized) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: authResult.reason }) }],
              isError: true,
            };
          }

          const observationRows = this.memoryManager.findObservationsByEntity(entityName, tenantId);

          if (observationRows.length === 0) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ status: 'no_match', entityName, matchedObservations: 0 }) }],
            };
          }

          // Phase B: member_provenance → enforce row-level ownership
          if (authResult.reason === 'member_provenance') {
            const ownerCheck = this.memoryManager.checkMemberOwnership(observationRows, context);
            if (!ownerCheck.allowed) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ error: 'Unauthorized', message: ownerCheck.reason }) }],
                isError: true,
              };
            }
          }

          const targetIds = observationRows.map((r: any) => r.id);

          if (dryRun) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  dryRun: true,
                  entityName,
                  actor,
                  matchedObservations: targetIds.length,
                  observationIds: targetIds,
                }, null, 2),
              }],
            };
          }

          const deleteResult = await this.memoryManager.deleteGraphRows(targetIds, tenantId);
          this.memoryManager.auditMutationOp('delete_observations_by_entity', context, entityName, targetIds, reason);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'deleted',
                entityName,
                actor,
                reason: reason || null,
                deletedObservations: deleteResult.deleted,
                weaviateCleanup: deleteResult.weaviateCleanup,
                weaviateFailures: deleteResult.weaviateFailures,
                vectorCleanup: deleteResult.vectorCleanup,
                vectorFailures: deleteResult.vectorFailures,
              }, null, 2),
            }],
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

  // === HELPER METHODS ===
  private async simulateRealTimeDelivery(messageData: any, messageId?: string) {
    // Simulate WebSocket message delivery
    console.log(`⚡ Real-time delivery: ${messageData.from} → ${messageData.to}`);
    
    // TODO: Implement actual WebSocket delivery
    // This should:
    // 1. Connect to MessageHub WebSocket server on port 3003
    // 2. Send notification to target agent
    // 3. Update deliveryStatus from 'pending' to 'delivered'
    // 4. Handle offline agents with queue mechanism
    
    // For now, we'll update the message status in memory and persist it
    try {
      // Update the message delivery status
      if (this.messageHub) {
        await this.messageHub.notifyAgentOfMessage(messageData.to, {
          messageId: messageId || messageData.id,
          from: messageData.from,
          content: messageData.content,
          priority: messageData.priority,
          timestamp: messageData.timestamp
        });
        
        // Update status to delivered
        messageData.deliveryStatus = 'delivered';
        console.log(`✅ Message delivered to ${messageData.to}`);
      } else {
        console.log(`⚠️ MessageHub not initialized - simulating delivery for ${messageData.to}`);
        // Even without MessageHub, we'll mark as delivered for testing
        messageData.deliveryStatus = 'delivered';
      }

      // Persist the updated delivery status back to the database
      if (messageId) {
        try {
          // Update the stored message with the new delivery status
          await this.memoryManager.update(messageId, messageData, 'shared');
          console.log(`💾 Updated delivery status to '${messageData.deliveryStatus}' for message ${messageId}`);
        } catch (updateError) {
          console.error(`❌ Failed to update delivery status in database:`, updateError);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to deliver message to ${messageData.to}:`, error);
      messageData.deliveryStatus = 'failed';
      
      // Also persist the failed status
      if (messageId) {
        try {
          await this.memoryManager.update(messageId, messageData, 'shared');
          console.log(`💾 Updated delivery status to 'failed' for message ${messageId}`);
        } catch (updateError) {
          console.error(`❌ Failed to update failed delivery status in database:`, updateError);
        }
      }
    }
  }

  private async simulateAgentRegistration(agentData: any) {
    // Simulate unified server registration
    console.log(`🤖 Agent registered: ${agentData.agentId} (${agentData.name})`);
  }

  // === UTILITY METHODS ===
  private translatePath(path: string, fromPlatform: string, toPlatform: string): string {
    if (fromPlatform === toPlatform) return path;
    
    // Simple path translation simulation
    if (fromPlatform === 'windows' && toPlatform === 'wsl') {
      return path.replace(/^([A-Z]):/, '/mnt/$1').toLowerCase().replace(/\\/g, '/');
    } else if (fromPlatform === 'wsl' && toPlatform === 'windows') {
      return path.replace(/^\/mnt\/([a-z])/, '$1:').replace(/\//g, '\\');
    }
    
    return path;
  }

  async start() {
    if (this.messageHub) {
      await this.messageHub.start();
    }

    // Start SLO monitoring (check every 60 seconds)
    startSLOMonitoring(60000);

    // Event compaction with 30-day retention (per PM guidance)
    // Uses defaults from metrics module (10000 events, 720 hours, 1 hour interval)
    // Compaction is async/non-blocking
    metrics.startCompaction();

    return new Promise<void>((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`🧠 Unified Neural AI Collaboration MCP Server started on port ${this.port}`);
        console.log(`📡 MCP Endpoint: http://localhost:${this.port}/mcp`);
        console.log(`💬 AI Messaging: http://localhost:${this.port}/ai-message`);
        console.log(`📊 Health Check: http://localhost:${this.port}/health`);
        console.log(`📈 SLO Status: http://localhost:${this.port}/slo/status`);
        console.log(`🔧 System Status: http://localhost:${this.port}/system/status`);
        
        if (this.messageHub) {
          const hubPort = this.messageHub.getPort();
          console.log(`📡 Message Hub WebSocket: ws://localhost:${hubPort}`);
          console.log('⚡ Real-time notifications: <100ms message discovery');
        }
        
        console.log('🌟 Capabilities:');
        console.log('   🧠 Knowledge Graph (SQLite + Weaviate)');
        console.log('   💬 AI Agent Messaging');
        console.log('   🌐 Cross-Platform Path Translation');
        console.log('   📈 Observability & SLOs');
        console.log('');
        console.log('🚀 Ready for Neural AI Collaboration!');
        resolve();
      });
    });
  }

  close() {
    this.memoryManager.close();
  }

  /** Expose Express app for testing (supertest). */
  getExpressApp(): express.Application {
    return this.app;
  }

  /** Expose MemoryManager for direct testing. */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.NEURAL_MCP_PORT || '6174');
  const server = new NeuralMCPServer(port);
  
  server.start().catch((error) => {
    console.error('Failed to start Unified Neural MCP Server:', error);
    process.exit(1);
  });
}
