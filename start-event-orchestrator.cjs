#!/usr/bin/env node

/**
 * Event-Driven Agent Orchestrator - JavaScript Version
 * Lightweight orchestrator for webhook-based agent activation
 */

const express = require('express');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class EventDrivenOrchestrator {
  constructor(port = 3004) {
    this.port = port;
    this.wsPort = port + 1;
    this.agents = new Map();
    this.eventBus = new EventEmitter();
    this.app = express();
    this.wsServer = null;
    
    console.log(`🏗️ EventDrivenOrchestrator initialized - agents Map created: ${this.agents instanceof Map}`);
    
    this.setupWebhooks();
    this.setupWebSocketServer();
  }
  
  setupWebSocketServer() {
    this.wsServer = new WebSocket.Server({ port: this.wsPort });
    
    this.wsServer.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://localhost`);
      const agentId = url.searchParams.get('agent');
      
      if (!agentId) {
        ws.close(1002, 'Agent ID required');
        return;
      }
      
      console.log(`🔌 Agent ${agentId} connected via WebSocket`);
      ws.agentId = agentId;
      
      // Register agent
      console.log(`🔧 About to register agent: ${agentId}`);
      this.registerAgent(agentId);
      console.log(`✅ Finished registering agent: ${agentId}`);
      
      // Handle agent messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleAgentMessage(agentId, message);
        } catch (error) {
          console.error('Invalid message from agent:', error);
        }
      });
      
      // Send pending triggers
      const agent = this.agents.get(agentId);
      if (agent && agent.pendingTriggers.length > 0) {
        ws.send(JSON.stringify({
          type: 'triggers',
          triggers: agent.pendingTriggers
        }));
        agent.pendingTriggers = [];
      }
      
      ws.on('close', () => {
        this.handleAgentDisconnect(agentId);
      });
    });
    
    console.log(`📡 WebSocket server started on port ${this.wsPort}`);
  }
  
  setupWebhooks() {
    this.app.use(express.json());
    
    // Webhook endpoint for triggering agents
    this.app.post('/webhook/trigger/:agentId', async (req, res) => {
      const { agentId } = req.params;
      const trigger = {
        type: req.body.type || 'message',
        source: req.body.source || 'webhook',
        target: agentId,
        priority: req.body.priority || 'medium',
        payload: req.body.payload,
        timestamp: new Date()
      };
      
      await this.triggerAgent(agentId, trigger);
      
      res.json({ 
        status: 'triggered',
        agentId,
        trigger
      });
    });
    
    // Git webhook for code changes
    this.app.post('/webhook/git', async (req, res) => {
      const { ref, commits, repository } = req.body;
      
      // Analyze commits to determine which agents to wake
      const agentsToWake = this.analyzeGitChanges(commits || []);
      
      for (const agentId of agentsToWake) {
        await this.triggerAgent(agentId, {
          type: 'code_change',
          source: 'git',
          target: agentId,
          priority: 'high',
          payload: { ref, commits, repository },
          timestamp: new Date()
        });
      }
      
      res.json({ 
        status: 'processed',
        agentsTriggered: agentsToWake
      });
    });
    
    // Health and metrics endpoint
    this.app.get('/metrics', (req, res) => {
      console.log(`📊 Metrics requested - agents map size: ${this.agents.size}`);
      console.log(`📊 Agents in map:`, Array.from(this.agents.keys()));
      const metrics = this.getSystemMetrics();
      res.json(metrics);
    });
    
    // System status
    this.app.get('/status', (req, res) => {
      const agents = Array.from(this.agents.values());
      res.json({
        orchestrator: 'running',
        agents: agents.length,
        active: agents.filter(a => a.status === 'active').length,
        dormant: agents.filter(a => a.status === 'dormant').length,
        totalTokenUsage: agents.reduce((sum, a) => sum + a.tokenUsage, 0),
        uptime: process.uptime()
      });
    });
    
    this.app.listen(this.port, () => {
      console.log(`🚀 Event-driven orchestrator started on port ${this.port}`);
      console.log(`📊 Metrics: http://localhost:${this.port}/metrics`);
      console.log(`🔗 Webhooks: http://localhost:${this.port}/webhook/trigger/{agent-id}`);
    });
  }
  
  registerAgent(agentId) {
    console.log(`🔧 Registering agent: ${agentId}`);
    console.log(`🔧 Agents map before registration:`, this.agents.size);
    console.log(`🔧 Agents map type check:`, this.agents instanceof Map);
    
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        id: agentId,
        status: 'dormant',
        lastActivity: new Date(),
        tokenUsage: 0,
        pendingTriggers: []
      });
      console.log(`✅ Agent ${agentId} registered successfully`);
    } else {
      console.log(`🔄 Agent ${agentId} already registered, updating status`);
    }
    
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'dormant';
      agent.lastActivity = new Date();
      console.log(`✅ Agent ${agentId} status updated to dormant`);
    } else {
      console.error(`❌ Failed to retrieve agent ${agentId} after registration!`);
    }
    
    console.log(`📊 Total agents registered: ${this.agents.size}`);
    console.log(`📊 Agent keys:`, Array.from(this.agents.keys()));
  }
  
  async triggerAgent(agentId, trigger) {
    console.log(`⚡ Triggering agent ${agentId} with ${trigger.type} from ${trigger.source}`);
    console.log(`🔍 Checking for agent ${agentId} in map of size: ${this.agents.size}`);
    console.log(`🔍 Available agents:`, Array.from(this.agents.keys()));
    
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`⚠️ Agent ${agentId} not registered`);
      console.warn(`🔍 Agent map contents:`, Array.from(this.agents.entries()));
      return;
    }
    
    // Find WebSocket connection
    const wsClient = this.findWebSocketClient(agentId);
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      // Send trigger immediately via WebSocket
      wsClient.send(JSON.stringify({
        type: 'trigger',
        trigger
      }));
      agent.status = 'active';
    } else {
      // Queue trigger for when agent reconnects
      agent.pendingTriggers.push(trigger);
    }
    
    // Emit local event
    this.eventBus.emit(`agent:${agentId}:trigger`, trigger);
  }
  
  analyzeGitChanges(commits) {
    const agentsToWake = new Set();
    
    for (const commit of commits) {
      const modifiedFiles = [
        ...(commit.added || []),
        ...(commit.modified || []),
        ...(commit.removed || [])
      ];
      
      for (const file of modifiedFiles) {
        // Wake agents based on file patterns
        if (file.includes('src/') || file.includes('lib/')) {
          agentsToWake.add('cursor-ide-agent');
        }
        if (file.includes('docker') || file.includes('.yml')) {
          agentsToWake.add('claude-desktop-agent');
        }
        if (file.includes('test/') || file.includes('spec/')) {
          agentsToWake.add('cursor-ide-agent');
        }
      }
      
      // Always wake project leader for significant changes
      if (modifiedFiles.length > 5 || commit.message?.includes('BREAKING')) {
        agentsToWake.add('claude-code-cli');
      }
    }
    
    return Array.from(agentsToWake);
  }
  
  findWebSocketClient(agentId) {
    if (!this.wsServer) return null;
    
    for (const client of this.wsServer.clients) {
      if (client.agentId === agentId) {
        return client;
      }
    }
    
    return null;
  }
  
  handleAgentMessage(agentId, message) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    switch (message.type) {
      case 'status':
        agent.status = message.status;
        agent.lastActivity = new Date();
        break;
        
      case 'token_usage':
        agent.tokenUsage += message.tokens;
        break;
        
      case 'task_complete':
        agent.status = 'dormant';
        console.log(`✅ Agent ${agentId} completed task`);
        break;
    }
  }
  
  handleAgentDisconnect(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'hibernating';
      console.log(`💤 Agent ${agentId} disconnected - hibernating`);
    }
  }
  
  getSystemMetrics() {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status === 'active').length;
    const totalTokenUsage = agents.reduce((sum, a) => sum + a.tokenUsage, 0);
    const pendingTriggers = agents.reduce((sum, a) => sum + a.pendingTriggers.length, 0);
    
    return {
      timestamp: new Date().toISOString(),
      agents: {
        total: this.agents.size,
        active: activeAgents,
        dormant: this.agents.size - activeAgents,
        states: agents.map(a => ({
          id: a.id,
          status: a.status,
          lastActivity: a.lastActivity,
          tokenUsage: a.tokenUsage,
          pendingTriggers: a.pendingTriggers.length
        }))
      },
      system: {
        totalTokenUsage,
        pendingTriggers,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      efficiency: {
        tokensSavedPercentage: this.calculateTokenSavings(),
        estimatedDailyCost: Math.round(totalTokenUsage * 0.00001 * 100) / 100 // $0.01 per 1K tokens
      }
    };
  }
  
  calculateTokenSavings() {
    const actualUsage = Array.from(this.agents.values()).reduce((sum, a) => sum + a.tokenUsage, 0);
    const projectedPollingUsage = this.agents.size * 2880 * 100; // 2880 checks/day * ~100 tokens per check
    return Math.round((1 - (actualUsage / (projectedPollingUsage || 1))) * 100);
  }
}

// Start the orchestrator
const orchestrator = new EventDrivenOrchestrator();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down orchestrator...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down orchestrator...');
  process.exit(0);
});

console.log('🎯 Event-driven orchestrator ready!');
console.log('💰 Expected token savings: 95%+');
console.log('⚡ Agents will only activate when needed');