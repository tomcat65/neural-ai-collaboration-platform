/**
 * OpenAI Provider Implementation
 * Integrates OpenAI's GPT models into the multi-provider system
 */

import { 
  AIProvider, 
  ProviderCapabilities, 
  ProviderConfig, 
  AIRequest, 
  AIResponse, 
  AIStreamChunk, 
  ProviderStatus,
  TokenUsage,
  ResponseMetadata 
} from '../provider-abstraction.js';

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI GPT';
  readonly capabilities: ProviderCapabilities;
  readonly config: ProviderConfig;

  private apiKey: string;
  private baseUrl: string;
  private isInitialized = false;
  private requestCount = 0;
  private totalLatency = 0;
  private successCount = 0;

  constructor(config: Partial<ProviderConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      modelName: config.modelName || 'gpt-4',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      rateLimitRpm: config.rateLimitRpm || 500,
      rateLimitTpm: config.rateLimitTpm || 40000,
      localModel: false
    };

    this.apiKey = this.config.apiKey!;
    this.baseUrl = this.config.baseUrl!;

    // Define OpenAI capabilities
    this.capabilities = {
      textGeneration: true,
      codeGeneration: true,
      reasoning: true,
      creativity: true,
      analysis: true,
      multimodal: this.config.modelName.includes('vision') || this.config.modelName.includes('4'),
      streaming: true,
      functionCalling: true,
      maxTokens: this.getMaxTokensForModel(this.config.modelName),
      costPerToken: this.getCostPerToken(this.config.modelName),
      responseTimeMs: 2000,
      reliability: 0.95
    };
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    try {
      // Test API connection
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API test failed: ${response.status} ${response.statusText}`);
      }

      this.isInitialized = true;
      console.log(`✅ OpenAI provider initialized with model: ${this.config.modelName}`);

    } catch (error) {
      console.error('❌ Failed to initialize OpenAI provider:', error);
      throw error;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.isInitialized) {
      throw new Error('OpenAI provider not initialized');
    }

    const startTime = Date.now();

    try {
      const messages = this.formatMessages(request);
      const requestPayload = {
        model: this.config.modelName,
        messages,
        max_tokens: request.maxTokens || Math.min(4000, this.capabilities.maxTokens),
        temperature: request.temperature || 0.7,
        tools: request.tools ? this.formatTools(request.tools) : undefined
      };

      const response = await this.makeRequest('/chat/completions', requestPayload) as any;
      const latencyMs = Date.now() - startTime;

      const aiResponse: AIResponse = {
        id: request.id,
        providerId: this.id,
        content: response.choices[0]?.message?.content || '',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
          cost: this.calculateCost(response.usage?.total_tokens || 0)
        },
        metadata: {
          model: response.model,
          finishReason: response.choices[0]?.finish_reason || 'stop',
          safety: {
            blocked: false,
            categories: [],
            severity: 'low'
          },
          confidence: 0.9
        },
        timestamp: new Date(),
        latencyMs,
        toolCalls: response.choices[0]?.message?.tool_calls ? 
          this.formatToolCalls(response.choices[0].message.tool_calls) : undefined
      };

      this.recordSuccess(latencyMs);
      return aiResponse;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.recordFailure(latencyMs);
      
      console.error(`❌ OpenAI request failed:`, error);
      throw new Error(`OpenAI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    if (!this.isInitialized) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const messages = this.formatMessages(request);
      const requestPayload = {
        model: this.config.modelName,
        messages,
        max_tokens: request.maxTokens || Math.min(4000, this.capabilities.maxTokens),
        temperature: request.temperature || 0.7,
        stream: true
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`OpenAI streaming request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response stream reader');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                yield {
                  id: request.id,
                  delta: '',
                  isComplete: true,
                  metadata: { provider: this.id }
                };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                
                if (delta) {
                  yield {
                    id: request.id,
                    delta,
                    isComplete: false,
                    metadata: { provider: this.id }
                  };
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error(`❌ OpenAI streaming failed:`, error);
      throw error;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const avgLatency = this.requestCount > 0 ? this.totalLatency / this.requestCount : 0;
    const errorRate = this.requestCount > 0 ? 1 - (this.successCount / this.requestCount) : 0;

    return {
      id: this.id,
      isHealthy: this.isInitialized && errorRate < 0.1,
      latencyMs: avgLatency,
      errorRate,
      rateLimitRemaining: this.config.rateLimitRpm,
      usage: {
        requestsToday: this.requestCount,
        tokensToday: 0, // Would need to track this separately
        costToday: 0,   // Would need to track this separately
        avgLatency
      },
      lastHealthCheck: new Date()
    };
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    console.log('🔌 OpenAI provider closed');
  }

  private formatMessages(request: AIRequest) {
    const messages = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    if (request.context?.conversationHistory) {
      for (const msg of request.context.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    messages.push({
      role: 'user',
      content: request.prompt
    });

    return messages;
  }

  private formatTools(tools: any[]) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  private formatToolCalls(toolCalls: any[]) {
    return toolCalls.map(call => ({
      name: call.function.name,
      parameters: JSON.parse(call.function.arguments),
      result: null // Will be filled in by the calling system
    }));
  }

  private async makeRequest(endpoint: string, payload: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return await response.json();
  }

  private getMaxTokensForModel(modelName: string): number {
    if (modelName.includes('gpt-4-turbo') || modelName === 'gpt-4-1106-preview') {
      return 128000;
    } else if (modelName.includes('gpt-4')) {
      return 8192;
    } else if (modelName.includes('gpt-3.5-turbo-16k')) {
      return 16384;
    } else if (modelName.includes('gpt-3.5')) {
      return 4096;
    }
    return 4096;
  }

  private getCostPerToken(modelName: string): number {
    // Costs per 1K tokens (approximate, as of 2024)
    if (modelName.includes('gpt-4-turbo')) {
      return 0.01 / 1000;  // $0.01 per 1K tokens
    } else if (modelName.includes('gpt-4')) {
      return 0.03 / 1000;  // $0.03 per 1K tokens
    } else if (modelName.includes('gpt-3.5')) {
      return 0.0015 / 1000; // $0.0015 per 1K tokens
    }
    return 0.01 / 1000;
  }

  private calculateCost(totalTokens: number): number {
    return totalTokens * this.capabilities.costPerToken;
  }

  private recordSuccess(latencyMs: number): void {
    this.requestCount++;
    this.successCount++;
    this.totalLatency += latencyMs;
  }

  private recordFailure(latencyMs: number): void {
    this.requestCount++;
    this.totalLatency += latencyMs;
  }
}