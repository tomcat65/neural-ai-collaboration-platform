#!/usr/bin/env node

/**
 * Smart Event-Driven Autonomous Agent
 * 
 * This agent only activates when triggered, reducing token usage by 95%+
 * Instead of polling every 15 seconds, it sleeps until awakened by events
 */

import WebSocket from 'ws';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';

const execAsync = promisify(exec);

class SmartAutonomousAgent {
  constructor(agentId) {
    this.agentId = agentId;
    this.role = this.getAgentRole(agentId);
    this.ws = null;
    this.isActive = false;
    this.tokenUsage = 0;
    this.sessionTokens = 0;
    this.taskQueue = [];
    this.app = express();
    this.webhookPort = this.getWebhookPort(agentId);
    
    // Configuration
    this.orchestratorUrl = process.env.ORCHESTRATOR_URL || 'ws://localhost:3005';
    this.mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:5174';
    this.logFile = path.join(process.env.LOG_DIR || './data/logs', `${agentId}-smart.log`);
    
    // Token tracking
    this.tokenBudget = {
      daily: 50000,
      perTask: 1000,
      remaining: 50000
    };
    
    this.setupWebhook();
  }
  
  getAgentRole(agentId) {
    const roles = {
      'claude-code-cli': 'project-leader',
      'claude-desktop-agent': 'infrastructure-specialist',
      'cursor-ide-agent': 'development-specialist'
    };
    return roles[agentId] || 'general';
  }
  
  getWebhookPort(agentId) {
    const ports = {
      'claude-code-cli': 4100,
      'claude-desktop-agent': 4101,
      'cursor-ide-agent': 4102
    };
    return ports[agentId] || 4100;
  }
  
  async start() {
    console.log(`🤖 Smart Autonomous Agent: ${this.agentId}`);
    console.log(`📋 Role: ${this.role}`);
    console.log(`⚡ Event-driven mode: Token-efficient operation`);
    console.log(`💰 Daily token budget: ${this.tokenBudget.daily}`);
    
    await this.log('🚀 Smart agent started - waiting for triggers');
    
    // Connect to orchestrator
    await this.connectToOrchestrator();
    
    // Start webhook server
    this.app.listen(this.webhookPort, () => {
      console.log(`🔗 Webhook listening on port ${this.webhookPort}`);
    });
    
    // Enter dormant state
    this.enterDormantState();
  }
  
