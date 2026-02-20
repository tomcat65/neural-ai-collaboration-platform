import weaviate, { WeaviateClient as WeaviateClientType, ObjectsBatcher } from 'weaviate-ts-client';
import { MemoryItem, MemoryType, VectorSearchResult } from './types';

export class WeaviateClient {
  private client: WeaviateClientType;
  private readonly className = 'AIMemory';

  constructor() {
    // Allow overriding via env WEAVIATE_URL=http://host:port
    const url = process.env.WEAVIATE_URL || 'http://weaviate:8080';
    const u = new URL(url);
    this.client = weaviate.client({ scheme: u.protocol.replace(':', ''), host: u.host });
  }

  async initialize(): Promise<void> {
    try {
      // Create schema for AI memory
      const vectorizer = process.env.WEAVIATE_VECTORIZER || 'text2vec-transformers';
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
            name: 'tenantId',
            dataType: ['string'],
            description: 'Tenant ID for multi-tenant isolation (Phase 5)',
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
        vectorizer,
        moduleConfig: vectorizer ? { [vectorizer]: { vectorizeClassName: false } } : undefined,
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
        tenantId: memory.tenantId || 'default', // Multi-tenant isolation
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
      tenantId?: string; // Multi-tenant isolation
      limit?: number;
      filters?: any;
    },
    agentId?: string,
    memoryType?: MemoryType,
    limit: number = 10,
    tenantId?: string // Multi-tenant isolation
  ): Promise<MemoryItem[]> {
    try {
      let query: string;
      let searchLimit: number;
      let whereFilter: any = {};
      let effectiveTenantId: string | undefined;

      if (typeof queryOrOptions === 'string') {
        query = queryOrOptions;
        searchLimit = limit;
        effectiveTenantId = tenantId;
        if (agentId) {
          whereFilter.agentId = agentId;
        }
        if (memoryType) {
          whereFilter.memoryType = memoryType;
        }
      } else {
        query = queryOrOptions.query;
        searchLimit = queryOrOptions.limit || limit;
        effectiveTenantId = queryOrOptions.tenantId || tenantId;
        if (queryOrOptions.agentId) {
          whereFilter.agentId = queryOrOptions.agentId;
        }
        if (queryOrOptions.filters) {
          whereFilter = { ...whereFilter, ...queryOrOptions.filters };
        }
      }

      // Multi-tenant isolation: always filter by tenantId when provided
      if (effectiveTenantId) {
        whereFilter.tenantId = effectiveTenantId;
      }

      // Build Weaviate where clause for tenant isolation
      const tenantWhere = effectiveTenantId
        ? { path: ['tenantId'], operator: 'Equal' as const, valueText: effectiveTenantId }
        : undefined;

      let result: any;
      try {
        // Preferred: vector semantic search
        let builder = this.client.graphql
          .get()
          .withClassName(this.className)
          .withFields('agentId tenantId memoryType content timestamp tags priority relationships _additional { id score }')
          // @ts-ignore types for nearText depend on module
          .withNearText({ concepts: [query] })
          .withLimit(searchLimit);
        if (tenantWhere) builder = builder.withWhere(tenantWhere);
        result = await builder.do();
      } catch (e) {
        // Fallback: LIKE text search if vectorizer/module not available
        const contentFilter = { path: ['content'], operator: 'Like' as const, valueText: `*${query}*` };
        const combinedWhere = tenantWhere
          ? { operator: 'And' as const, operands: [tenantWhere, contentFilter] }
          : contentFilter;
        result = await this.client.graphql
          .get()
          .withClassName(this.className)
          .withFields('agentId tenantId memoryType content timestamp tags priority relationships _additional { id }')
          .withWhere(combinedWhere)
          .withLimit(searchLimit)
          .do();
      }

      return result.data.Get[this.className].map((item: any) => ({
        id: item._additional.id,
        agentId: item.agentId,
        tenantId: item.tenantId || 'default',
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

  async getAgentMemories(agentId: string, limit: number = 50, tenantId?: string): Promise<MemoryItem[]> {
    try {
      // Build where clause with multi-tenant isolation
      const whereConditions: any[] = [
        {
          path: ['agentId'],
          operator: 'Equal',
          valueString: agentId,
        }
      ];

      // Multi-tenant isolation: filter by tenantId when provided
      if (tenantId) {
        whereConditions.push({
          path: ['tenantId'],
          operator: 'Equal',
          valueString: tenantId,
        });
      }

      const whereClause = whereConditions.length === 1
        ? whereConditions[0]
        : { operator: 'And', operands: whereConditions };

      const result = await this.client.graphql
        .get()
        .withClassName(this.className)
        .withWhere(whereClause)
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
