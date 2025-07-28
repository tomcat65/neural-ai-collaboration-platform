/**
 * Metrics Collector
 * Collects and aggregates performance metrics for the MCP Bridge
 */

import {
  MCPMessage,
  MessageType,
  AgentProvider,
  MetricsData
} from '../types';

interface MessageMetric {
  id: string;
  type: MessageType;
  from: AgentProvider;
  to?: AgentProvider;
  timestamp: Date;
  latency: number;
  success: boolean;
  error?: string;
}

interface ProviderMetrics {
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number;
  errorCount: number;
  totalCost: number;
}

export class MetricsCollector {
  private messages: MessageMetric[] = [];
  private errors: Array<{ timestamp: Date; error: Error; context?: any }> = [];
  private providerMetrics: Map<AgentProvider, ProviderMetrics> = new Map();
  private startTime: Date = new Date();
  private maxHistorySize: number = 10000;

  /**
   * Record a message metric
   */
  recordMessage(message: MCPMessage, latency: number, success: boolean = true, error?: string): void {
    const metric: MessageMetric = {
      id: message.id,
      type: message.type,
      from: message.from.provider,
      to: Array.isArray(message.to) ? undefined : message.to?.provider,
      timestamp: new Date(),
      latency,
      success,
      error
    };

    this.messages.push(metric);
    this.updateProviderMetrics(metric);
    this.cleanupHistory();
  }

  /**
   * Record an error
   */
  recordError(error: Error, context?: any): void {
    this.errors.push({
      timestamp: new Date(),
      error,
      context
    });

    // Update error count for relevant provider
    if (context?.provider) {
      const metrics = this.getProviderMetrics(context.provider) as ProviderMetrics;
      metrics.errorCount++;
    }

    this.cleanupHistory();
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsData {
    const now = new Date();
    const uptime = now.getTime() - this.startTime.getTime();
    const messagesProcessed = this.messages.length;
    const errors = this.errors.length;

    // Calculate average latency
    const totalLatency = this.messages.reduce((sum, msg) => sum + msg.latency, 0);
    const averageLatency = messagesProcessed > 0 ? totalLatency / messagesProcessed : 0;

    // Calculate error rate
    const errorRate = messagesProcessed > 0 ? errors / messagesProcessed : 0;

    // Count active agents (those that sent messages recently)
    const recentThreshold = now.getTime() - (5 * 60 * 1000); // 5 minutes
    const recentMessages = this.messages.filter(msg => msg.timestamp.getTime() > recentThreshold);
    const activeAgents = new Set(recentMessages.map(msg => `${msg.from}`)).size;

    // Calculate task completion rate
    const taskMessages = this.messages.filter(msg => 
      msg.type === MessageType.TASK_REQUEST || msg.type === MessageType.TASK_RESPONSE
    );
    const completedTasks = taskMessages.filter(msg => msg.success).length;
    const taskCompletionRate = taskMessages.length > 0 ? completedTasks / taskMessages.length : 0;

    // Calculate total cost
    let totalCost = 0;
    for (const metrics of this.providerMetrics.values()) {
      totalCost += metrics.totalCost;
    }
    const costPerTask = completedTasks > 0 ? totalCost / completedTasks : 0;

    return {
      messagesProcessed,
      averageLatency,
      errorRate,
      activeAgents,
      taskCompletionRate,
      costPerTask
    };
  }

  /**
   * Get detailed metrics by provider
   */
  getProviderMetrics(provider?: AgentProvider): ProviderMetrics | Map<AgentProvider, ProviderMetrics> {
    if (provider) {
      return this.providerMetrics.get(provider) || this.createEmptyProviderMetrics();
    }
    return this.providerMetrics;
  }

  /**
   * Get metrics for specific time range
   */
  getMetricsInRange(startTime: Date, endTime: Date): {
    messages: MessageMetric[];
    errors: Array<{ timestamp: Date; error: Error; context?: any }>;
    summary: {
      messageCount: number;
      errorCount: number;
      averageLatency: number;
      successRate: number;
    };
  } {
    const messages = this.messages.filter(msg => 
      msg.timestamp >= startTime && msg.timestamp <= endTime
    );

    const errors = this.errors.filter(err => 
      err.timestamp >= startTime && err.timestamp <= endTime
    );

    const messageCount = messages.length;
    const errorCount = errors.length;
    const totalLatency = messages.reduce((sum, msg) => sum + msg.latency, 0);
    const averageLatency = messageCount > 0 ? totalLatency / messageCount : 0;
    const successfulMessages = messages.filter(msg => msg.success).length;
    const successRate = messageCount > 0 ? successfulMessages / messageCount : 0;

    return {
      messages,
      errors,
      summary: {
        messageCount,
        errorCount,
        averageLatency,
        successRate
      }
    };
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(intervalMinutes: number = 5): Array<{
    timestamp: Date;
    messageCount: number;
    averageLatency: number;
    errorRate: number;
  }> {
    const now = new Date();
    const intervals: Array<{
      timestamp: Date;
      messageCount: number;
      averageLatency: number;
      errorRate: number;
    }> = [];

    // Go back 24 hours
    const hoursBack = 24;
    const intervalMs = intervalMinutes * 60 * 1000;

    for (let i = hoursBack * (60 / intervalMinutes); i >= 0; i--) {
      const intervalStart = new Date(now.getTime() - (i * intervalMs));
      const intervalEnd = new Date(intervalStart.getTime() + intervalMs);

      const intervalData = this.getMetricsInRange(intervalStart, intervalEnd);

      intervals.push({
        timestamp: intervalStart,
        messageCount: intervalData.summary.messageCount,
        averageLatency: intervalData.summary.averageLatency,
        errorRate: 1 - intervalData.summary.successRate
      });
    }

    return intervals;
  }

  /**
   * Get top message types by volume
   */
  getTopMessageTypes(limit: number = 10): Array<{
    type: MessageType;
    count: number;
    averageLatency: number;
    successRate: number;
  }> {
    const typeCounts = new Map<MessageType, {
      count: number;
      totalLatency: number;
      successCount: number;
    }>();

    for (const message of this.messages) {
      const existing = typeCounts.get(message.type) || {
        count: 0,
        totalLatency: 0,
        successCount: 0
      };

      existing.count++;
      existing.totalLatency += message.latency;
      if (message.success) {
        existing.successCount++;
      }

      typeCounts.set(message.type, existing);
    }

    const results = Array.from(typeCounts.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      averageLatency: data.totalLatency / data.count,
      successRate: data.successCount / data.count
    }));

    // Sort by count descending
    results.sort((a, b) => b.count - a.count);

    return results.slice(0, limit);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.messages = [];
    this.errors = [];
    this.providerMetrics.clear();
    this.startTime = new Date();
  }

