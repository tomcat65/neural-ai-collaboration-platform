import express from 'express';
import cors from 'cors';
import { MessageHub, MessageFilters } from './MessageHub';

const app = express();
const PORT = process.env.MESSAGE_HUB_PORT || 3003;

// Initialize Message Hub
const messageHub = new MessageHub();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'Message Hub',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Message endpoints
app.post('/api/messages', async (req, res) => {
  try {
    const { from, to, content, type = 'general', priority = 'medium', source = 'http', tags, metadata } = req.body;

    // Validation
    if (!from || !to || !content) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, content'
      });
    }

    const messageData = {
      timestamp: new Date().toISOString(),
      from_agent: from,
      to_agent: to,
      content,
      message_type: type,
      priority,
      source,
      tags,
      metadata
    };

    const messageId = await messageHub.storeMessage(messageData);

    return res.status(201).json({
      status: 'created',
      messageId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating message:', error);
    return res.status(500).json({
      error: 'Failed to create message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const filters: MessageFilters = {
      from_agent: req.query.from as string,
      to_agent: req.query.to as string,
      message_type: req.query.type as string,
      priority: req.query.priority as string,
      source: req.query.source as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      since: req.query.since as string,
      until: req.query.until as string
    };

    const messages = await messageHub.listMessages(filters);

    res.json({
      messages,
      count: messages.length,
      filters
    });
  } catch (error) {
    console.error('Error listing messages:', error);
    res.status(500).json({
      error: 'Failed to list messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/messages/recent', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const messages = await messageHub.getRecentMessages(limit);

    res.json({
      messages,
      count: messages.length,
      limit
    });
  } catch (error) {
    console.error('Error getting recent messages:', error);
    res.status(500).json({
      error: 'Failed to get recent messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/messages/:id', async (req, res) => {
  try {
    const message = await messageHub.getMessage(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Message not found'
      });
    }

    return res.json({ message });
  } catch (error) {
    console.error('Error getting message:', error);
    return res.status(500).json({
      error: 'Failed to get message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Agent endpoints
app.post('/api/agents', async (req, res) => {
  try {
    const { id, name, type, capabilities, status = 'active' } = req.body;

    // Validation
    if (!id || !name || !type) {
      return res.status(400).json({
        error: 'Missing required fields: id, name, type'
      });
    }

    await messageHub.registerAgent({
      id,
      name,
      type,
      capabilities,
      status,
      last_seen: new Date().toISOString()
    });

    return res.status(201).json({
      status: 'registered',
      agentId: id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error registering agent:', error);
    return res.status(500).json({
      error: 'Failed to register agent',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/agents', async (_req, res) => {
  try {
    const agents = await messageHub.getAgents();
    return res.json({ agents, count: agents.length });
  } catch (error) {
    console.error('Error getting agents:', error);
    return res.status(500).json({
      error: 'Failed to get agents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/agents/:id/messages', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const messages = await messageHub.getAgentMessages(req.params.id, limit);

    res.json({
      messages,
      count: messages.length,
      agentId: req.params.id,
      limit
    });
  } catch (error) {
    console.error('Error getting agent messages:', error);
    res.status(500).json({
      error: 'Failed to get agent messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Search endpoints
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    if (!query) {
      return res.status(400).json({
        error: 'Missing search query parameter: q'
      });
    }

    const messages = await messageHub.searchMessages(query, limit);

    return res.json({
      messages,
      count: messages.length,
      query,
      limit
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    return res.status(500).json({
      error: 'Failed to search messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Statistics endpoint
app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await messageHub.getStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({
      error: 'Failed to get statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    details: error instanceof Error ? error.message : 'Unknown error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
async function startServer() {
  try {
    // Initialize Message Hub
    await messageHub.initialize();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Message Hub server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📨 API endpoints: http://localhost:${PORT}/api/`);
    });
  } catch (error) {
    console.error('❌ Failed to start Message Hub server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Message Hub server...');
  await messageHub.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down Message Hub server...');
  await messageHub.close();
  process.exit(0);
});

// Start the server
startServer(); 