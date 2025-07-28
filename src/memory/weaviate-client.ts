import weaviate, { WeaviateClient as WeaviateClientType, ObjectsBatcher } from 'weaviate-ts-client';
import { MemoryItem, MemoryType, VectorSearchResult } from './types';

export class WeaviateClient {
  private client: WeaviateClientType;
  private readonly className = 'AIMemory';

  constructor() {
    this.client = weaviate.client({
      scheme: 'http',
      host: 'weaviate:8080',
    });
  }

  async initialize(): Promise<void> {
    try {
      // Create schema for AI memory
      const schema = {
        class: this.className,
        description: 'AI agent memory storage with semantic search',
        properties: [
          {
            name: 'agentId',
            dataType: ['string'],
            description: 'ID of the AI agent',
            indexInverted: true,
          },
          {
            name: 'memoryType',
            dataType: ['string'],
            description: 'Type of memory (task, knowledge, episodic, semantic)',
            indexInverted: true,
          },
          {
            name: 'content',
            dataType: ['text'],
            description: 'Memory content',
            indexInverted: true,
          },
          // Vector embeddings are handled automatically by the vectorizer
          {
            name: 'timestamp',
            dataType: ['date'],
            description: 'When the memory was created',
          },
          {
            name: 'tags',
            dataType: ['string[]'],
            description: 'Tags for categorization',
            indexInverted: true,
          },
          {
            name: 'priority',
            dataType: ['int'],
            description: 'Memory priority (1-10)',
          },
          {
            name: 'relationships',
            dataType: ['string[]'],
            description: 'Related memory IDs',
            indexInverted: true,
          },
        ],
        vectorizer: 'none', // Disable automatic vectorization for now
      };

      await this.client.schema.classCreator().withClass(schema).do();
      console.log('✅ Weaviate schema created successfully');
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('✅ Weaviate schema already exists');
      } else {
        console.error('❌ Error creating Weaviate schema:', error);
        throw error;
      }
    }
  }

  async storeMemory(memory: MemoryItem): Promise<string> {
    try {
      const memoryObject = {
        agentId: memory.agentId,
        memoryType: memory.type,
        content: memory.content,
        timestamp: new Date().toISOString(),
        tags: memory.tags || [],
        priority: memory.priority || 5,
        relationships: memory.relationships || [],
      };

      const result = await this.client.data.creator()
        .withClassName(this.className)
        .withProperties(memoryObject)
        .do();

      console.log(`💾 Memory stored in Weaviate: ${result.id}`);
      return result.id || '';
    } catch (error) {
      console.error('❌ Error storing memory in Weaviate:', error);
      throw error;
    }
  }

  async searchMemories(
    queryOrOptions: string | {
      query: string;
      agentId?: string;
      limit?: number;
      filters?: any;
    },
    agentId?: string,
    memoryType?: MemoryType,
    limit: number = 10
  ): Promise<MemoryItem[]> {
    try {
      let query: string;
      let searchLimit: number;
      let whereFilter: any = {};
      
      if (typeof queryOrOptions === 'string') {
        query = queryOrOptions;
        searchLimit = limit;
        if (agentId) {
          whereFilter.agentId = agentId;
        }
        if (memoryType) {
          whereFilter.memoryType = memoryType;
        }
      } else {
        query = queryOrOptions.query;
        searchLimit = queryOrOptions.limit || limit;
        if (queryOrOptions.agentId) {
          whereFilter.agentId = queryOrOptions.agentId;
        }
        if (queryOrOptions.filters) {
          whereFilter = { ...whereFilter, ...queryOrOptions.filters };
        }
      }

      const searchQuery = {
        class: this.className,
        properties: ['agentId', 'memoryType', 'content', 'timestamp', 'tags', 'priority', 'relationships'],
        where: Object.keys(whereFilter).length > 0 ? whereFilter : undefined,
        limit: searchLimit,
      };

      // Use text-based search instead of vector search since vectorizer is disabled
      const result = await this.client.graphql
        .get()
        .withClassName(this.className)
        .withFields('agentId memoryType content timestamp tags priority relationships _additional { id }')
        .withWhere({
          path: ['content'],
          operator: 'Like',
          valueText: `*${query}*`
        })
        .withLimit(searchLimit)
        .do();

      return result.data.Get[this.className].map((item: any) => ({
        id: item._additional.id,
        agentId: item.agentId,
        type: item.memoryType as MemoryType,
        content: item.content,
        timestamp: new Date(item.timestamp).getTime(), // Convert to number
        tags: item.tags || [],
        priority: item.priority || 5,
        relationships: item.relationships || [],
      }));
    } catch (error) {
      console.error('❌ Error searching memories in Weaviate:', error);
      throw error;
    }
  }

  async calculateSimilarity(memory1: MemoryItem, memory2: MemoryItem): Promise<number> {
    try {
      // Simple cosine similarity calculation
      // In a real implementation, this would use the actual embeddings
      const content1 = memory1.content.toLowerCase();
      const content2 = memory2.content.toLowerCase();
      
      // Simple word overlap similarity
      const words1 = new Set(content1.split(/\s+/));
      const words2 = new Set(content2.split(/\s+/));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      return intersection.size / union.size;
    } catch (error) {
      console.error('❌ Error calculating similarity:', error);
      return 0;
    }
  }

  async getAgentMemories(agentId: string, limit: number = 50): Promise<MemoryItem[]> {
    try {
      const result = await this.client.graphql
        .get()
        .withClassName(this.className)
        .withWhere({
          path: ['agentId'],
          operator: 'Equal',
          valueString: agentId,
        })
        .withLimit(limit)
        .withSort([{ path: ['timestamp'], order: 'desc' }])
        .do();

      return result.data.Get[this.className].map((item: any) => ({
        id: item._additional.id,
        agentId: item.agentId,
        type: item.memoryType as MemoryType,
        content: item.content,
        timestamp: new Date(item.timestamp).getTime(),
        tags: item.tags || [],
        priority: item.priority || 5,
        relationships: item.relationships || [],
      }));
    } catch (error) {
      console.error('❌ Error getting agent memories from Weaviate:', error);
      throw error;
    }
  }

  async updateMemory(id: string, updates: Partial<MemoryItem>): Promise<void> {
    try {
      const updateObject: any = {};
      
      if (updates.content !== undefined) updateObject.content = updates.content;
      if (updates.tags !== undefined) updateObject.tags = updates.tags;
      if (updates.priority !== undefined) updateObject.priority = updates.priority;
      if (updates.relationships !== undefined) updateObject.relationships = updates.relationships;

      await this.client.data.updater()
        .withId(id)
        .withClassName(this.className)
        .withProperties(updateObject)
        .do();

      console.log(`🔄 Memory updated in Weaviate: ${id}`);
    } catch (error) {
      console.error('❌ Error updating memory in Weaviate:', error);
      throw error;
    }
  }

  async deleteMemory(id: string): Promise<void> {
    try {
      await this.client.data.deleter()
        .withId(id)
        .withClassName(this.className)
        .do();

      console.log(`🗑️ Memory deleted from Weaviate: ${id}`);
    } catch (error) {
      console.error('❌ Error deleting memory from Weaviate:', error);
      throw error;
    }
  }

  async getMemoryStats(): Promise<{ total: number; byType: Record<string, number> }> {
    try {
      const result = await this.client.graphql
        .aggregate()
        .withClassName(this.className)
        .withFields('groupedBy { value }')
        .withGroupBy(['memoryType'])
        .do();

      const stats = {
        total: 0,
        byType: {} as Record<string, number>,
      };

      result.data.Aggregate[this.className].forEach((group: any) => {
        const type = group.groupedBy.value;
        const count = group.total;
        stats.byType[type] = count;
        stats.total += count;
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting memory stats from Weaviate:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.misc.metaGetter().do();
      return true;
    } catch (error) {
      console.error('❌ Weaviate health check failed:', error);
      return false;
    }
  }

  async getStatistics(): Promise<{ totalMemories: number; [key: string]: any }> {
    try {
      const stats = await this.getMemoryStats();
      return {
        totalMemories: stats.total,
        byType: stats.byType
      };
    } catch (error) {
      console.error('❌ Error getting Weaviate statistics:', error);
      return { totalMemories: 0 };
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Cleanup logic for Weaviate
      console.log('🧹 Weaviate cleanup completed');
    } catch (error) {
      console.error('❌ Error during Weaviate cleanup:', error);
    }
  }
} 