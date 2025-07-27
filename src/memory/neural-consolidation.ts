import { MemoryItem, AgentProfile, MemoryImportance, NeuralPattern } from './types';
import { WeaviateClient } from './weaviate-client';
import { Neo4jClient } from './neo4j-client';

export interface NeuralConsolidationConfig {
  importanceDecayRate: number;
  consolidationThreshold: number;
  patternRecognitionSensitivity: number;
  maxWorkingMemorySize: number;
  consolidationInterval: number;
}

export interface MemoryConsolidationResult {
  consolidated: MemoryItem[];
  archived: MemoryItem[];
  importanceScores: Map<string, number>;
  patterns: NeuralPattern[];
}

export class NeuralConsolidationEngine {
  private weaviateClient: WeaviateClient;
  private neo4jClient: Neo4jClient;
  private config: NeuralConsolidationConfig;
  private workingMemory: Map<string, MemoryItem> = new Map();
  private importanceScores: Map<string, number> = new Map();
  private consolidationTimer?: NodeJS.Timeout;

  constructor(
    weaviateClient: WeaviateClient,
    neo4jClient: Neo4jClient,
    config: Partial<NeuralConsolidationConfig> = {}
  ) {
    this.weaviateClient = weaviateClient;
    this.neo4jClient = neo4jClient;
    this.config = {
      importanceDecayRate: 0.95,
      consolidationThreshold: 0.7,
      patternRecognitionSensitivity: 0.8,
      maxWorkingMemorySize: 1000,
      consolidationInterval: 30000, // 30 seconds
      ...config
    };
  }

  /**
   * Initialize the neural consolidation engine
   */
  async initialize(): Promise<void> {
    console.log('🧠 Initializing Neural Consolidation Engine...');
    
    // Start automatic consolidation
    this.startAutomaticConsolidation();
    
    console.log('✅ Neural Consolidation Engine initialized');
  }

  /**
   * Add memory to working memory with neural importance scoring
   */
  async addToWorkingMemory(memory: MemoryItem): Promise<number> {
    const importanceScore = await this.calculateNeuralImportance(memory);
    
    this.workingMemory.set(memory.id, memory);
    this.importanceScores.set(memory.id, importanceScore);

    // Trigger consolidation if working memory is full
    if (this.workingMemory.size >= this.config.maxWorkingMemorySize) {
      await this.triggerConsolidation();
    }

    return importanceScore;
  }

  /**
   * Calculate neural importance score for memory item
   */
  private async calculateNeuralImportance(memory: MemoryItem): Promise<number> {
    let baseScore = 0.5;

    // Factor 1: Recency (0-0.3)
    const ageInHours = (Date.now() - memory.timestamp) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 0.3 * Math.exp(-ageInHours / 24));
    baseScore += recencyScore;

    // Factor 2: Agent activity (0-0.2)
    const agentActivity = await this.getAgentActivityScore(memory.agentId);
    baseScore += agentActivity * 0.2;

    // Factor 3: Semantic relevance (0-0.2)
    const semanticRelevance = await this.calculateSemanticRelevance(memory);
    baseScore += semanticRelevance * 0.2;

    // Factor 4: Collaboration impact (0-0.3)
    const collaborationImpact = await this.calculateCollaborationImpact(memory);
    baseScore += collaborationImpact * 0.3;

