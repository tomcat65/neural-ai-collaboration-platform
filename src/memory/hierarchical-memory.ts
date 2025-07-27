import { WeaviateClient } from './weaviate-client';
import { Neo4jClient } from './neo4j-client';
import { 
  MemoryItem, 
  MemoryType, 
  HierarchicalMemory, 
  MemoryConsolidationResult,
  MemorySearchQuery,
  MemorySearchResult 
} from './types';

export class HierarchicalMemorySystem {
  private weaviateClient: WeaviateClient;
  private neo4jClient: Neo4jClient;
  private workingMemory: Map<string, MemoryItem[]> = new Map();
  private consolidationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.weaviateClient = new WeaviateClient();
    this.neo4jClient = new Neo4jClient();
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Hierarchical Memory System...');
    
    await this.weaviateClient.initialize();
    await this.neo4jClient.initialize();
    
    // Start memory consolidation process
    this.startConsolidationProcess();
    
    console.log('✅ Hierarchical Memory System initialized');
  }

  async storeMemory(memory: MemoryItem): Promise<string> {
    // Store in working memory first
    if (!this.workingMemory.has(memory.agentId)) {
      this.workingMemory.set(memory.agentId, []);
    }
    
    const agentWorkingMemory = this.workingMemory.get(memory.agentId)!;
    agentWorkingMemory.push(memory);
    
    // Limit working memory size
    if (agentWorkingMemory.length > 100) {
      agentWorkingMemory.shift();
    }

    // Store in vector database for semantic search
    const vectorId = await this.weaviateClient.storeMemory(memory);
    
    // Store in graph database for relationships
    const graphId = await this.neo4jClient.storeMemory(memory);
    
    console.log(`💾 Memory stored in hierarchical system: ${memory.id}`);
    return memory.id;
  }

  async searchMemories(query: MemorySearchQuery): Promise<MemorySearchResult> {
    const startTime = Date.now();
    
    // Search in working memory first (fastest)
    const workingResults = this.searchWorkingMemory(query);
    
    // Search in vector database for semantic similarity
    const vectorResults = await this.weaviateClient.searchMemories(
      query.query,
      query.agentId,
      query.memoryType,
      query.limit
    );
    
    // Combine and rank results
    const combinedResults = this.combineSearchResults(workingResults, vectorResults);
    
    // Apply filters
    const filteredResults = this.applySearchFilters(combinedResults, query);
    
    const searchTime = Date.now() - startTime;
    
    return {
      memories: filteredResults.slice(query.offset, query.offset + query.limit),
      total: filteredResults.length,
      query: query.query,
      searchTime,
      relevance: filteredResults.map(() => Math.random()), // Placeholder relevance scores
    };
  }

  async getHierarchicalMemory(agentId: string): Promise<HierarchicalMemory> {
    // Get working memory
    const working = this.workingMemory.get(agentId) || [];
    
    // Get recent memories from vector database (short-term)
    const shortTerm = await this.weaviateClient.getAgentMemories(agentId, 50);
    
    // Get older memories (long-term)
    const longTerm = await this.weaviateClient.getAgentMemories(agentId, 200);
    
    // Get episodic memories (time-based)
    const episodic = await this.getEpisodicMemories(agentId);
    
    // Get semantic memories (knowledge-based)
    const semantic = await this.getSemanticMemories(agentId);
    
    return {
      working,
      shortTerm,
      longTerm,
      episodic,
      semantic,
    };
  }

  async consolidateMemories(agentId: string): Promise<MemoryConsolidationResult> {
    console.log(`🔄 Consolidating memories for agent: ${agentId}`);
    
    const working = this.workingMemory.get(agentId) || [];
    const shortTerm = await this.weaviateClient.getAgentMemories(agentId, 100);
    
    const consolidated: MemoryItem[] = [];
    const removed: string[] = [];
    const merged: string[][] = [];
    const newRelationships: any[] = [];
    
    // Group similar memories
    const memoryGroups = this.groupSimilarMemories([...working, ...shortTerm]);
    
    for (const group of memoryGroups) {
      if (group.length === 1) {
        // Single memory, keep as is
        consolidated.push(group[0]);
      } else {
        // Multiple similar memories, merge them
        const mergedMemory = this.mergeMemories(group);
        consolidated.push(mergedMemory);
        merged.push(group.map(m => m.id));
        
        // Create relationships between merged memories
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            newRelationships.push({
              fromMemoryId: group[i].id,
              toMemoryId: group[j].id,
              type: 'SIMILAR',
              strength: 0.8,
              properties: { merged: true },
              timestamp: new Date(),
            });
          }
        }
      }
    }
    
    // Remove old memories from working memory
    this.workingMemory.set(agentId, []);
    
    // Update vector database
    for (const memory of consolidated) {
      await this.weaviateClient.updateMemory(memory.id, memory);
    }
    
    // Create relationships in graph database
    for (const relationship of newRelationships) {
      await this.neo4jClient.createRelationship(
        relationship.fromMemoryId,
        relationship.toMemoryId,
        relationship.type,
        relationship.properties
      );
    }
    
    console.log(`✅ Consolidated ${consolidated.length} memories for agent: ${agentId}`);
    
    return {
      consolidated,
      removed,
      merged,
      newRelationships,
    };
  }

  async getCollaborationInsights(agentId: string): Promise<any> {
    // Get collaboration graph from Neo4j
    const graph = await this.neo4jClient.getAgentCollaborationGraph(agentId);
    
    // Analyze collaboration patterns
    const insights = {
      totalCollaborations: graph.relationships.length,
      activeAgents: new Set(graph.nodes.filter((n: any) => n.type === 'Agent').map((n: any) => n.id)).size,
      memorySharing: graph.relationships.filter((r: any) => r.type === 'SHARES_MEMORY').length,
      taskDependencies: graph.relationships.filter((r: any) => r.type === 'DEPENDS_ON').length,
      knowledgeTransfer: graph.relationships.filter((r: any) => r.type === 'KNOWLEDGE_TRANSFER').length,
    };
    
    return insights;
  }

  private searchWorkingMemory(query: MemorySearchQuery): MemoryItem[] {
    const agentWorkingMemory = this.workingMemory.get(query.agentId || '') || [];
    
    return agentWorkingMemory.filter(memory => {
      // Simple text search in working memory
      const contentMatch = memory.content.toLowerCase().includes(query.query.toLowerCase());
      const typeMatch = !query.memoryType || memory.type === query.memoryType;
      const tagMatch = !query.tags || query.tags.some(tag => memory.tags.includes(tag));
      
      return contentMatch && typeMatch && tagMatch;
    });
  }

  private combineSearchResults(working: MemoryItem[], vector: MemoryItem[]): MemoryItem[] {
    const combined = [...working, ...vector];
    
    // Remove duplicates based on ID
    const unique = new Map<string, MemoryItem>();
    for (const memory of combined) {
      unique.set(memory.id, memory);
    }
    
    return Array.from(unique.values());
  }

  private applySearchFilters(memories: MemoryItem[], query: MemorySearchQuery): MemoryItem[] {
    return memories.filter(memory => {
      // Date range filter
      if (query.dateRange) {
        const memoryDate = memory.timestamp;
        if (memoryDate < query.dateRange.start || memoryDate > query.dateRange.end) {
          return false;
        }
      }
      
      // Priority filter
      if (query.priority) {
        if (memory.priority < query.priority.min || memory.priority > query.priority.max) {
          return false;
        }
      }
      
      return true;
    });
  }

  private async getEpisodicMemories(agentId: string): Promise<MemoryItem[]> {
    // Get memories organized by time periods
    const timeline = await this.neo4jClient.getMemoryTimeline(agentId);
    
    // Group by day/week/month for episodic organization
    const episodic: MemoryItem[] = [];
    const timeGroups = new Map<string, MemoryItem[]>();
    
    for (const memory of timeline) {
      const dateKey = new Date(memory.timestamp).toISOString().split('T')[0]; // Daily grouping
      if (!timeGroups.has(dateKey)) {
        timeGroups.set(dateKey, []);
      }
      timeGroups.get(dateKey)!.push(memory);
    }
    
    // Create episodic memories from time groups
    for (const [date, memories] of timeGroups) {
      if (memories.length > 1) {
        const episodicMemory: MemoryItem = {
          id: `episodic-${date}-${agentId}`,
          agentId,
          type: 'episodic',
          content: `Episodic memory for ${date}: ${memories.length} events`,
          timestamp: new Date(date).getTime(),
          tags: ['episodic', date],
          priority: 7,
          relationships: memories.map(m => m.id),
        };
        episodic.push(episodicMemory);
      }
    }
    
    return episodic;
  }

  private async getSemanticMemories(agentId: string): Promise<MemoryItem[]> {
    // Get knowledge-based memories
    const knowledgeMemories = await this.weaviateClient.searchMemories(
      'knowledge concept understanding',
      agentId,
      'knowledge',
      50
    );
    
    return knowledgeMemories;
  }

  private groupSimilarMemories(memories: MemoryItem[]): MemoryItem[][] {
    const groups: MemoryItem[][] = [];
    const processed = new Set<string>();
    
    for (const memory of memories) {
      if (processed.has(memory.id)) continue;
      
      const group = [memory];
      processed.add(memory.id);
      
      // Find similar memories
      for (const other of memories) {
        if (processed.has(other.id)) continue;
        
        if (this.areMemoriesSimilar(memory, other)) {
          group.push(other);
          processed.add(other.id);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  private areMemoriesSimilar(memory1: MemoryItem, memory2: MemoryItem): boolean {
    // Simple similarity check based on content and tags
    const contentSimilarity = this.calculateContentSimilarity(memory1.content, memory2.content);
    const tagSimilarity = this.calculateTagSimilarity(memory1.tags, memory2.tags);
    
    return contentSimilarity > 0.7 || tagSimilarity > 0.5;
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private calculateTagSimilarity(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 && tags2.length === 0) return 1;
    if (tags1.length === 0 || tags2.length === 0) return 0;
    
    const intersection = tags1.filter(tag => tags2.includes(tag));
    const union = new Set([...tags1, ...tags2]);
    
    return intersection.length / union.size;
  }

  private mergeMemories(memories: MemoryItem[]): MemoryItem {
    // Merge multiple similar memories into one
    const merged: MemoryItem = {
      id: `merged-${Date.now()}`,
      agentId: memories[0].agentId,
      type: memories[0].type,
      content: this.mergeContent(memories.map(m => m.content)),
      timestamp: Math.max(...memories.map(m => m.timestamp)),
      tags: this.mergeTags(memories.map(m => m.tags)),
      priority: Math.max(...memories.map(m => m.priority)),
      relationships: memories.flatMap(m => m.relationships),
    };
    
    return merged;
  }

  private mergeContent(contents: string[]): string {
    // Simple content merging - could be improved with NLP
    return contents.join(' | ');
  }

  private mergeTags(tagsArrays: string[][]): string[] {
    const allTags = tagsArrays.flat();
    return [...new Set(allTags)];
  }

  private startConsolidationProcess(): void {
    // Run consolidation every 5 minutes
    this.consolidationInterval = setInterval(async () => {
      const agentIds = Array.from(this.workingMemory.keys());
      
      for (const agentId of agentIds) {
        try {
          await this.consolidateMemories(agentId);
        } catch (error) {
          console.error(`❌ Error consolidating memories for ${agentId}:`, error);
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  async shutdown(): Promise<void> {
    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
    }
    
    await this.neo4jClient.close();
    console.log('🛑 Hierarchical Memory System shutdown complete');
  }
} 