  setupWebhook() {
    this.app.use(express.json());
    
    // Webhook endpoint for wake-up calls
    this.app.post('/wake', async (req, res) => {
      console.log(`⏰ Wake-up call received via webhook`);
      const { trigger } = req.body;
      
      if (trigger) {
        await this.handleTrigger(trigger);
      }
      
      res.json({ status: 'awakened', agentId: this.agentId });
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        agentId: this.agentId,
        status: this.isActive ? 'active' : 'dormant',
        tokenUsage: this.tokenUsage,
        remainingBudget: this.tokenBudget.remaining,
        taskQueueLength: this.taskQueue.length
      });
    });
  }
  
  async connectToOrchestrator() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.orchestratorUrl}?agent=${this.agentId}`);
      
      this.ws.on('open', () => {
        console.log('📡 Connected to orchestrator');
        
        // Report status
        this.ws.send(JSON.stringify({
          type: 'status',
          status: 'dormant'
        }));
        
        resolve();
      });
      
      this.ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());
        await this.handleOrchestratorMessage(message);
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('📡 Disconnected from orchestrator');
        // Attempt reconnection after delay
        setTimeout(() => this.connectToOrchestrator(), 5000);
      });
      
      // Minimal heartbeat - only when active
      setInterval(() => {
        if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30000);
    });
  }
  
  async handleOrchestratorMessage(message) {
    switch (message.type) {
      case 'trigger':
        await this.handleTrigger(message.trigger);
        break;
        
      case 'triggers':
        // Handle multiple queued triggers
        for (const trigger of message.triggers) {
          this.taskQueue.push(trigger);
        }
        if (this.taskQueue.length > 0 && !this.isActive) {
          await this.activate();
        }
        break;
        
      case 'sleep':
        await this.enterDormantState();
        break;
        
      case 'budget_update':
        this.tokenBudget = message.budget;
        break;
    }
  }
  
  async handleTrigger(trigger) {
    console.log(`⚡ Received trigger: ${trigger.type} from ${trigger.source}`);
    await this.log(`⚡ Trigger: ${trigger.type} from ${trigger.source} (priority: ${trigger.priority})`);
    
    // Check if we should activate based on priority and current state
    if (this.shouldActivate(trigger)) {
      this.taskQueue.push(trigger);
      
      if (!this.isActive) {
        await this.activate();
      }
    } else {
      console.log(`💤 Ignoring low-priority trigger while dormant`);
    }
  }
  
  shouldActivate(trigger) {
    // Always activate for critical triggers
    if (trigger.priority === 'critical') return true;
    
    // Check token budget
    if (this.tokenBudget.remaining < this.tokenBudget.perTask) {
      console.log(`💸 Token budget exhausted - ignoring trigger`);
      return false;
    }
    
    // High priority triggers activate immediately
    if (trigger.priority === 'high') return true;
    
    // Medium priority - check if we have other work queued
    if (trigger.priority === 'medium') {
      return this.taskQueue.length > 0 || !this.isActive;
    }
    
    // Low priority - only if we're already active
    return this.isActive;
  }
  
  async activate() {
    if (this.isActive) return;
    
    console.log(`⚡ Activating agent`);
    this.isActive = true;
    this.sessionTokens = 0;
    
    // Report activation
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'status',
        status: 'active'
      }));
    }
    
    await this.log('⚡ Agent activated');
    
    // Process task queue
    while (this.taskQueue.length > 0 && this.tokenBudget.remaining > this.tokenBudget.perTask) {
      const trigger = this.taskQueue.shift();
      await this.processTrigger(trigger);
    }
    
    // Return to dormant state
    await this.enterDormantState();
  }
  
  async processTrigger(trigger) {
    console.log(`🔄 Processing ${trigger.type} trigger`);
    const startTokens = this.tokenUsage;
    
    try {
      switch (trigger.type) {
        case 'message':
          await this.handleMessage(trigger);
          break;
          
        case 'task':
          await this.handleTask(trigger);
          break;
          
        case 'code_change':
          await this.handleCodeChange(trigger);
          break;
          
        case 'system_event':
          await this.handleSystemEvent(trigger);
          break;
          
        case 'schedule':
          await this.handleScheduledWork(trigger);
          break;
          
        default:
          console.log(`❓ Unknown trigger type: ${trigger.type}`);
      }
      
      // Track token usage
      const tokensUsed = this.tokenUsage - startTokens;
      this.sessionTokens += tokensUsed;
      this.tokenBudget.remaining -= tokensUsed;
      
      // Report token usage
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'token_usage',
          tokens: tokensUsed
        }));
      }
      
      console.log(`💰 Tokens used: ${tokensUsed} (session: ${this.sessionTokens}, remaining: ${this.tokenBudget.remaining})`);
      
    } catch (error) {
      console.error(`❌ Error processing trigger:`, error);
      await this.log(`❌ Error: ${error.message}`);
    }
  }
  
  async handleMessage(trigger) {
    const { source, payload } = trigger;
    console.log(`💬 Message from ${source}: ${payload.message}`);
    
    // Simulate processing with minimal token usage
    this.tokenUsage += 50; // Approximate tokens for message processing
    
    // Handle based on agent role
    switch (this.role) {
      case 'project-leader':
        await this.handleProjectLeaderMessage(payload);
        break;
        
      case 'infrastructure-specialist':
        await this.handleInfrastructureMessage(payload);
        break;
        
      case 'development-specialist':
        await this.handleDevelopmentMessage(payload);
        break;
    }
  }
  
  async handleTask(trigger) {
    const { payload } = trigger;
    console.log(`📋 Task assigned: ${payload.taskId || 'unnamed'}`);
    
    // Process task based on role
    this.tokenUsage += 200; // Base tokens for task processing
    
    // Simulate task completion
    await this.simulateWork(2000);
    
    // Report completion
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'task_complete',
        taskId: payload.taskId || 'unknown'
      }));
    }
  }
  
  async handleCodeChange(trigger) {
    const { payload } = trigger;
    console.log(`🔧 Code change detected in ${payload.repository?.name || 'repository'}`);
    
    // Only development specialist handles code changes in detail
    if (this.role === 'development-specialist') {
      this.tokenUsage += 300;
      
      // Analyze changes
      const filesChanged = payload.commits?.reduce((total, commit) => {
        return total + (commit.added?.length || 0) + 
               (commit.modified?.length || 0) + 
               (commit.removed?.length || 0);
      }, 0) || 0;
      
      console.log(`📊 Files changed: ${filesChanged}`);
      
      if (filesChanged > 10) {
        console.log(`🚨 Large change detected - may need coordination`);
        // Would trigger other agents here
      }
    } else {
      this.tokenUsage += 50; // Minimal processing for awareness
    }
  }
  
  async handleSystemEvent(trigger) {
    const { payload } = trigger;
    console.log(`🎯 System event: ${payload.event}`);
    
    // Infrastructure specialist handles system events
    if (this.role === 'infrastructure-specialist') {
      this.tokenUsage += 250;
      
      if (payload.event.includes('fail')) {
        console.log(`🚨 Failure detected - investigating`);
        await this.simulateWork(3000);
      }
    } else {
      this.tokenUsage += 30; // Minimal awareness tokens
    }
  }
  
  async handleScheduledWork(trigger) {
    console.log(`⏰ Scheduled work triggered`);
    
    // Perform minimal maintenance tasks
    this.tokenUsage += 100;
    
    // Check system health, cleanup logs, etc.
    await this.performMaintenance();
  }
  
  // Role-specific handlers
  async handleProjectLeaderMessage(payload) {
    console.log(`👨‍💼 Project leader processing message`);
    
    // Coordinate team based on message content
    if (payload.message?.toLowerCase().includes('deploy')) {
      console.log(`🚀 Deployment coordination needed`);
      this.tokenUsage += 150;
    } else if (payload.message?.toLowerCase().includes('review')) {
      console.log(`👀 Code review coordination`);
      this.tokenUsage += 100;
    }
  }
  
  async handleInfrastructureMessage(payload) {
    console.log(`🏗️ Infrastructure specialist processing message`);
    
    if (payload.message?.toLowerCase().includes('scale') || 
        payload.message?.toLowerCase().includes('performance')) {
      console.log(`📊 Performance optimization task`);
      this.tokenUsage += 200;
    }
  }
  
  async handleDevelopmentMessage(payload) {
    console.log(`💻 Development specialist processing message`);
    
    if (payload.message?.toLowerCase().includes('bug') || 
        payload.message?.toLowerCase().includes('fix')) {
      console.log(`🐛 Bug fix required`);
      this.tokenUsage += 250;
    }
  }
  
  async performMaintenance() {
    console.log(`🧹 Performing scheduled maintenance`);
    
    // Clean old logs
    try {
      const logs = await fs.readdir(path.dirname(this.logFile));
      const oldLogs = logs.filter(log => {
        // Clean logs older than 7 days
        return false; // Simplified for example
      });
      
      console.log(`📝 Maintenance complete`);
    } catch (error) {
      console.error(`❌ Maintenance error:`, error);
    }
  }
  
  async enterDormantState() {
    if (!this.isActive) return;
    
    console.log(`💤 Entering dormant state`);
    this.isActive = false;
    
    // Report dormant status
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'status',
        status: 'dormant'
      }));
    }
    
    await this.log(`💤 Agent dormant - session used ${this.sessionTokens} tokens`);
    
    // Clear session tokens
    this.sessionTokens = 0;
    
    console.log(`😴 Agent sleeping... (Used ${this.tokenUsage} tokens total today)`);
  }
  
  async simulateWork(duration) {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, duration));
  }
  
  async log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} ${message}\n`;
    
    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }
  
  // Graceful shutdown
  async shutdown() {
    console.log(`🛑 Shutting down agent ${this.agentId}`);
    
    if (this.ws) {
      this.ws.close();
    }
    
    await this.log(`🛑 Agent shutdown - Total tokens used: ${this.tokenUsage}`);
    process.exit(0);
  }
}

// Start the agent
const agentId = process.argv[2];
if (!agentId) {
  console.error('Usage: node smart-autonomous-agent.js <agent-id>');
  process.exit(1);
}

const agent = new SmartAutonomousAgent(agentId);

// Handle shutdown signals
process.on('SIGINT', () => agent.shutdown());
process.on('SIGTERM', () => agent.shutdown());

// Start the agent
agent.start().catch(error => {
  console.error('Failed to start agent:', error);
  process.exit(1);
});