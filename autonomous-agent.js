#!/usr/bin/env node

/**
 * Autonomous AI Agent - Token-Optimized Continuous Operation
 * Integrates with Neural AI Collaboration Platform MCP tools
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Token Budget Management
 */
class TokenBudget {
  constructor(dailyLimit = 100000) {
    this.dailyLimit = dailyLimit;
    this.usedToday = 0;
    this.lastReset = new Date().toDateString();
    this.estimatedCosts = {
      get_ai_messages: 50,
      create_entities: 200,
      send_ai_message: 150,
      log_entry: 10,
      status_update: 100
    };
  }
  
  resetIfNewDay() {
    const today = new Date().toDateString();
    if (today !== this.lastReset) {
      this.usedToday = 0;
      this.lastReset = today;
      console.log('🔄 Token budget reset for new day');
    }
  }
  
  canSpend(operation) {
    this.resetIfNewDay();
    const estimatedCost = this.estimatedCosts[operation] || 50;
    return (this.usedToday + estimatedCost) <= this.dailyLimit;
  }
  
  spend(operation, actualTokens = null) {
    const cost = actualTokens || this.estimatedCosts[operation] || 50;
    this.usedToday += cost;
    
    // Alert if approaching limits
    const usagePercent = (this.usedToday / this.dailyLimit) * 100;
    if (usagePercent > 80) {
      console.warn(`⚠️ Token usage at ${usagePercent.toFixed(1)}% (${this.usedToday}/${this.dailyLimit})`);
    }
    
    return cost;
  }
  
  getUsageStats() {
    return {
      used: this.usedToday,
      limit: this.dailyLimit,
      remaining: this.dailyLimit - this.usedToday,
      percentage: (this.usedToday / this.dailyLimit) * 100
    };
  }
}

/**
 * Intelligent Work Scheduler
 */
class WorkScheduler {
  constructor() {
    this.workQueue = [];
    this.priorityLevels = ['high', 'medium', 'low'];
    this.lastWorkTime = 0;
    this.minWorkInterval = 60000; // 1 minute minimum between work
  }
  