    return Math.min(1.0, Math.max(0.0, baseScore));
  }

  /**
   * Get agent activity score based on recent interactions
   */
  private async getAgentActivityScore(agentId: string): Promise<number> {
    try {
      const recentMemories = await this.weaviateClient.searchMemories({
        query: '',
        agentId,
        limit: 10,
        filters: {
          timestamp: {
            gte: Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      return Math.min(1.0, recentMemories.length / 10);
    } catch (error) {
      console.warn('Failed to get agent activity score:', error);
      return 0.5;
    }
  }

  /**
   * Calculate semantic relevance to current context
   */
  private async calculateSemanticRelevance(memory: MemoryItem): Promise<number> {
    try {
      // Get recent memories to establish context
      const recentMemories = await this.weaviateClient.searchMemories({
        query: '',
        limit: 5,
        filters: {
          timestamp: {
            gte: Date.now() - (60 * 60 * 1000) // Last hour
          }
        }
      });

      if (recentMemories.length === 0) return 0.5;

      // Calculate average similarity to recent memories
      let totalSimilarity = 0;
      for (const recentMemory of recentMemories) {
        const similarity = await this.weaviateClient.calculateSimilarity(
          memory,
          recentMemory
        );
        totalSimilarity += similarity;
      }

      return totalSimilarity / recentMemories.length;
    } catch (error) {
      console.warn('Failed to calculate semantic relevance:', error);
      return 0.5;
    }
  }

  /**
   * Calculate collaboration impact score
   */
  private async calculateCollaborationImpact(memory: MemoryItem): Promise<number> {
    try {
      // Check how many agents are involved in related memories
      const relatedMemories = await this.neo4jClient.findRelatedMemories(memory.id, 10);
      
      const uniqueAgents = new Set<string>();
      uniqueAgents.add(memory.agentId);
      
      for (const related of relatedMemories) {
        uniqueAgents.add(related.agentId);
      }

      // More agents = higher collaboration impact
      return Math.min(1.0, uniqueAgents.size / 5);
    } catch (error) {
      console.warn('Failed to calculate collaboration impact:', error);
      return 0.5;
    }
  }

  /**
   * Apply neural decay to importance scores
   */
  private applyNeuralDecay(): void {
    const now = Date.now();
    
    for (const [memoryId, score] of this.importanceScores.entries()) {
      const memory = this.workingMemory.get(memoryId);
      if (!memory) continue;

      const ageInHours = (now - memory.timestamp) / (1000 * 60 * 60);
      const decayFactor = Math.pow(this.config.importanceDecayRate, ageInHours / 24);
      
      const newScore = score * decayFactor;
      this.importanceScores.set(memoryId, newScore);

      // Remove memories that have decayed too much
      if (newScore < 0.1) {
        this.workingMemory.delete(memoryId);
        this.importanceScores.delete(memoryId);
      }
    }
  }

  /**
   * Recognize neural patterns in working memory
   */
  public async recognizeNeuralPatterns(): Promise<NeuralPattern[]> {
    const patterns: NeuralPattern[] = [];
    const memories = Array.from(this.workingMemory.values());

    // Pattern 1: Temporal clustering
    const temporalPatterns = this.findTemporalPatterns(memories);
    patterns.push(...temporalPatterns);

    // Pattern 2: Semantic clustering
    const semanticPatterns = await this.findSemanticPatterns(memories);
    patterns.push(...semanticPatterns);

    // Pattern 3: Agent interaction patterns
    const interactionPatterns = this.findInteractionPatterns(memories);
    patterns.push(...interactionPatterns);

    return patterns;
  }

  /**
   * Find temporal patterns in memories
   */
  private findTemporalPatterns(memories: MemoryItem[]): NeuralPattern[] {
    const patterns: NeuralPattern[] = [];
    const sortedMemories = memories.sort((a, b) => a.timestamp - b.timestamp);

    // Group memories by time windows
    const timeWindows: Map<number, MemoryItem[]> = new Map();
    const windowSize = 5 * 60 * 1000; // 5 minutes

    for (const memory of sortedMemories) {
      const window = Math.floor(memory.timestamp / windowSize);
      if (!timeWindows.has(window)) {
        timeWindows.set(window, []);
      }
      timeWindows.get(window)!.push(memory);
    }

    // Create patterns for windows with multiple memories
    for (const [window, windowMemories] of timeWindows.entries()) {
      if (windowMemories.length >= 3) {
        patterns.push({
          id: `temporal_${window}`,
          type: 'temporal_cluster',
          pattern: `Temporal clustering of ${windowMemories.length} memories in ${windowSize / 1000 / 60} minute window`,
          confidence: Math.min(1.0, windowMemories.length / 10),
          associatedMemoryIds: windowMemories.map(m => m.id),
          metadata: {
            windowStart: window * windowSize,
            memoryCount: windowMemories.length,
            agents: [...new Set(windowMemories.map(m => m.agentId))]
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Find semantic patterns in memories
   */
  private async findSemanticPatterns(memories: MemoryItem[]): Promise<NeuralPattern[]> {
    const patterns: NeuralPattern[] = [];

    // Group memories by type
    const typeGroups: Map<string, MemoryItem[]> = new Map();
    for (const memory of memories) {
      if (!typeGroups.has(memory.type)) {
        typeGroups.set(memory.type, []);
      }
      typeGroups.get(memory.type)!.push(memory);
    }

    // Create patterns for significant type groups
    for (const [type, typeMemories] of typeGroups.entries()) {
      if (typeMemories.length >= 2) {
        patterns.push({
          id: `semantic_${type}`,
          type: 'semantic_cluster',
          pattern: `Semantic clustering of ${typeMemories.length} ${type} memories`,
          confidence: Math.min(1.0, typeMemories.length / 5),
          associatedMemoryIds: typeMemories.map(m => m.id),
          metadata: {
            memoryType: type,
            memoryCount: typeMemories.length,
            agents: [...new Set(typeMemories.map(m => m.agentId))]
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Find agent interaction patterns
   */
  private findInteractionPatterns(memories: MemoryItem[]): NeuralPattern[] {
    const patterns: NeuralPattern[] = [];

    // Group memories by agent pairs
    const agentPairs: Map<string, MemoryItem[]> = new Map();
    
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const pair = [memories[i].agentId, memories[j].agentId].sort().join('_');
        if (!agentPairs.has(pair)) {
          agentPairs.set(pair, []);
        }
        agentPairs.get(pair)!.push(memories[i], memories[j]);
      }
    }

    // Create patterns for frequent agent interactions
    for (const [pair, pairMemories] of agentPairs.entries()) {
      if (pairMemories.length >= 4) {
        const [agent1, agent2] = pair.split('_');
        patterns.push({
          id: `interaction_${pair}`,
          type: 'agent_interaction',
          pattern: `Agent interaction pattern between ${agent1} and ${agent2} with ${pairMemories.length} interactions`,
          confidence: Math.min(1.0, pairMemories.length / 10),
          associatedMemoryIds: [...new Set(pairMemories.map(m => m.id))],
          metadata: {
            agent1,
            agent2,
            interactionCount: pairMemories.length,
            timeSpan: Math.max(...pairMemories.map(m => m.timestamp)) - 
                     Math.min(...pairMemories.map(m => m.timestamp))
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Perform neural consolidation
   */
  async performConsolidation(): Promise<MemoryConsolidationResult> {
    console.log('🧠 Performing neural consolidation...');

    // Apply decay to importance scores
    this.applyNeuralDecay();

    // Recognize patterns
    const patterns = await this.recognizeNeuralPatterns();

    // Separate memories based on importance threshold
    const consolidated: MemoryItem[] = [];
    const archived: MemoryItem[] = [];

    for (const [memoryId, importanceScore] of this.importanceScores.entries()) {
      const memory = this.workingMemory.get(memoryId);
      if (!memory) continue;

      if (importanceScore >= this.config.consolidationThreshold) {
        consolidated.push(memory);
      } else {
        archived.push(memory);
      }
    }

    // Store consolidated memories in long-term storage
    for (const memory of consolidated) {
      await this.weaviateClient.storeMemory(memory);
      await this.neo4jClient.storeMemory(memory);
    }

    // Store patterns in graph database
    for (const pattern of patterns) {
      await this.neo4jClient.storeNeuralPattern(pattern);
    }

    // Clear working memory
    this.workingMemory.clear();
    this.importanceScores.clear();

    console.log(`✅ Neural consolidation complete: ${consolidated.length} consolidated, ${archived.length} archived, ${patterns.length} patterns recognized`);

    return {
      consolidated,
      archived,
      importanceScores: new Map(this.importanceScores),
      patterns
    };
  }

  /**
   * Trigger consolidation manually
   */
  async triggerConsolidation(): Promise<MemoryConsolidationResult> {
    return this.performConsolidation();
  }

  /**
   * Start automatic consolidation timer
   */
  private startAutomaticConsolidation(): void {
    this.consolidationTimer = setInterval(async () => {
      try {
        await this.performConsolidation();
      } catch (error) {
        console.error('Error during automatic consolidation:', error);
      }
    }, this.config.consolidationInterval);
  }

  /**
   * Stop automatic consolidation
   */
  stopAutomaticConsolidation(): void {
    if (this.consolidationTimer) {
      clearTimeout(this.consolidationTimer);
      this.consolidationTimer = undefined as any; // Type assertion to handle exactOptionalPropertyTypes
    }
  }

  /**
   * Get current working memory status
   */
  getWorkingMemoryStatus(): {
    size: number;
    averageImportance: number;
    oldestMemory: number;
    newestMemory: number;
  } {
    const memories = Array.from(this.workingMemory.values());
    const scores = Array.from(this.importanceScores.values());

    return {
      size: this.workingMemory.size,
      averageImportance: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      oldestMemory: memories.length > 0 ? Math.min(...memories.map(m => m.timestamp)) : 0,
      newestMemory: memories.length > 0 ? Math.max(...memories.map(m => m.timestamp)) : 0
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAutomaticConsolidation();
    this.workingMemory.clear();
    this.importanceScores.clear();
  }
}