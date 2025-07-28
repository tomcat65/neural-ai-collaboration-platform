/**
 * Memory Bridge for Claude Code Integration
 * Synchronizes Claude Code context with the Neural AI Collaboration Platform
 */

import { EventEmitter } from 'events';
import { MemoryManager } from '../unified-server/memory/index.js';

interface ClaudeCodeContext {
  workingDirectory: string;
  projectFiles: string[];
  gitStatus: {
    branch: string;
    modifiedFiles: string[];
    unstagedFiles: string[];
    commits: Array<{
      hash: string;
      message: string;
      timestamp: string;
    }>;
  };
  currentTask?: {
    description: string;
    progress: number;
    blockers: string[];
  };
  recentActions: Array<{
    action: string;
    timestamp: string;
    details: any;
  }>;
}

interface MemoryBridgeConfig {
  syncInterval: number; // milliseconds
  retentionPeriod: number; // milliseconds
  maxContextSize: number; // bytes
  enableRealTimeSync: boolean;
}

export class MemoryBridge extends EventEmitter {
  private memoryManager: MemoryManager;
  private config: MemoryBridgeConfig;
  private claudeCodeContext: ClaudeCodeContext | null = null;
  private syncTimer?: NodeJS.Timeout;
  private contextHistory: Map<string, ClaudeCodeContext> = new Map();
  private agentId: string = 'claude-code-memory-bridge';

  constructor(memoryManager: MemoryManager, config: Partial<MemoryBridgeConfig> = {}) {
    super();
    
    this.memoryManager = memoryManager;
    this.config = {
      syncInterval: 30000, // 30 seconds
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      maxContextSize: 1024 * 1024, // 1MB
      enableRealTimeSync: true,
      ...config
    };

    this.startPeriodicSync();
  }

  /**
   * Update Claude Code context and sync to memory
   */
  async updateContext(context: Partial<ClaudeCodeContext>): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Merge with existing context
    this.claudeCodeContext = {
      ...this.claudeCodeContext,
      ...context
    } as ClaudeCodeContext;

    // Store in context history
    this.contextHistory.set(timestamp, { ...this.claudeCodeContext });

    // Clean old history
    this.cleanupHistory();

    // Sync to memory system
    if (this.config.enableRealTimeSync) {
      await this.syncToMemory();
    }