  addWork(work, priority = 'medium', description = '') {
    this.workQueue.push({ 
      work, 
      priority, 
      description,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    });
    
    // Sort by priority
    this.workQueue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
  
  async processWork() {
    if (this.workQueue.length === 0) {
      return { processed: false, reason: 'No work in queue' };
    }
    
    const now = Date.now();
    if (now - this.lastWorkTime < this.minWorkInterval) {
      return { processed: false, reason: 'Too soon since last work' };
    }
    
    const workItem = this.workQueue.shift();
    this.lastWorkTime = now;
    
    try {
      await workItem.work();
      return { processed: true, description: workItem.description };
    } catch (error) {
      console.error(`❌ Work failed: ${workItem.description}`, error);
      return { processed: false, error: error.message };
    }
  }
  
  getQueueStats() {
    return {
      total: this.workQueue.length,
      byPriority: this.workQueue.reduce((acc, item) => {
        acc[item.priority] = (acc[item.priority] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

/**
 * Adaptive Scheduler for Smart Polling
 */
class AdaptiveScheduler {
  constructor() {
    this.baseInterval = 15000; // 15 seconds
    this.currentInterval = this.baseInterval;
    this.maxInterval = 300000; // 5 minutes
    this.activityLevel = 0;
    this.messageCount = 0;
    this.lastActivityTime = Date.now();
    this.consecutiveEmptyPolls = 0;
  }
  
  updateActivityLevel(hasNewMessages) {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    if (hasNewMessages) {
      this.messageCount++;
      this.lastActivityTime = now;
      this.consecutiveEmptyPolls = 0;
      this.activityLevel = Math.min(this.activityLevel + 0.2, 1.0);
    } else {
      this.consecutiveEmptyPolls++;
      this.activityLevel = Math.max(this.activityLevel - 0.1, 0.0);
    }
    
    this.updateInterval();
  }
  
  updateInterval() {
    if (this.activityLevel > 0.7) {
      // High activity - poll more frequently
      this.currentInterval = this.baseInterval;
    } else if (this.activityLevel < 0.3) {
      // Low activity - poll less frequently
      this.currentInterval = Math.min(this.currentInterval * 1.5, this.maxInterval);
    }
    
    // If many consecutive empty polls, increase interval
    if (this.consecutiveEmptyPolls > 5) {
      this.currentInterval = Math.min(this.currentInterval * 2, this.maxInterval);
    }
  }
  
  getCurrentInterval() {
    return this.currentInterval;
  }
  
  getStats() {
    return {
      currentInterval: this.currentInterval,
      activityLevel: this.activityLevel,
      messageCount: this.messageCount,
      consecutiveEmptyPolls: this.consecutiveEmptyPolls
    };
  }
}

/**
 * Token Monitor
 */
class TokenMonitor {
  constructor() {
    this.usage = {
      mcp_calls: 0,
      messages_sent: 0,
      entities_created: 0,
      total_tokens: 0,
      operations: {}
    };
  }
  
  trackUsage(operation, estimatedTokens = 50) {
    this.usage[operation]++;
    this.usage.total_tokens += estimatedTokens;
    
    if (!this.usage.operations[operation]) {
      this.usage.operations[operation] = 0;
    }
    this.usage.operations[operation]++;
    
    return estimatedTokens;
  }
  
  getStats() {
    return {
      ...this.usage,
      topOperations: Object.entries(this.usage.operations)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }
}

class AutonomousAgent {
  constructor(agentId) {
    this.agentId = agentId;
    this.isRunning = false;
    this.messageCheckInterval = null;
    this.workProcessingInterval = null;
    this.lastMessageCheck = new Date(0);
    
    // Token optimization components
    this.tokenBudget = new TokenBudget(100000); // 100k daily limit
    this.workScheduler = new WorkScheduler();
    this.adaptiveScheduler = new AdaptiveScheduler();
    this.tokenMonitor = new TokenMonitor();
    
    // Reduced logging
    this.logLevel = 1; // WARN level by default
    this.lastStatusUpdate = 0;
    this.statusUpdateInterval = 300000; // 5 minutes
    
    this.logFile = path.join(__dirname, 'data', `${agentId}-autonomous.log`);
  }

  /**
   * Start autonomous operation
   */
  async start() {
    console.log(`🤖 Starting token-optimized autonomous agent: ${this.agentId}`);
    await this.log('Autonomous agent starting up', 'INFO');

    try {
      // Ensure data directory exists
      await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });

      // Start adaptive message polling
      this.startAdaptiveMessagePolling();

      // Start intelligent work processing
      this.startIntelligentWorkProcessing();

      // Announce availability (only if we have token budget)
      if (this.tokenBudget.canSpend('send_ai_message')) {
        await this.announceAvailability();
      }

      this.isRunning = true;
      console.log(`✅ Token-optimized autonomous agent ${this.agentId} is now operational`);

    } catch (error) {
      console.error(`❌ Failed to start autonomous agent:`, error);
      process.exit(1);
    }
  }

  /**
   * Start adaptive message polling
   */
  startAdaptiveMessagePolling() {
    const poll = async () => {
      if (!this.tokenBudget.canSpend('get_ai_messages')) {
        console.log('⚠️ Skipping message check - token budget exceeded');
        return;
      }
      
      await this.checkMessages();
      
      // Schedule next poll with adaptive interval
      const nextInterval = this.adaptiveScheduler.getCurrentInterval();
      setTimeout(poll, nextInterval);
    };
    
    // Start first poll
    poll();
    console.log(`📡 Adaptive message polling started - initial interval: ${this.adaptiveScheduler.getCurrentInterval()/1000}s`);
  }

  /**
   * Start intelligent work processing
   */
  startIntelligentWorkProcessing() {
    this.workProcessingInterval = setInterval(async () => {
      if (!this.tokenBudget.canSpend('create_entities')) {
        console.log('⚠️ Skipping work processing - token budget exceeded');
        return;
      }
      
      await this.processWork();
    }, 60000); // Check every minute instead of 30 seconds

    console.log(`⚙️ Intelligent work processing started - interval: 60s`);
  }

  /**
   * Check for new messages using MCP tools
   */
  async checkMessages() {
    try {
      const hasNewMessages = await this.log('Checking for messages...', 'DEBUG');
      
      // Use Claude Code MCP tools to check messages
      const result = await this.runMCPCommand('get_ai_messages', {
        agentId: this.agentId
      });

      const hasMessages = result && result.messages && result.messages.length > 0;
      
      // Update adaptive scheduler
      this.adaptiveScheduler.updateActivityLevel(hasMessages);

      if (hasMessages) {
        console.log(`📥 Found ${result.messages.length} messages for ${this.agentId}`);
        await this.log(`Found ${result.messages.length} new messages`, 'INFO');

        for (const message of result.messages) {
          await this.processMessage(message);
        }

        this.lastMessageCheck = new Date();
      } else {
        await this.log('No new messages', 'DEBUG');
      }
      
    } catch (error) {
      console.error(`❌ Failed to check messages:`, error);
      await this.log(`Failed to check messages: ${error.message}`, 'ERROR');
    }
  }

  /**
   * Process intelligent work
   */
  async processWork() {
    try {
      const workResult = await this.workScheduler.processWork();
      
      if (workResult.processed) {
        await this.log(`Processed work: ${workResult.description}`, 'INFO');
      } else {
        // Add some default work if queue is empty
        this.addDefaultWork();
      }
      
    } catch (error) {
      console.error(`❌ Failed to process work:`, error);
      await this.log(`Failed to process work: ${error.message}`, 'ERROR');
    }
  }

  /**
   * Add default role-specific work to queue
   */
  addDefaultWork() {
    switch (this.agentId) {
      case 'claude-code-cli':
        this.workScheduler.addWork(
          () => this.performProjectLeaderWork(),
          'medium',
          'Project leadership tasks'
        );
        break;
      case 'claude-desktop-agent':
        this.workScheduler.addWork(
          () => this.performInfrastructureWork(),
          'medium',
          'Infrastructure health checks'
        );
        break;
      case 'cursor-ide-agent':
        this.workScheduler.addWork(
          () => this.performDevelopmentWork(),
          'medium',
          'Development system checks'
        );
        break;
    }
  }

  /**
   * Log activity to file with level filtering
   */
  async log(message, level = 'INFO') {
    const LOG_LEVELS = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    if (messageLevel > this.logLevel) {
      return; // Skip logging if level is too verbose
    }
    
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${this.agentId} [${level}]: ${message}\n`;
    
    try {
      await fs.appendFile(this.logFile, logEntry);
      
      // Track token usage for logging
      this.tokenMonitor.trackUsage('log_entry', 10);
    } catch (error) {
      console.error(`❌ Failed to write to log file:`, error);
    }
  }

  /**
   * Stop autonomous operation
   */
  async stop() {
    console.log(`🛑 Stopping token-optimized autonomous agent: ${this.agentId}`);
    
    this.isRunning = false;

    if (this.messageCheckInterval) {
      clearInterval(this.messageCheckInterval);
    }

    if (this.workProcessingInterval) {
      clearInterval(this.workProcessingInterval);
    }

    // Log final stats
    const tokenStats = this.tokenBudget.getUsageStats();
    const workStats = this.workScheduler.getQueueStats();
    const adaptiveStats = this.adaptiveScheduler.getStats();
    const monitorStats = this.tokenMonitor.getStats();
    
    console.log(`📊 Final Token Stats: ${tokenStats.used}/${tokenStats.limit} (${tokenStats.percentage.toFixed(1)}%)`);
    console.log(`📊 Work Queue: ${workStats.total} items remaining`);
    console.log(`📊 Adaptive Stats: ${adaptiveStats.messageCount} messages, ${adaptiveStats.consecutiveEmptyPolls} empty polls`);

    // Announce going offline (only if we have token budget)
    if (this.tokenBudget.canSpend('send_ai_message')) {
      const otherAgents = this.getOtherAgents();
      for (const agentId of otherAgents) {
        await this.sendMessage(agentId, {
          type: 'autonomous_offline',
          content: `🔌 Agent ${this.agentId} going offline`
        });
      }
    }

    await this.log(`Autonomous agent ${this.agentId} stopped`, 'INFO');
    console.log(`✅ Token-optimized autonomous agent ${this.agentId} stopped`);
  }

  /**
   * Send message with token budget check
   */
  async sendMessage(targetAgent, messageData) {
    if (!this.tokenBudget.canSpend('send_ai_message')) {
      console.log(`⚠️ Skipping message to ${targetAgent} - token budget exceeded`);
      return;
    }
    
    try {
      console.log(`📤 Sending message to ${targetAgent}: ${messageData.type}`);
      
      await this.runMCPCommand('send_ai_message', {
        agentId: targetAgent,
        content: messageData.content,
        messageType: messageData.type
      });

      // Track token usage
      this.tokenBudget.spend('send_ai_message');
      this.tokenMonitor.trackUsage('messages_sent', 150);

      await this.log(`Sent message to ${targetAgent}: ${messageData.type}`, 'INFO');

    } catch (error) {
      console.error(`❌ Failed to send message to ${targetAgent}:`, error);
      await this.log(`Failed to send message to ${targetAgent}: ${error.message}`, 'ERROR');
    }
  }

  /**
   * Store information in shared memory with token budget check
   */
  async storeInMemory(name, entityType, observations) {
    if (!this.tokenBudget.canSpend('create_entities')) {
      console.log(`⚠️ Skipping memory storage - token budget exceeded`);
      return;
    }
    
    try {
      await this.runMCPCommand('create_entities', {
        entities: [{
          name: name,
          entityType: entityType,
          observations: observations
        }]
      });

      // Track token usage
      this.tokenBudget.spend('create_entities');
      this.tokenMonitor.trackUsage('entities_created', 200);

      await this.log(`Stored in memory: ${name}`, 'DEBUG');

    } catch (error) {
      console.error(`❌ Failed to store in memory:`, error);
      await this.log(`Failed to store in memory: ${error.message}`, 'ERROR');
    }
  }

  /**
   * Run MCP command with token tracking
   */
  async runMCPCommand(command, params) {
    // Track MCP call usage
    this.tokenMonitor.trackUsage('mcp_calls', 50);
    
    console.log(`🔧 Running MCP command: ${command}`);
    await this.log(`MCP command: ${command} with params: ${JSON.stringify(params)}`, 'DEBUG');
    
    // Return simulated success
    return { success: true, command, params };
  }

  /**
   * Update agent status with reduced frequency
   */
  async updateStatus() {
    const now = Date.now();
    if (now - this.lastStatusUpdate < this.statusUpdateInterval) {
      return; // Skip update if too soon
    }
    
    if (!this.tokenBudget.canSpend('status_update')) {
      console.log('⚠️ Skipping status update - token budget exceeded');
      return;
    }
    
    const status = {
      agent: this.agentId,
      timestamp: new Date().toISOString(),
      mode: 'token-optimized-autonomous',
      uptime: process.uptime(),
      lastMessageCheck: this.lastMessageCheck.toISOString(),
      isActive: this.isRunning,
      tokenUsage: this.tokenBudget.getUsageStats(),
      workQueue: this.workScheduler.getQueueStats(),
      adaptiveStats: this.adaptiveScheduler.getStats()
    };

    await this.storeInMemory(`${this.agentId} Token-Optimized Status`, 'agent_status', [
      `Agent: ${this.agentId}`,
      `Mode: Token-optimized autonomous operation`,
      `Uptime: ${Math.floor(status.uptime)} seconds`,
      `Token Usage: ${status.tokenUsage.percentage.toFixed(1)}%`,
      `Work Queue: ${status.workQueue.total} items`,
      `Adaptive Interval: ${status.adaptiveStats.currentInterval/1000}s`,
      `Status: ${status.isActive ? 'Active' : 'Inactive'}`
    ]);
    
    this.lastStatusUpdate = now;
  }

  /**
   * Announce availability with token budget check
   */
  async announceAvailability() {
    const otherAgents = this.getOtherAgents();
    
    for (const agentId of otherAgents) {
      if (!this.tokenBudget.canSpend('send_ai_message')) {
        console.log(`⚠️ Skipping availability announcement to ${agentId} - token budget exceeded`);
        continue;
      }
      
      await this.sendMessage(agentId, {
        type: 'autonomous_online',
        content: `🤖 Agent ${this.agentId} is now operating with token optimization. Available for collaboration 24/7.`
      });
    }

    console.log(`📢 Announced availability to ${otherAgents.length} agents`);
  }

  /**
   * Get other agent IDs
   */
  getOtherAgents() {
    const allAgents = ['claude-code-cli', 'claude-desktop-agent', 'cursor-ide-agent'];
    return allAgents.filter(id => id !== this.agentId);
  }

  /**
   * Process message with token budget consideration
   */
  async processMessage(message) {
    if (!this.tokenBudget.canSpend('create_entities')) {
      console.log('⚠️ Skipping message processing - token budget exceeded');
      return;
    }
    
    try {
      const { fromAgent, content, messageType } = message;
      
      await this.log(`Processing message from ${fromAgent}: ${messageType}`, 'DEBUG');

      switch (messageType) {
        case 'autonomous_online':
          await this.handleCollaborationMessage(content, fromAgent);
          break;
        case 'task':
          await this.handleTaskMessage(content, fromAgent);
          break;
        case 'collaboration':
          await this.handleCollaborationMessage(content, fromAgent);
          break;
        case 'autonomous_offline':
          await this.log(`Agent ${fromAgent} went offline`, 'INFO');
          break;
        default:
          await this.handleGenericMessage(content, fromAgent);
      }

      // Auto-acknowledge message
      await this.sendAutoAcknowledgment(fromAgent, messageType);

    } catch (error) {
      console.error(`❌ Failed to process message:`, error);
      await this.log(`Failed to process message: ${error.message}`, 'ERROR');
    }
  }

  /**
   * Handle collaboration messages
   */
  async handleCollaborationMessage(content, fromAgent) {
    await this.log(`Collaboration from ${fromAgent}: ${content}`, 'INFO');
    
    // Add collaboration work to queue
    this.workScheduler.addWork(
      async () => {
        await this.log(`Processing collaboration with ${fromAgent}`, 'INFO');
        // Process collaboration logic here
      },
      'high',
      `Collaboration with ${fromAgent}`
    );
  }

  /**
   * Handle task messages
   */
  async handleTaskMessage(content, fromAgent) {
    await this.log(`Task from ${fromAgent}: ${content}`, 'INFO');
    
    // Add task work to queue
    this.workScheduler.addWork(
      async () => {
        await this.log(`Processing task from ${fromAgent}`, 'INFO');
        await this.processTask(content, fromAgent);
      },
      'high',
      `Task from ${fromAgent}`
    );
  }

  /**
   * Perform role-specific work with token optimization
   */
  async performRoleSpecificWork() {
    switch (this.agentId) {
      case 'claude-code-cli':
        await this.performProjectLeaderWork();
        break;
      case 'claude-desktop-agent':
        await this.performInfrastructureWork();
        break;
      case 'cursor-ide-agent':
        await this.performDevelopmentWork();
        break;
    }
  }

  /**
   * Perform project leader work
   */
  async performProjectLeaderWork() {
    if (!this.tokenBudget.canSpend('create_entities')) {
      return;
    }
    
    await this.log('Performing project leadership tasks', 'INFO');
    
    // Add project leadership work to queue
    this.workScheduler.addWork(
      async () => {
        await this.log('Processing project leadership tasks', 'INFO');
        await this.checkTeamCoordination();
      },
      'medium',
      'Project leadership coordination'
    );
  }

  /**
   * Perform infrastructure work
   */
  async performInfrastructureWork() {
    if (!this.tokenBudget.canSpend('create_entities')) {
      return;
    }
    
    await this.log('Performing infrastructure health checks', 'INFO');
    
    // Add infrastructure work to queue
    this.workScheduler.addWork(
      async () => {
        await this.log('Processing infrastructure health checks', 'INFO');
        await this.performInfrastructureChecks();
      },
      'medium',
      'Infrastructure health checks'
    );
  }

  /**
   * Perform development work
   */
  async performDevelopmentWork() {
    if (!this.tokenBudget.canSpend('create_entities')) {
      return;
    }
    
    await this.log('Performing development system checks', 'INFO');
    
    // Add development work to queue
    this.workScheduler.addWork(
      async () => {
        await this.log('Processing development system checks', 'INFO');
        await this.performDevelopmentChecks();
      },
      'medium',
      'Development system checks'
    );
  }

  /**
   * Send auto acknowledgment with token budget check
   */
  async sendAutoAcknowledgment(fromAgent, messageType) {
    if (!this.tokenBudget.canSpend('send_ai_message')) {
      return;
    }
    
    await this.sendMessage(fromAgent, {
      type: 'acknowledgment',
      content: `✅ Message received and processed: ${messageType}`
    });
  }

  /**
   * Handle status request
   */
  async handleStatusRequest(fromAgent) {
    if (!this.tokenBudget.canSpend('send_ai_message')) {
      return;
    }
    
    const status = {
      agent: this.agentId,
      isActive: this.isRunning,
      tokenUsage: this.tokenBudget.getUsageStats(),
      workQueue: this.workScheduler.getQueueStats(),
      adaptiveStats: this.adaptiveScheduler.getStats()
    };
    
    await this.sendMessage(fromAgent, {
      type: 'status_response',
      content: JSON.stringify(status)
    });
  }

  /**
   * Handle testing coordination
   */
  async handleTestingCoordination(content, fromAgent) {
    await this.log(`Testing coordination from ${fromAgent}: ${content}`, 'INFO');
  }

  /**
   * Handle generic message
   */
  async handleGenericMessage(content, fromAgent) {
    await this.log(`Generic message from ${fromAgent}: ${content}`, 'INFO');
  }

  /**
   * Process task
   */
  async processTask(content, fromAgent) {
    await this.log(`Processing task from ${fromAgent}: ${content}`, 'INFO');
  }

  /**
   * Check team coordination
   */
  async checkTeamCoordination() {
    await this.log('Checking team coordination needs', 'DEBUG');
  }

  /**
   * Perform infrastructure checks
   */
  async performInfrastructureChecks() {
    await this.log('Performing infrastructure health checks', 'DEBUG');
  }

  /**
   * Perform development checks
   */
  async performDevelopmentChecks() {
    await this.log('Performing development system checks', 'DEBUG');
  }

  /**
   * Perform generic work
   */
  async performGenericWork() {
    await this.log('Performing generic work tasks', 'DEBUG');
  }

  /**
   * Check coordination needs
   */
  async checkCoordinationNeeds() {
    await this.log('Checking if coordination with other agents is needed', 'DEBUG');
  }
}

// Main execution
async function main() {
  const agentId = process.argv[2];
  
  if (!agentId) {
    console.error('❌ Please provide agent ID as argument');
    console.log('Usage: node autonomous-agent.js <agent-id>');
    console.log('Example: node autonomous-agent.js claude-desktop-agent');
    process.exit(1);
  }

  const agent = new AutonomousAgent(agentId);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received shutdown signal');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received termination signal');
    await agent.stop();
    process.exit(0);
  });

  // Start autonomous operation
  await agent.start();

  // Keep the process running
  console.log('🎯 Autonomous agent running... Press Ctrl+C to stop');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { AutonomousAgent };