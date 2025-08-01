/**
 * Multi-Provider AI Abstraction Layer
 * Unified interface for multiple AI providers (Claude, OpenAI, Gemini, Grok, Ollama)
 */

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  readonly config: ProviderConfig;
  
  initialize(): Promise<void>;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk>;
  getStatus(): Promise<ProviderStatus>;
  close(): Promise<void>;
}

export interface ProviderCapabilities {
  textGeneration: boolean;
  codeGeneration: boolean;
  reasoning: boolean;
  creativity: boolean;
  analysis: boolean;
  multimodal: boolean;
  streaming: boolean;
  functionCalling: boolean;
  maxTokens: number;
  costPerToken: number;
  responseTimeMs: number;
  reliability: number; // 0-1 score
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName: string;
  timeout: number;
  retryAttempts: number;
  rateLimitRpm: number;
  rateLimitTpm: number;
  localModel?: boolean;
}

export interface AIRequest {
  id: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: AITool[];
  context?: RequestContext;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  requiredCapabilities: string[];
}

export interface AIResponse {
  id: string;
  providerId: string;
  content: string;
  usage: TokenUsage;
  metadata: ResponseMetadata;
  timestamp: Date;
  latencyMs: number;
  toolCalls?: ToolCall[];
}

export interface AIStreamChunk {
  id: string;
  delta: string;
  isComplete: boolean;
  metadata?: any;
}

export interface ProviderStatus {
  id: string;
  isHealthy: boolean;
  latencyMs: number;
  errorRate: number;
  rateLimitRemaining: number;
  usage: UsageStats;
  lastHealthCheck: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ResponseMetadata {
  model: string;
  finishReason: string;
  safety: SafetyInfo;
  confidence: number;
}

export interface RequestContext {
  agentId: string;
  sessionId: string;
  conversationHistory: Message[];
  sharedMemory: any[];
}

export interface AITool {
  name: string;
  description: string;
  parameters: any;
}

export interface ToolCall {
  name: string;
  parameters: any;
  result: any;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SafetyInfo {
  blocked: boolean;
  categories: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface UsageStats {
  requestsToday: number;
  tokensToday: number;
  costToday: number;
  avgLatency: number;
}

/**
 * Provider Registry for managing multiple AI providers
 */
export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private routingStrategy: RoutingStrategy;
  private loadBalancer: WeightedLoadBalancer;
  private healthMonitor: ProviderHealthMonitor;

  constructor() {
    this.routingStrategy = new CapabilityBasedRouting();
    this.loadBalancer = new WeightedLoadBalancer();
    this.healthMonitor = new ProviderHealthMonitor();
  }

  /**
   * Register a new AI provider
   */
  async registerProvider(provider: AIProvider): Promise<void> {
    try {
      await provider.initialize();
      this.providers.set(provider.id, provider);
      
      console.log(`✅ Registered AI provider: ${provider.name} (${provider.id})`);
      
      // Start health monitoring
      this.healthMonitor.startMonitoring(provider);
      
    } catch (error) {
      console.error(`❌ Failed to register provider ${provider.id}:`, error);
      throw error;
    }
  }

  /**
   * Get optimal provider for a request
   */
  async selectProvider(request: AIRequest): Promise<AIProvider> {
    const availableProviders = Array.from(this.providers.values())
      .filter(provider => this.isProviderHealthy(provider.id))
      .filter(provider => this.hasRequiredCapabilities(provider, request.requiredCapabilities));

    if (availableProviders.length === 0) {
      throw new Error('No suitable providers available for this request');
    }

    // Use routing strategy to select best provider
    const selectedProvider = this.routingStrategy.selectProvider(availableProviders, request);
    
    console.log(`🎯 Selected provider: ${selectedProvider.name} for request ${request.id}`);
    return selectedProvider;
  }

  /**
   * Execute request with automatic provider selection
   */
  async executeRequest(request: AIRequest): Promise<AIResponse> {
    const provider = await this.selectProvider(request);
    
    try {
      const response = await provider.generateResponse(request);
      
      // Record success metrics
      this.recordMetrics(provider.id, response.latencyMs, true);
      
      return response;
      
    } catch (error) {
      console.error(`❌ Request failed with provider ${provider.id}:`, error);
      
      // Record failure metrics
      this.recordMetrics(provider.id, 0, false);
      
      // Try fallback provider if available
      return await this.tryFallback(request, provider.id);
    }
  }

  /**
   * Stream response with provider selection
   */
  async *streamRequest(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const provider = await this.selectProvider(request);
    
    try {
      for await (const chunk of provider.streamResponse(request)) {
        yield chunk;
      }
    } catch (error) {
      console.error(`❌ Stream failed with provider ${provider.id}:`, error);
      throw error;
    }
  }

  /**
   * Get all provider statuses
   */
  async getAllProviderStatuses(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];
    
    for (const provider of this.providers.values()) {
      try {
        const status = await provider.getStatus();
        statuses.push(status);
      } catch (error) {
        console.error(`❌ Failed to get status for ${provider.id}:`, error);
      }
    }
    
    return statuses;
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Check if provider is healthy
   */
  private isProviderHealthy(providerId: string): boolean {
    return this.healthMonitor.isHealthy(providerId);
  }

  /**
   * Check if provider has required capabilities
   */
  private hasRequiredCapabilities(provider: AIProvider, requiredCapabilities: string[]): boolean {
    const capabilities = provider.capabilities;
    
    return requiredCapabilities.every(capability => {
      switch (capability) {
        case 'text_generation': return capabilities.textGeneration;
        case 'code_generation': return capabilities.codeGeneration;
        case 'reasoning': return capabilities.reasoning;
        case 'creativity': return capabilities.creativity;
        case 'analysis': return capabilities.analysis;
        case 'multimodal': return capabilities.multimodal;
        case 'streaming': return capabilities.streaming;
        case 'function_calling': return capabilities.functionCalling;
        default: return false;
      }
    });
  }

  /**
   * Try fallback provider
   */
  private async tryFallback(request: AIRequest, failedProviderId: string): Promise<AIResponse> {
    const fallbackProviders = Array.from(this.providers.values())
      .filter(p => p.id !== failedProviderId)
      .filter(p => this.isProviderHealthy(p.id))
      .filter(p => this.hasRequiredCapabilities(p, request.requiredCapabilities));

    if (fallbackProviders.length === 0) {
      throw new Error('No fallback providers available');
    }

    const fallbackProvider = fallbackProviders[0];
    console.log(`🔄 Trying fallback provider: ${fallbackProvider.name}`);
    
    return await fallbackProvider.generateResponse(request);
  }

  /**
   * Record provider metrics
   */
  private recordMetrics(providerId: string, latencyMs: number, success: boolean): void {
    this.healthMonitor.recordMetrics(providerId, latencyMs, success);
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    console.log('🔌 Shutting down provider registry...');
    
    this.healthMonitor.stop();
    
    const shutdownPromises = Array.from(this.providers.values()).map(provider => 
      provider.close().catch(error => 
        console.error(`❌ Error shutting down ${provider.id}:`, error)
      )
    );
    
    await Promise.all(shutdownPromises);
    this.providers.clear();
    
    console.log('✅ Provider registry shutdown complete');
  }
}

/**
 * Abstract routing strategy
 */
export abstract class RoutingStrategy {
  abstract selectProvider(providers: AIProvider[], request: AIRequest): AIProvider;
}

/**
 * Capability-based routing strategy
 */
class CapabilityBasedRouting extends RoutingStrategy {
  selectProvider(providers: AIProvider[], request: AIRequest): AIProvider {
    // Score providers based on capabilities match and performance
    const scoredProviders = providers.map(provider => ({
      provider,
      score: this.calculateScore(provider, request)
    }));

    // Sort by score (highest first)
    scoredProviders.sort((a, b) => b.score - a.score);
    
    return scoredProviders[0].provider;
  }

