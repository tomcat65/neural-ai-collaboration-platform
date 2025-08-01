/**
 * Google Gemini Provider Implementation
 * Integrates Google's Gemini models into the multi-provider system
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

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
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
      apiKey: config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1',
      modelName: config.modelName || 'gemini-pro',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      rateLimitRpm: config.rateLimitRpm || 60,
      rateLimitTpm: config.rateLimitTpm || 32000,
      localModel: false
    };

    this.apiKey = this.config.apiKey!;
    this.baseUrl = this.config.baseUrl!;

    // Define Gemini capabilities
    this.capabilities = {
      textGeneration: true,
      codeGeneration: true,
      reasoning: true,
      creativity: true,
      analysis: true,
      multimodal: this.config.modelName.includes('vision') || this.config.modelName.includes('pro'),
      streaming: true,
      functionCalling: this.config.modelName.includes('pro'),
      maxTokens: this.getMaxTokensForModel(this.config.modelName),
      costPerToken: this.getCostPerToken(this.config.modelName),
      responseTimeMs: 1500,
      reliability: 0.92
    };
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Google API key is required for Gemini');
    }

    try {
      // Test API connection by listing models
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gemini API test failed: ${response.status} ${response.statusText}`);
      }

      const models = await response.json() as any;
      const hasModel = models.models?.some((model: any) => 
        model.name.includes(this.config.modelName)
      );

      if (!hasModel) {
        console.warn(`⚠️ Model ${this.config.modelName} not found in available models`);
      }

      this.isInitialized = true;
      console.log(`✅ Gemini provider initialized with model: ${this.config.modelName}`);

    } catch (error) {
      console.error('❌ Failed to initialize Gemini provider:', error);
      throw error;
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.isInitialized) {
      throw new Error('Gemini provider not initialized');
    }

    const startTime = Date.now();

    try {
      const requestPayload = this.formatRequest(request);
      const modelPath = `models/${this.config.modelName}`;
      const endpoint = `${this.baseUrl}/${modelPath}:generateContent?key=${this.apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json() as any;
      const latencyMs = Date.now() - startTime;

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response format from Gemini API');
      }

      const aiResponse: AIResponse = {
        id: request.id,
        providerId: this.id,
        content: data.candidates[0].content.parts[0].text,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
          cost: this.calculateCost(data.usageMetadata?.totalTokenCount || 0)
        },
        metadata: {
          model: this.config.modelName,
          finishReason: this.mapFinishReason(data.candidates[0].finishReason),
          safety: this.extractSafetyInfo(data.candidates[0].safetyRatings),
          confidence: this.calculateConfidence(data.candidates[0])
        },
        timestamp: new Date(),
        latencyMs,
        toolCalls: data.candidates[0].content.parts
          .filter((part: any) => part.functionCall)
          .map((part: any) => this.formatToolCall(part.functionCall))
      };

      this.recordSuccess(latencyMs);
      return aiResponse;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.recordFailure(latencyMs);
      
      console.error(`❌ Gemini request failed:`, error);
      throw new Error(`Gemini request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    if (!this.isInitialized) {
      throw new Error('Gemini provider not initialized');
    }

    try {
      const requestPayload = this.formatRequest(request);
      const modelPath = `models/${this.config.modelName}`;
      const endpoint = `${this.baseUrl}/${modelPath}:streamGenerateContent?key=${this.apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`Gemini streaming request failed: ${response.status}`);
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
            if (line.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(line);
                const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (content) {
                  yield {
                    id: request.id,
                    delta: content,
                    isComplete: false,
                    metadata: { provider: this.id }
                  };
                }

                // Check if this is the final chunk
                if (parsed.candidates?.[0]?.finishReason) {
                  yield {
                    id: request.id,
                    delta: '',
                    isComplete: true,
                    metadata: { 
                      provider: this.id,
                      finishReason: parsed.candidates[0].finishReason
                    }
                  };
                  return;
                }
              } catch (e) {
                // Skip invalid JSON lines
                console.warn('Failed to parse streaming response line:', line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error(`❌ Gemini streaming failed:`, error);
      throw error;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const avgLatency = this.requestCount > 0 ? this.totalLatency / this.requestCount : 0;
    const errorRate = this.requestCount > 0 ? 1 - (this.successCount / this.requestCount) : 0;

    return {
      id: this.id,
      isHealthy: this.isInitialized && errorRate < 0.15,
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
    console.log('🔌 Gemini provider closed');
  }

  private formatRequest(request: AIRequest) {
    const contents = [];

    // Add system prompt as first message if present
    if (request.systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${request.systemPrompt}` }]
      });
    }

    // Add conversation history
    if (request.context?.conversationHistory) {
      for (const msg of request.context.conversationHistory) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Add current prompt
    contents.push({
      role: 'user',
      parts: [{ text: request.prompt }]
    });

    const payload: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens || Math.min(2048, this.capabilities.maxTokens),
        temperature: request.temperature || 0.7,
        topK: 40,
        topP: 0.95
      }
    };

    // Add function declarations if tools are provided
    if (request.tools && request.tools.length > 0) {
      payload.tools = [{
        functionDeclarations: request.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }))
      }];
    }

    return payload;
  }

  private formatToolCall(functionCall: any) {
    return {
      name: functionCall.name,
      parameters: functionCall.args || {},
      result: null // Will be filled in by the calling system
    };
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'STOP': return 'stop';
      case 'MAX_TOKENS': return 'length';
      case 'SAFETY': return 'content_filter';
      case 'RECITATION': return 'content_filter';
      default: return reason || 'stop';
    }
  }

  private extractSafetyInfo(safetyRatings: any[]) {
    if (!safetyRatings || safetyRatings.length === 0) {
      return {
        blocked: false,
        categories: [],
        severity: 'low' as const
      };
    }

    const blocked = safetyRatings.some(rating => 
      rating.probability === 'HIGH' || rating.blocked
    );

    const categories = safetyRatings
      .filter(rating => rating.probability !== 'NEGLIGIBLE')
      .map(rating => rating.category);

    const severity = blocked ? 'high' : 
      safetyRatings.some(r => r.probability === 'MEDIUM') ? 'medium' : 'low';

    return {
      blocked,
      categories,
      severity: severity as 'low' | 'medium' | 'high'
    };
  }

  private calculateConfidence(candidate: any): number {
    // Base confidence on safety ratings and finish reason
    let confidence = 0.8;

    if (candidate.finishReason === 'STOP') {
      confidence += 0.1;
    }

    if (candidate.safetyRatings) {
      const highRiskRatings = candidate.safetyRatings.filter(
        (rating: any) => rating.probability === 'HIGH'
      ).length;
      confidence -= highRiskRatings * 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private getMaxTokensForModel(modelName: string): number {
    if (modelName.includes('gemini-pro')) {
      return 30720;
    } else if (modelName.includes('gemini-1.5')) {
      return 1048576; // 1M tokens for Gemini 1.5
    }
    return 2048;
  }

  private getCostPerToken(modelName: string): number {
    // Costs per 1K tokens (approximate, as of 2024)
    if (modelName.includes('gemini-1.5-pro')) {
      return 0.0035 / 1000;  // $0.0035 per 1K tokens
    } else if (modelName.includes('gemini-pro')) {
      return 0.0005 / 1000;  // $0.0005 per 1K tokens
    }
    return 0.001 / 1000;
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