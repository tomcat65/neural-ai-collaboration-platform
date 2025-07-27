import { MemoryItem, AgentProfile, LearningPattern, PredictionResult } from './types';
import { WeaviateClient } from './weaviate-client';
import { Neo4jClient } from './neo4j-client';
import { NeuralConsolidationEngine } from './neural-consolidation';

export interface AdaptiveLearningConfig {
  learningRate: number;
  predictionThreshold: number;
  patternMemorySize: number;
  adaptationInterval: number;
  minConfidenceThreshold: number;
}

export interface LearningMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  correctPredictions: number;
}

export class AdaptiveLearningEngine {
  private weaviateClient: WeaviateClient;
  private neo4jClient: Neo4jClient;
  private neuralConsolidation: NeuralConsolidationEngine;
  private config: AdaptiveLearningConfig;
  private learningPatterns: Map<string, LearningPattern> = new Map();
  private predictionHistory: PredictionResult[] = [];
  private adaptationTimer?: NodeJS.Timeout;

  constructor(
    weaviateClient: WeaviateClient,
    neo4jClient: Neo4jClient,
    neuralConsolidation: NeuralConsolidationEngine,
    config: Partial<AdaptiveLearningConfig> = {}
  ) {
    this.weaviateClient = weaviateClient;
    this.neo4jClient = neo4jClient;
    this.neuralConsolidation = neuralConsolidation;
    this.config = {
      learningRate: 0.1,
      predictionThreshold: 0.7,
      patternMemorySize: 1000,
      adaptationInterval: 60000, // 1 minute
      minConfidenceThreshold: 0.6,
      ...config
    };
  }

  /**
   * Initialize the adaptive learning engine
   */
  async initialize(): Promise<void> {
    console.log('🎓 Initializing Adaptive Learning Engine...');
    
    // Load existing learning patterns
    await this.loadLearningPatterns();
    
    // Start adaptive learning timer
    this.startAdaptiveLearning();
    
    console.log('✅ Adaptive Learning Engine initialized');
  }

  /**
   * Learn from new memory and update patterns
   */
  async learnFromMemory(memory: MemoryItem): Promise<void> {
    // Extract features from memory
    const features = await this.extractMemoryFeatures(memory);
    
    // Find similar patterns
    const similarPatterns = this.findSimilarPatterns(features);
    
    // Update or create learning patterns
    for (const pattern of similarPatterns) {
      await this.updateLearningPattern(pattern, features, memory);
    }

    // Create new pattern if no similar patterns found
    if (similarPatterns.length === 0) {
      await this.createNewLearningPattern(features, memory);
    }
  }

  /**
   * Extract features from memory for learning
   */
  private async extractMemoryFeatures(memory: MemoryItem): Promise<Map<string, number>> {
    const features = new Map<string, number>();

    // Temporal features
    const hour = new Date(memory.timestamp).getHours();
    features.set('hour_of_day', hour / 24);
    features.set('day_of_week', new Date(memory.timestamp).getDay() / 7);

    // Content features
    features.set('content_length', Math.min(1.0, memory.content.length / 1000));
    features.set('has_links', memory.content.includes('http') ? 1 : 0);
    features.set('has_code', memory.content.includes('```') ? 1 : 0);

    // Agent features
    features.set('agent_activity_level', await this.getAgentActivityLevel(memory.agentId));

    // Type features
    const typeEncoding = this.encodeMemoryType(memory.type);
    features.set('memory_type_encoding', typeEncoding);

    // Semantic features
    const semanticFeatures = await this.extractSemanticFeatures(memory.content);
    for (const [key, value] of semanticFeatures.entries()) {
      features.set(`semantic_${key}`, value);
    }

    return features;
  }