  private calculateScore(provider: AIProvider, request: AIRequest): number {
    let score = 0;
    const caps = provider.capabilities;

    // Capability matching
    if (request.requiredCapabilities.includes('code_generation') && caps.codeGeneration) score += 30;
    if (request.requiredCapabilities.includes('reasoning') && caps.reasoning) score += 25;
    if (request.requiredCapabilities.includes('creativity') && caps.creativity) score += 20;
    if (request.requiredCapabilities.includes('analysis') && caps.analysis) score += 25;

    // Performance factors
    score += caps.reliability * 20;
    score += Math.max(0, 20 - (caps.responseTimeMs / 100)); // Faster = better
    score += Math.max(0, 10 - (caps.costPerToken * 1000)); // Cheaper = better

    // Priority adjustments
    if (request.priority === 'urgent') {
      score += caps.responseTimeMs < 1000 ? 15 : -10;
    }

    return score;
  }
}

/**
 * Load balancer for distributing requests
 */
class WeightedLoadBalancer {
  private requestCounts: Map<string, number> = new Map();

  selectProvider(providers: AIProvider[]): AIProvider {
    // Simple round-robin with weights based on capabilities
    let minRequests = Infinity;
    let selectedProvider = providers[0];

    for (const provider of providers) {
      const requestCount = this.requestCounts.get(provider.id) || 0;
      const weight = provider.capabilities.reliability;
      const weightedCount = requestCount / weight;

      if (weightedCount < minRequests) {
        minRequests = weightedCount;
        selectedProvider = provider;
      }
    }

    // Increment request count
    const currentCount = this.requestCounts.get(selectedProvider.id) || 0;
    this.requestCounts.set(selectedProvider.id, currentCount + 1);

    return selectedProvider;
  }
}

/**
 * Health monitor for providers
 */
class ProviderHealthMonitor {
  private healthStatus: Map<string, boolean> = new Map();
  private metrics: Map<string, ProviderMetrics> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  startMonitoring(provider: AIProvider): void {
    this.healthStatus.set(provider.id, true);
    this.metrics.set(provider.id, new ProviderMetrics());

    // Start periodic health checks if not already running
    if (!this.monitoringInterval) {
      this.monitoringInterval = setInterval(async () => {
        await this.performHealthChecks();
      }, 30000); // Check every 30 seconds
    }
  }

  private async performHealthChecks(): Promise<void> {
    // Implementation for periodic health checks
    console.log('🏥 Performing provider health checks...');
  }

  isHealthy(providerId: string): boolean {
    return this.healthStatus.get(providerId) ?? false;
  }

  recordMetrics(providerId: string, latencyMs: number, success: boolean): void {
    const metrics = this.metrics.get(providerId);
    if (metrics) {
      metrics.recordRequest(latencyMs, success);
    }
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

/**
 * Provider metrics tracking
 */
class ProviderMetrics {
  private requestCount = 0;
  private successCount = 0;
  private totalLatency = 0;

  recordRequest(latencyMs: number, success: boolean): void {
    this.requestCount++;
    this.totalLatency += latencyMs;
    if (success) this.successCount++;
  }

  get successRate(): number {
    return this.requestCount > 0 ? this.successCount / this.requestCount : 0;
  }

  get averageLatency(): number {
    return this.requestCount > 0 ? this.totalLatency / this.requestCount : 0;
  }
}