import { MemoryItem, PerformanceMetrics, CacheStats, ScalabilityMetrics } from './types';
import { WeaviateClient } from './weaviate-client';
import { Neo4jClient } from './neo4j-client';
import { NeuralConsolidationEngine } from './neural-consolidation';
import { AdaptiveLearningEngine } from './adaptive-learning';
import { EnhancedCollaborationEngine } from './enhanced-collaboration';

export interface PerformanceConfig {
  cacheSize: number;
  cacheTTL: number;
  queryTimeout: number;
  maxConcurrentQueries: number;
  loadBalancingEnabled: boolean;
  autoScalingEnabled: boolean;
  performanceMonitoringEnabled: boolean;
}

export interface QueryPerformance {
  queryId: string;
  queryType: string;
  executionTime: number;
  cacheHit: boolean;
  resultSize: number;
  timestamp: number;
}

export interface SystemPerformance {
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  queryQueueLength: number;
  averageResponseTime: number;
}

export class PerformanceOptimizationEngine {
  private weaviateClient: WeaviateClient;
  private neo4jClient: Neo4jClient;
  private neuralConsolidation: NeuralConsolidationEngine;
  private adaptiveLearning: AdaptiveLearningEngine;
  private enhancedCollaboration: EnhancedCollaborationEngine;
  private config: PerformanceConfig;
  
  // Advanced caching
  private memoryCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private queryCache: Map<string, { result: any; timestamp: number; ttl: number }> = new Map();
  private patternCache: Map<string, { patterns: any[]; timestamp: number; ttl: number }> = new Map();
  
  // Performance monitoring
  private queryPerformance: QueryPerformance[] = [];
  private systemMetrics: SystemPerformance[] = [];
  private performanceTimer?: NodeJS.Timeout;
  
  // Load balancing
  private queryQueue: Array<{ id: string; query: () => Promise<any>; priority: number }> = [];
  private activeQueries: Set<string> = new Set();
  private queryProcessor?: NodeJS.Timeout;

  constructor(
    weaviateClient: WeaviateClient,
    neo4jClient: Neo4jClient,
    neuralConsolidation: NeuralConsolidationEngine,
    adaptiveLearning: AdaptiveLearningEngine,
    enhancedCollaboration: EnhancedCollaborationEngine,
    config: Partial<PerformanceConfig> = {}
  ) {
    this.weaviateClient = weaviateClient;
    this.neo4jClient = neo4jClient;
    this.neuralConsolidation = neuralConsolidation;
    this.adaptiveLearning = adaptiveLearning;
    this.enhancedCollaboration = enhancedCollaboration;
    this.config = {
      cacheSize: 10000,
      cacheTTL: 300000, // 5 minutes
      queryTimeout: 30000, // 30 seconds
      maxConcurrentQueries: 50,
      loadBalancingEnabled: true,
      autoScalingEnabled: true,
      performanceMonitoringEnabled: true,
      ...config
    };
  }

  /**
   * Initialize the performance optimization engine
   */
  async initialize(): Promise<void> {
    console.log('⚡ Initializing Performance Optimization Engine...');
    
    // Start performance monitoring
    if (this.config.performanceMonitoringEnabled) {
      this.startPerformanceMonitoring();
    }
    
    // Start query processing
    if (this.config.loadBalancingEnabled) {
      this.startQueryProcessing();
    }
    
    // Initialize caches
    this.initializeCaches();
    
    console.log('✅ Performance Optimization Engine initialized');
  }