  /**
   * Get agent activity level
   */
  private async getAgentActivityLevel(agentId: string): Promise<number> {
    try {
      const recentMemories = await this.weaviateClient.searchMemories({
        query: '',
        agentId,
        limit: 50,
        filters: {
          timestamp: {
            gte: Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      return Math.min(1.0, recentMemories.length / 50);
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Encode memory type as numerical value
   */
  private encodeMemoryType(type: string): number {
    const typeEncodings: Record<string, number> = {
      'task': 0.1,
      'knowledge': 0.2,
      'conversation': 0.3,
      'error': 0.4,
      'success': 0.5,
      'collaboration': 0.6,
      'decision': 0.7,
      'insight': 0.8,
      'pattern': 0.9
    };

    return typeEncodings[type] || 0.5;
  }

  /**
   * Extract semantic features from content
   */
  private async extractSemanticFeatures(content: string): Promise<Map<string, number>> {
    const features = new Map<string, number>();

    // Simple keyword-based features
    const keywords = {
      'technical': ['api', 'code', 'function', 'database', 'server', 'client'],
      'collaborative': ['team', 'work', 'together', 'share', 'help'],
      'problem_solving': ['issue', 'problem', 'fix', 'solve', 'debug'],
      'planning': ['plan', 'strategy', 'goal', 'objective', 'timeline'],
      'communication': ['message', 'talk', 'discuss', 'explain', 'clarify']
    };

    const lowerContent = content.toLowerCase();
    
    for (const [category, words] of Object.entries(keywords)) {
      const matches = words.filter(word => lowerContent.includes(word)).length;
      features.set(category, Math.min(1.0, matches / words.length));
    }

    // Sentiment analysis (simplified)
    const positiveWords = ['good', 'great', 'excellent', 'success', 'working', 'fixed'];
    const negativeWords = ['error', 'fail', 'broken', 'issue', 'problem', 'bug'];
    
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;
    
    features.set('sentiment', Math.max(-1, Math.min(1, (positiveCount - negativeCount) / 10)));

    return features;
  }

  /**
   * Find similar learning patterns
   */
  private findSimilarPatterns(features: Map<string, number>): LearningPattern[] {
    const similarPatterns: LearningPattern[] = [];
    const featureArray = Array.from(features.values());

    for (const pattern of this.learningPatterns.values()) {
      const similarity = this.calculateFeatureSimilarity(featureArray, pattern.featureVector);
      
      if (similarity >= this.config.minConfidenceThreshold) {
        similarPatterns.push(pattern);
      }
    }

    return similarPatterns.sort((a, b) => {
      const similarityA = this.calculateFeatureSimilarity(featureArray, a.featureVector);
      const similarityB = this.calculateFeatureSimilarity(featureArray, b.featureVector);
      return similarityB - similarityA;
    });
  }

  /**
   * Calculate similarity between feature vectors
   */
  private calculateFeatureSimilarity(features1: number[], features2: number[]): number {
    if (features1.length !== features2.length) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < features1.length; i++) {
      dotProduct += features1[i] * features2[i];
      magnitude1 += features1[i] * features1[i];
      magnitude2 += features2[i] * features2[i];
    }

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
  }

  /**
   * Update existing learning pattern
   */
  private async updateLearningPattern(
    pattern: LearningPattern,
    features: Map<string, number>,
    memory: MemoryItem
  ): Promise<void> {
    const featureArray = Array.from(features.values());
    const similarity = this.calculateFeatureSimilarity(featureArray, pattern.featureVector);

    // Update feature vector using learning rate
    for (let i = 0; i < pattern.featureVector.length && i < featureArray.length; i++) {
      const error = featureArray[i] - pattern.featureVector[i];
      pattern.featureVector[i] += this.config.learningRate * error;
    }

    // Update pattern statistics
    pattern.occurrenceCount++;
    pattern.lastSeen = Date.now();
    pattern.confidence = Math.min(1.0, pattern.confidence + this.config.learningRate * similarity);

    // Update associated memories
    pattern.associatedMemoryIds.push(memory.id);
    if (pattern.associatedMemoryIds.length > this.config.patternMemorySize) {
      pattern.associatedMemoryIds = pattern.associatedMemoryIds.slice(-this.config.patternMemorySize);
    }

    // Store updated pattern
    await this.neo4jClient.storeLearningPattern(pattern);
  }

  /**
   * Create new learning pattern
   */
  private async createNewLearningPattern(
    features: Map<string, number>,
    memory: MemoryItem
  ): Promise<void> {
    const pattern: LearningPattern = {
      id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'adaptive_learning',
      featureVector: Array.from(features.values()),
      confidence: 0.5,
      occurrenceCount: 1,
      lastSeen: Date.now(),
      associatedMemoryIds: [memory.id],
      metadata: {
        createdFrom: memory.id,
        agentId: memory.agentId,
        memoryType: memory.type
      }
    };

    this.learningPatterns.set(pattern.id, pattern);
    await this.neo4jClient.storeLearningPattern(pattern);
  }

  /**
   * Make predictions based on current context
   */
  async makePrediction(context: MemoryItem): Promise<PredictionResult[]> {
    const features = await this.extractMemoryFeatures(context);
    const featureArray = Array.from(features.values());
    const predictions: PredictionResult[] = [];

    for (const pattern of this.learningPatterns.values()) {
      const similarity = this.calculateFeatureSimilarity(featureArray, pattern.featureVector);
      
      if (similarity >= this.config.predictionThreshold) {
        // Predict next likely memory type
        const predictedType = this.predictMemoryType(pattern);
        
        // Predict next likely agent
        const predictedAgent = this.predictNextAgent(pattern, context.agentId);
        
        // Predict timing
        const predictedTiming = this.predictTiming(pattern);

        predictions.push({
          id: `prediction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          patternId: pattern.id,
          confidence: similarity * pattern.confidence,
          predictedType,
          predictedAgent,
          predictedTiming,
          context: {
            memoryId: context.id,
            agentId: context.agentId,
            timestamp: context.timestamp
          },
          metadata: {
            featureSimilarity: similarity,
            patternConfidence: pattern.confidence,
            occurrenceCount: pattern.occurrenceCount
          },
          type: 'task_assignment',
          prediction: `Agent ${predictedAgent} will perform ${predictedType} at ${new Date(predictedTiming).toISOString()}`,
          reasoning: [`Pattern similarity: ${similarity.toFixed(3)}`, `Pattern confidence: ${pattern.confidence.toFixed(3)}`],
          timestamp: Date.now()
        });
      }
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);

    // Store predictions for learning
    this.predictionHistory.push(...predictions);

    return predictions.slice(0, 5); // Return top 5 predictions
  }

  /**
   * Predict memory type based on pattern
   */
  private predictMemoryType(pattern: LearningPattern): string {
    const typeCounts: Record<string, number> = {};
    
    // Count memory types in associated memories
    for (const memoryId of pattern.associatedMemoryIds) {
      // This would need to be implemented with actual memory lookup
      // For now, use pattern metadata
      const type = pattern.metadata?.memoryType || 'knowledge';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    // Return most common type
    return Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'knowledge';
  }

  /**
   * Predict next agent based on pattern
   */
  private predictNextAgent(pattern: LearningPattern, currentAgentId: string): string {
    // Simple prediction: alternate between agents in pattern
    const agents = [...new Set(pattern.associatedMemoryIds.map(_id => {
      // This would need actual memory lookup
      return pattern.metadata?.agentId || 'unknown';
    }))];

    if (agents.length <= 1) return currentAgentId;

    const currentIndex = agents.indexOf(currentAgentId);
    const nextIndex = (currentIndex + 1) % agents.length;
    return agents[nextIndex];
  }

  /**
   * Predict timing based on pattern
   */
  private predictTiming(pattern: LearningPattern): number {
    // Predict next occurrence based on pattern frequency
    const timeSpan = Date.now() - pattern.lastSeen;
    const averageInterval = timeSpan / pattern.occurrenceCount;
    
    return Date.now() + averageInterval;
  }

  /**
   * Evaluate prediction accuracy and update learning
   */
  async evaluatePrediction(predictionId: string, actualOutcome: MemoryItem): Promise<void> {
    const prediction = this.predictionHistory.find(p => p.id === predictionId);
    if (!prediction) return;

    // Calculate accuracy metrics
    const typeAccuracy = prediction.predictedType === actualOutcome.type ? 1 : 0;
    const agentAccuracy = prediction.predictedAgent === actualOutcome.agentId ? 1 : 0;
    const timingAccuracy = this.calculateTimingAccuracy(prediction.predictedTiming || 0, actualOutcome.timestamp);

    const overallAccuracy = (typeAccuracy + agentAccuracy + timingAccuracy) / 3;

    // Update pattern confidence based on accuracy
    const pattern = this.learningPatterns.get(prediction.patternId || '');
    if (pattern) {
      const accuracyDelta = overallAccuracy - prediction.confidence;
      pattern.confidence = Math.max(0, Math.min(1, pattern.confidence + this.config.learningRate * accuracyDelta));
      
      await this.neo4jClient.storeLearningPattern(pattern);
    }

    // Store evaluation result
    await this.neo4jClient.storePredictionEvaluation({
      predictionId,
      actualOutcome: actualOutcome.id,
      accuracy: overallAccuracy,
      typeAccuracy,
      agentAccuracy,
      timingAccuracy,
      timestamp: Date.now()
    });
  }

  /**
   * Calculate timing accuracy
   */
  private calculateTimingAccuracy(predictedTime: number, actualTime: number): number {
    const timeDiff = Math.abs(predictedTime - actualTime);
    const maxAcceptableDiff = 5 * 60 * 1000; // 5 minutes
    
    return Math.max(0, 1 - (timeDiff / maxAcceptableDiff));
  }

  /**
   * Get learning metrics
   */
  async getLearningMetrics(): Promise<LearningMetrics> {
    const evaluations = await this.neo4jClient.getPredictionEvaluations();
    
    if (evaluations.length === 0) {
      return {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        totalPredictions: 0,
        correctPredictions: 0
      };
    }

    const totalPredictions = evaluations.length;
    const correctPredictions = evaluations.filter(e => e.accuracy >= 0.7).length;
    const accuracy = correctPredictions / totalPredictions;

    // Calculate precision and recall (simplified)
    const precision = accuracy; // Simplified for this implementation
    const recall = accuracy; // Simplified for this implementation
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      totalPredictions,
      correctPredictions
    };
  }

  /**
   * Load learning patterns from storage
   */
  private async loadLearningPatterns(): Promise<void> {
    try {
      const patterns = await this.neo4jClient.getLearningPatterns();
      for (const pattern of patterns) {
        this.learningPatterns.set(pattern.id, pattern);
      }
      console.log(`📚 Loaded ${patterns.length} learning patterns`);
    } catch (error) {
      console.warn('Failed to load learning patterns:', error);
    }
  }

  /**
   * Start adaptive learning timer
   */
  private startAdaptiveLearning(): void {
    this.adaptationTimer = setInterval(async () => {
      try {
        await this.adaptLearningPatterns();
      } catch (error) {
        console.error('Error during adaptive learning:', error);
      }
    }, this.config.adaptationInterval);
  }

  /**
   * Adapt learning patterns based on recent performance
   */
  private async adaptLearningPatterns(): Promise<void> {
    const metrics = await this.getLearningMetrics();
    
    // Adjust learning rate based on performance
    if (metrics.accuracy < 0.5) {
      this.config.learningRate = Math.min(0.3, this.config.learningRate * 1.1);
    } else if (metrics.accuracy > 0.8) {
      this.config.learningRate = Math.max(0.05, this.config.learningRate * 0.95);
    }

    // Remove low-performing patterns
    const patternsToRemove: string[] = [];
    for (const [id, pattern] of this.learningPatterns.entries()) {
      if (pattern.confidence < 0.3 && pattern.occurrenceCount < 3) {
        patternsToRemove.push(id);
      }
    }

    for (const id of patternsToRemove) {
      this.learningPatterns.delete(id);
      await this.neo4jClient.deleteLearningPattern(id);
    }

    console.log(`🎓 Adaptive learning cycle complete: ${patternsToRemove.length} patterns removed, learning rate: ${this.config.learningRate.toFixed(3)}`);
  }

  /**
   * Stop adaptive learning
   */
  stopAdaptiveLearning(): void {
    if (this.adaptationTimer) {
      clearInterval(this.adaptationTimer);
      this.adaptationTimer = undefined as any;
    }
  }

  /**
   * Get current learning status
   */
  getLearningStatus(): {
    patternCount: number;
    averageConfidence: number;
    totalPredictions: number;
    learningRate: number;
  } {
    const patterns = Array.from(this.learningPatterns.values());
    const averageConfidence = patterns.length > 0 
      ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length 
      : 0;

    return {
      patternCount: patterns.length,
      averageConfidence,
      totalPredictions: this.predictionHistory.length,
      learningRate: this.config.learningRate
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAdaptiveLearning();
    this.learningPatterns.clear();
    this.predictionHistory = [];
  }
} 