  /**
   * Export metrics to JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      startTime: this.startTime,
      snapshot: this.getSnapshot(),
      providerMetrics: Object.fromEntries(this.providerMetrics),
      recentMessages: this.messages.slice(-100), // Last 100 messages
      recentErrors: this.errors.slice(-50) // Last 50 errors
    }, null, 2);
  }

  /**
   * Update provider-specific metrics
   */
  private updateProviderMetrics(metric: MessageMetric): void {
    // Update sender metrics
    const senderMetrics = this.getOrCreateProviderMetrics(metric.from);
    senderMetrics.messagesSent++;
    senderMetrics.averageLatency = this.updateAverageLatency(
      senderMetrics.averageLatency,
      senderMetrics.messagesSent,
      metric.latency
    );

    if (!metric.success) {
      senderMetrics.errorCount++;
    }

    // Update receiver metrics if available
    if (metric.to) {
      const receiverMetrics = this.getOrCreateProviderMetrics(metric.to);
      receiverMetrics.messagesReceived++;
    }
  }

  /**
   * Get or create provider metrics
   */
  private getOrCreateProviderMetrics(provider: AgentProvider): ProviderMetrics {
    if (!this.providerMetrics.has(provider)) {
      this.providerMetrics.set(provider, this.createEmptyProviderMetrics());
    }
    return this.providerMetrics.get(provider)!;
  }

  /**
   * Create empty provider metrics
   */
  private createEmptyProviderMetrics(): ProviderMetrics {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      averageLatency: 0,
      errorCount: 0,
      totalCost: 0
    };
  }

  /**
   * Update running average latency
   */
  private updateAverageLatency(currentAverage: number, count: number, newValue: number): number {
    return ((currentAverage * (count - 1)) + newValue) / count;
  }

  /**
   * Clean up old history to prevent memory leaks
   */
  private cleanupHistory(): void {
    if (this.messages.length > this.maxHistorySize) {
      this.messages = this.messages.slice(-this.maxHistorySize);
    }

    if (this.errors.length > this.maxHistorySize / 10) {
      this.errors = this.errors.slice(-this.maxHistorySize / 10);
    }
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const snapshot = this.getSnapshot();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check error rate
    if (snapshot.errorRate > 0.1) {
      issues.push(`High error rate: ${(snapshot.errorRate * 100).toFixed(1)}%`);
      recommendations.push('Investigate recent errors and improve error handling');
    }

    // Check average latency
    if (snapshot.averageLatency > 5000) {
      issues.push(`High average latency: ${snapshot.averageLatency.toFixed(0)}ms`);
      recommendations.push('Optimize message processing or consider load balancing');
    }

    // Check task completion rate
    if (snapshot.taskCompletionRate < 0.8) {
      issues.push(`Low task completion rate: ${(snapshot.taskCompletionRate * 100).toFixed(1)}%`);
      recommendations.push('Review task assignment logic and agent capabilities');
    }

    // Check active agents
    if (snapshot.activeAgents < 2) {
      issues.push(`Low number of active agents: ${snapshot.activeAgents}`);
      recommendations.push('Ensure sufficient agents are registered and online');
    }

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = issues.length > 2 ? 'critical' : 'warning';
    }

    return { status, issues, recommendations };
  }
}