  /**
   * Initialize caches with cleanup
   */
  private initializeCaches(): void {
    // Set up cache cleanup timer
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Clean up every minute
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clean query cache
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.queryCache.delete(key);
      }
    }
    
    // Clean pattern cache
    for (const [key, entry] of this.patternCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.patternCache.delete(key);
      }
    }
    
    // Limit cache sizes
    this.limitCacheSize(this.memoryCache, this.config.cacheSize);
    this.limitCacheSize(this.queryCache, this.config.cacheSize / 2);
    this.limitCacheSize(this.patternCache, this.config.cacheSize / 4);
  }

  /**
   * Limit cache size by removing oldest entries
   */
  private limitCacheSize(cache: Map<string, any>, maxSize: number): void {
    if (cache.size <= maxSize) return;
    
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, cache.size - maxSize);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }

  /**
   * Optimized memory search with caching
   */
  async optimizedMemorySearch(query: string, options: any = {}): Promise<MemoryItem[]> {
    const cacheKey = `search_${query}_${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.recordQueryPerformance('memory_search', 0, true, cached.result.length);
      return cached.result;
    }
    
    // Execute query with timeout
    const startTime = Date.now();
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const result = await this.executeWithTimeout(
        () => this.weaviateClient.searchMemories({ query, ...options }),
        this.config.queryTimeout
      );
      
      // Cache result
      this.queryCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        ttl: this.config.cacheTTL
      });
      
      const executionTime = Date.now() - startTime;
      this.recordQueryPerformance('memory_search', executionTime, false, result.length);
      
      return result;
    } catch (error) {
      console.error(`Query ${queryId} failed:`, error);
      throw error;
    }
  }

  /**
   * Optimized pattern recognition with caching
   */
  async optimizedPatternRecognition(memories: MemoryItem[]): Promise<any[]> {
    const cacheKey = `patterns_${memories.map(m => m.id).join('_')}`;
    
    // Check cache first
    const cached = this.patternCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.patterns;
    }
    
    // Execute pattern recognition
    const startTime = Date.now();
    const patterns = await this.neuralConsolidation.recognizeNeuralPatterns();
    
    // Cache patterns
    this.patternCache.set(cacheKey, {
      patterns,
      timestamp: Date.now(),
      ttl: this.config.cacheTTL
    });
    
    const executionTime = Date.now() - startTime;
    this.recordQueryPerformance('pattern_recognition', executionTime, false, patterns.length);
    
    return patterns;
  }

  /**
   * Optimized collaboration insights with caching
   */
  async optimizedCollaborationInsights(collaborationId: string): Promise<any> {
    const cacheKey = `collab_insights_${collaborationId}`;
    
    // Check cache first
    const cached = this.memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    
    // Get insights
    const insights = this.enhancedCollaboration.getCollectiveIntelligence(collaborationId);
    
    // Cache insights
    this.memoryCache.set(cacheKey, {
      data: insights,
      timestamp: Date.now(),
      ttl: this.config.cacheTTL
    });
    
    return insights;
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
      
      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Queue query for load balancing
   */
  async queueQuery<T>(
    queryFn: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    if (!this.config.loadBalancingEnabled) {
      return queryFn();
    }
    
    const queryId = `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((_resolve, reject) => {
      this.queryQueue.push({
        id: queryId,
        query: queryFn,
        priority
      });
      
      // Sort queue by priority (higher priority first)
      this.queryQueue.sort((a, b) => b.priority - a.priority);
      
      // Set up timeout for queued query
      setTimeout(() => {
        reject(new Error(`Queued query ${queryId} timed out`));
      }, this.config.queryTimeout);
    });
  }

  /**
   * Start query processing for load balancing
   */
  private startQueryProcessing(): void {
    this.queryProcessor = setInterval(async () => {
      if (this.activeQueries.size >= this.config.maxConcurrentQueries) {
        return; // At capacity
      }
      
      if (this.queryQueue.length === 0) {
        return; // No queries to process
      }
      
      const queuedQuery = this.queryQueue.shift();
      if (!queuedQuery) return;
      
      this.activeQueries.add(queuedQuery.id);
      
      try {
        const result = await queuedQuery.query();
        // Resolve the promise (this would need to be implemented with a more sophisticated queue system)
      } catch (error) {
        console.error(`Queued query ${queuedQuery.id} failed:`, error);
      } finally {
        this.activeQueries.delete(queuedQuery.id);
      }
    }, 100); // Process every 100ms
  }

  /**
   * Record query performance metrics
   */
  private recordQueryPerformance(
    queryType: string,
    executionTime: number,
    cacheHit: boolean,
    resultSize: number
  ): void {
    const performance: QueryPerformance = {
      queryId: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      queryType,
      executionTime,
      cacheHit,
      resultSize,
      timestamp: Date.now()
    };
    
    this.queryPerformance.push(performance);
    
    // Keep only recent performance data
    if (this.queryPerformance.length > 1000) {
      this.queryPerformance = this.queryPerformance.slice(-500);
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.performanceTimer = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.systemMetrics.push(metrics);
        
        // Keep only recent metrics
        if (this.systemMetrics.length > 100) {
          this.systemMetrics = this.systemMetrics.slice(-50);
        }
        
        // Auto-scaling logic
        if (this.config.autoScalingEnabled) {
          await this.performAutoScaling(metrics);
        }
      } catch (error) {
        console.error('Error collecting system metrics:', error);
      }
    }, 10000); // Collect metrics every 10 seconds
  }

  /**
   * Collect system performance metrics
   */
  private async collectSystemMetrics(): Promise<SystemPerformance> {
    // Simplified metrics collection
    const metrics: SystemPerformance = {
      cpuUsage: Math.random() * 100, // Would be actual CPU usage
      memoryUsage: Math.random() * 100, // Would be actual memory usage
      activeConnections: this.activeQueries.size,
      queryQueueLength: this.queryQueue.length,
      averageResponseTime: this.calculateAverageResponseTime()
    };
    
    return metrics;
  }

  /**
   * Calculate average response time from recent queries
   */
  private calculateAverageResponseTime(): number {
    if (this.queryPerformance.length === 0) return 0;
    
    const recentQueries = this.queryPerformance.slice(-100);
    const totalTime = recentQueries.reduce((sum, query) => sum + query.executionTime, 0);
    
    return totalTime / recentQueries.length;
  }

  /**
   * Perform auto-scaling based on metrics
   */
  private async performAutoScaling(metrics: SystemPerformance): Promise<void> {
    // Scale up if high load
    if (metrics.cpuUsage > 80 || metrics.queryQueueLength > 20) {
      await this.scaleUp();
    }
    
    // Scale down if low load
    if (metrics.cpuUsage < 30 && metrics.queryQueueLength < 5) {
      await this.scaleDown();
    }
  }

  /**
   * Scale up system resources
   */
  private async scaleUp(): Promise<void> {
    // Increase cache size
    this.config.cacheSize = Math.min(50000, this.config.cacheSize * 1.2);
    
    // Increase concurrent queries
    this.config.maxConcurrentQueries = Math.min(100, this.config.maxConcurrentQueries + 5);
    
    console.log('📈 Auto-scaling: Scaled up system resources');
  }

  /**
   * Scale down system resources
   */
  private async scaleDown(): Promise<void> {
    // Decrease cache size
    this.config.cacheSize = Math.max(5000, this.config.cacheSize * 0.9);
    
    // Decrease concurrent queries
    this.config.maxConcurrentQueries = Math.max(10, this.config.maxConcurrentQueries - 2);
    
    console.log('📉 Auto-scaling: Scaled down system resources');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: this.memoryCache.size + this.queryCache.size + this.patternCache.size,
      evictions: 0,
      memoryCacheSize: this.memoryCache.size
    };
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    if (this.queryPerformance.length === 0) return 0;
    
    const recentQueries = this.queryPerformance.slice(-100);
    const cacheHits = recentQueries.filter(query => query.cacheHit).length;
    
    return cacheHits / recentQueries.length;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      queryTime: 0,
      memoryUsage: 0,
      cacheHitRate: this.calculateCacheHitRate(),
      throughput: this.queryPerformance.length / 60,
      latency: 0,
      averageResponseTime: this.calculateAverageResponseTime()
    };
  }

  /**
   * Get scalability metrics
   */
  getScalabilityMetrics(): ScalabilityMetrics {
    return {
      concurrentAgents: 0,
      memoryGrowth: 0,
      queryComplexity: 0,
      systemLoad: 0,
      maxConcurrentQueries: this.config.maxConcurrentQueries
    };
  }

  /**
   * Optimize for 100+ agent scalability
   */
  async optimizeForScalability(targetAgents: number): Promise<void> {
    console.log(`🚀 Optimizing for ${targetAgents}+ agent scalability...`);
    
    // Adjust cache size for more agents
    this.config.cacheSize = Math.max(50000, targetAgents * 100);
    
    // Adjust concurrent queries
    this.config.maxConcurrentQueries = Math.max(100, targetAgents * 2);
    
    // Enable auto-scaling
    this.config.autoScalingEnabled = true;
    
    // Enable load balancing
    this.config.loadBalancingEnabled = true;
    
    // Pre-warm caches
    await this.preWarmCaches();
    
    console.log(`✅ Optimized for ${targetAgents}+ agent scalability`);
  }

  /**
   * Pre-warm caches for better performance
   */
  private async preWarmCaches(): Promise<void> {
    try {
      // Pre-warm with common queries
      const commonQueries = ['task', 'knowledge', 'collaboration', 'error'];
      
      for (const query of commonQueries) {
        await this.optimizedMemorySearch(query, { limit: 10 });
      }
      
      console.log('🔥 Cache pre-warming complete');
    } catch (error) {
      console.warn('Cache pre-warming failed:', error);
    }
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring(): void {
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer);
      this.performanceTimer = undefined as any;
    }
    
    if (this.queryProcessor) {
      clearInterval(this.queryProcessor);
      this.queryProcessor = undefined as any;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopPerformanceMonitoring();
    this.memoryCache.clear();
    this.queryCache.clear();
    this.patternCache.clear();
    this.queryPerformance = [];
    this.systemMetrics = [];
    this.queryQueue = [];
    this.activeQueries.clear();
  }
} 