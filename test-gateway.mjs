#!/usr/bin/env node

// Simple test gateway for MCP testing
import express from 'express';
import cors from 'cors';

const app = express();
const port = 5200;

app.use(cors());
app.use(express.json());

// Mock memory state for testing
let entities = [];
let changeQueue = new Set();
let lastSync = 0;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'event-driven',
    timestamp: new Date().toISOString(),
    queuedChanges: changeQueue.size,
    totalEntities: entities.length
  });
});

// Platform registry
app.get('/api/platforms', (req, res) => {
  res.json([
    {
      id: 'claude-builtin',
      name: 'Claude Desktop',
      type: 'mcp-native',
      status: 'connected'
    },
    {
      id: 'neural-ai',
      name: 'Neural AI Collaboration',
      type: 'http-api',
      status: 'healthy'
    }
  ]);
});

// Create entities
app.post('/api/entities', (req, res) => {
  const { entities: newEntities } = req.body;
  
  if (!Array.isArray(newEntities)) {
    return res.status(400).json({ error: 'entities must be an array' });
  }

  // Add entities with timestamps
  const processedEntities = newEntities.map(entity => ({
    ...entity,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    source: 'test-gateway'
  }));

  entities.push(...processedEntities);
  
  // Track change
  changeQueue.add(`create_${newEntities.length}_entities_${Date.now()}`);
  
  console.log(`📝 Created ${newEntities.length} entities. Total: ${entities.length}, Changes: ${changeQueue.size}`);
  
  res.json({
    success: true,
    created: processedEntities.length,
    entities: processedEntities,
    totalEntities: entities.length,
    queuedChanges: changeQueue.size
  });
});

// Search entities
app.get('/api/entities/search', (req, res) => {
  const { query = '', limit = 50 } = req.query;
  
  let filtered = entities;
  if (query) {
    filtered = entities.filter(entity => 
      JSON.stringify(entity).toLowerCase().includes(query.toLowerCase())
    );
  }
  
  const results = filtered.slice(0, parseInt(limit));
  
  res.json({
    query,
    total: filtered.length,
    returned: results.length,
    entities: results
  });
});

// Memory federation sync
app.post('/api/federation/sync', (req, res) => {
  const { force = false } = req.body;
  const now = Date.now();
  
  // Skip if no changes and not forced
  if (!force && changeQueue.size === 0) {
    return res.json({
      skipped: 'no_changes',
      lastSync,
      queuedChanges: 0
    });
  }
  
  // Simulate sync process
  const changes = Array.from(changeQueue);
  changeQueue.clear();
  lastSync = now;
  
  console.log(`🔄 Memory sync completed: ${changes.length} changes processed`);
  
  res.json({
    synced: changes.length,
    changes,
    platforms: ['neural-ai'],
    timestamp: new Date().toISOString(),
    lastSync
  });
});

// Auto-sync configuration
app.post('/api/auto-sync/configure', (req, res) => {
  const { enabled = false, threshold = 10 } = req.body;
  
  res.json({
    autoSyncEnabled: enabled,
    threshold,
    message: enabled ? 
      `Auto-sync enabled: will sync after ${threshold} changes` :
      'Auto-sync disabled - manual sync only'
  });
});

// MCP endpoint (basic)
app.post('/mcp', (req, res) => {
  res.json({
    jsonrpc: '2.0',
    result: {
      tools: [
        'universal:create_entities',
        'universal:get_entities', 
        'universal:search_entities',
        'universal:sync_memory',
        'universal:configure_auto_sync'
      ]
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 Universal MCP Gateway Test Server');
  console.log(`🌐 Running on port ${port}`);
  console.log(`📊 Health: http://localhost:${port}/health`);
  console.log(`🔗 Platforms: http://localhost:${port}/api/platforms`);
  console.log('💡 Event-driven sync mode (no token waste)');
});