    this.emit('contextUpdated', this.claudeCodeContext);
    console.log('🔄 Claude Code context updated');
  }

  /**
   * Record a development action
   */
  async recordAction(action: {
    action: string;
    details: any;
    impact?: 'low' | 'medium' | 'high';
    category?: 'code' | 'git' | 'build' | 'test' | 'deploy';
  }): Promise<void> {
    const actionRecord = {
      ...action,
      timestamp: new Date().toISOString(),
      agentId: this.agentId
    };

    // Add to context
    if (this.claudeCodeContext) {
      this.claudeCodeContext.recentActions = this.claudeCodeContext.recentActions || [];
      this.claudeCodeContext.recentActions.unshift(actionRecord);
      
      // Keep only recent actions (last 50)
      this.claudeCodeContext.recentActions = this.claudeCodeContext.recentActions.slice(0, 50);
    }

    // Store in memory system
    await this.memoryManager.store(this.agentId, {
      type: 'development-action',
      action: action.action,
      details: action.details,
      impact: action.impact || 'medium',
      category: action.category || 'code',
      timestamp: actionRecord.timestamp,
      context: this.claudeCodeContext
    }, 'shared', 'dev_action');

    this.emit('actionRecorded', actionRecord);
    console.log(`📝 Action recorded: ${action.action}`);
  }

  /**
   * Store project milestone
   */
  async recordMilestone(milestone: {
    title: string;
    description: string;
    achievement: string;
    metrics?: Record<string, any>;
    nextSteps?: string[];
  }): Promise<void> {
    const milestoneRecord = {
      ...milestone,
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      context: this.claudeCodeContext
    };

    await this.memoryManager.store(this.agentId, {
      type: 'project-milestone',
      ...milestoneRecord
    }, 'shared', 'milestone');

    this.emit('milestoneRecorded', milestoneRecord);
    console.log(`🏆 Milestone recorded: ${milestone.title}`);
  }

  /**
   * Share insights with other AI agents
   */
  async shareInsight(insight: {
    title: string;
    description: string;
    category: 'technical' | 'process' | 'architecture' | 'performance' | 'security';
    confidence: number; // 0-1
    applicability: 'project-specific' | 'general' | 'team-wide';
    evidence?: string[];
    recommendations?: string[];
  }): Promise<void> {
    const insightRecord = {
      ...insight,
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      source: 'claude-code-collaboration',
      context: this.claudeCodeContext
    };

    await this.memoryManager.store(this.agentId, {
      type: 'ai-insight',
      ...insightRecord
    }, 'shared', 'insight');

    this.emit('insightShared', insightRecord);
    console.log(`💡 Insight shared: ${insight.title} (confidence: ${insight.confidence})`);
  }

  /**
   * Query project memory for relevant context
   */
  async queryProjectMemory(query: string, options: {
    timeRange?: { start: Date; end: Date };
    categories?: string[];
    agentId?: string;
    limit?: number;
  } = {}): Promise<Array<{
    id: string;
    content: any;
    relevance: number;
    timestamp: string;
    source: string;
  }>> {
    const searchOptions = {
      shared: true,
      private: false,
      limit: options.limit || 20
    };

    const results = await this.memoryManager.search(query, searchOptions);
    
    // Filter by time range if specified
    let filteredResults = results;
    if (options.timeRange) {
      filteredResults = results.filter(result => {
        const resultTime = new Date(result.timestamp || (result as any).createdAt || Date.now());
        return resultTime >= options.timeRange!.start && resultTime <= options.timeRange!.end;
      });
    }

    // Filter by categories if specified
    if (options.categories && options.categories.length > 0) {
      filteredResults = filteredResults.filter(result => 
        options.categories!.some(category => 
          result.type?.includes(category) || 
          result.content?.category === category ||
          result.content?.type === category
        )
      );
    }

    // Calculate relevance scores (simplified)
    const scoredResults = filteredResults.map(result => {
      const timestamp = result.timestamp || (result as any).createdAt || new Date().toISOString();
      return {
        id: result.id,
        content: result.content,
        relevance: this.calculateRelevance(query, result),
        timestamp: typeof timestamp === 'string' ? timestamp : timestamp.toISOString(),
        source: result.source || 'unknown'
      };
    });

    // Sort by relevance
    scoredResults.sort((a, b) => b.relevance - a.relevance);

    return scoredResults;
  }

  /**
   * Get current context summary
   */
  getContextSummary(): {
    hasContext: boolean;
    workingDirectory?: string;
    branch?: string;
    fileCount?: number;
    recentActions?: number;
    lastUpdate?: string;
  } {
    if (!this.claudeCodeContext) {
      return { hasContext: false };
    }

    return {
      hasContext: true,
      workingDirectory: this.claudeCodeContext.workingDirectory,
      branch: this.claudeCodeContext.gitStatus?.branch,
      fileCount: this.claudeCodeContext.projectFiles?.length || 0,
      recentActions: this.claudeCodeContext.recentActions?.length || 0,
      lastUpdate: this.claudeCodeContext.recentActions?.[0]?.timestamp
    };
  }

  /**
   * Export context for other agents
   */
  async exportContextForAgent(agentId: string, includeHistory: boolean = false): Promise<{
    currentContext: ClaudeCodeContext | null;
    history?: Array<{ timestamp: string; context: ClaudeCodeContext }>;
    summary: any;
  }> {
    const exportData = {
      currentContext: this.claudeCodeContext,
      summary: this.getContextSummary()
    } as any;

    if (includeHistory) {
      exportData.history = Array.from(this.contextHistory.entries())
        .map(([timestamp, context]) => ({ timestamp, context }))
        .slice(0, 100); // Last 100 history entries
    }

    // Store export event
    await this.memoryManager.store(this.agentId, {
      type: 'context-export',
      targetAgent: agentId,
      exportData,
      timestamp: new Date().toISOString()
    }, 'shared', 'context_share');

    return exportData;
  }

  private async syncToMemory(): Promise<void> {
    if (!this.claudeCodeContext) return;

    try {
      const contextData = {
        type: 'claude-code-context',
        context: this.claudeCodeContext,
        timestamp: new Date().toISOString(),
        size: JSON.stringify(this.claudeCodeContext).length
      };

      // Check size limits
      if (contextData.size > this.config.maxContextSize) {
        console.warn(`⚠️ Context size (${contextData.size}) exceeds limit (${this.config.maxContextSize})`);
        // Truncate recent actions if needed
        if (this.claudeCodeContext.recentActions) {
          this.claudeCodeContext.recentActions = this.claudeCodeContext.recentActions.slice(0, 20);
        }
      }

      await this.memoryManager.store(this.agentId, contextData, 'shared', 'claude_context');
      
      console.log('✅ Context synced to memory');
    } catch (error) {
      console.error('❌ Failed to sync context to memory:', error);
      this.emit('syncError', error);
    }
  }

  private startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      if (this.claudeCodeContext && this.config.enableRealTimeSync) {
        await this.syncToMemory();
      }
    }, this.config.syncInterval);
  }

  private cleanupHistory(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    
    for (const [timestamp, _] of this.contextHistory.entries()) {
      if (new Date(timestamp).getTime() < cutoffTime) {
        this.contextHistory.delete(timestamp);
      }
    }
  }

  private calculateRelevance(query: string, result: any): number {
    // Simple relevance scoring - can be enhanced with ML
    const queryTerms = query.toLowerCase().split(' ');
    const resultText = JSON.stringify(result).toLowerCase();
    
    let score = 0;
    for (const term of queryTerms) {
      const matches = (resultText.match(new RegExp(term, 'g')) || []).length;
      score += matches;
    }
    
    // Boost recent items
    const age = Date.now() - new Date(result.timestamp || (result as any).createdAt || Date.now()).getTime();
    const ageBoost = Math.max(0, 1 - (age / (7 * 24 * 60 * 60 * 1000))); // 7 days
    
    return score * (1 + ageBoost);
  }

  /**
   * Stop the memory bridge
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    this.contextHistory.clear();
    this.claudeCodeContext = null;
    
    console.log('🛑 Memory Bridge stopped');
  }
}

export default MemoryBridge;