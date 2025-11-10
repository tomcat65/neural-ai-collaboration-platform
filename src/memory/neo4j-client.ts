import neo4j, { Driver, Session, Transaction } from 'neo4j-driver';
import { MemoryItem, MemoryType, AgentMemory, Relationship } from './types';

export class Neo4jMemoryClient {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      'bolt://neo4j:7687',
      neo4j.auth.basic('neo4j', 'password')
    );
  }

  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      // Create constraints and indexes
      await session.run(`
        CREATE CONSTRAINT memory_id IF NOT EXISTS
        FOR (m:Memory) REQUIRE m.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT agent_id IF NOT EXISTS
        FOR (a:Agent) REQUIRE a.id IS UNIQUE
      `);

      await session.run(`
        CREATE INDEX memory_type IF NOT EXISTS
        FOR (m:Memory) ON (m.type)
      `);

      await session.run(`
        CREATE INDEX memory_timestamp IF NOT EXISTS
        FOR (m:Memory) ON (m.timestamp)
      `);

      console.log('✅ Neo4j schema initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Neo4j schema:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  // Ensure property values conform to Neo4j primitives (or arrays of primitives)
  private toNeoProp(value: any): any {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (Array.isArray(value)) {
      // If array contains only primitives, return as-is; otherwise stringify whole array
      const allPrimitive = value.every((v) => {
        const tv = typeof v;
        return v === null || tv === 'string' || tv === 'number' || tv === 'boolean';
      });
      return allPrimitive ? value : JSON.stringify(value);
    }
    // Fallback: store complex objects as JSON string
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  async storeMemory(memory: MemoryItem): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (m:Memory {
          id: $id,
          type: $type,
          content: $content,
          agentId: $agentId,
          timestamp: $timestamp,
          tags: $tags,
          metadata: $metadata
        })
      `, {
        id: memory.id,
        type: memory.type,
        content: this.toNeoProp(memory.content),
        agentId: memory.agentId,
        timestamp: new Date(memory.timestamp).toISOString(),
        tags: Array.isArray(memory.tags) ? memory.tags : [],
        metadata: this.toNeoProp(memory.metadata || {}),
      });
    } catch (error) {
      console.error('❌ Error storing memory in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getMemory(id: string): Promise<MemoryItem | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (m:Memory {id: $id})
        RETURN m
      `, { id });

      if (result.records.length === 0) return null;

      const record = result.records[0].get('m').properties;
      return {
        ...record,
        timestamp: new Date(record.timestamp).getTime()
      };
    } catch (error) {
      console.error('❌ Error getting memory from Neo4j:', error);
      return null;
    } finally {
      await session.close();
    }
  }

  async createRelationship(
    fromMemoryId: string,
    toMemoryId: string,
    relationshipType: string,
    properties: Record<string, any> = {}
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        MATCH (from:Memory {id: $fromId})
        MATCH (to:Memory {id: $toId})
        MERGE (from)-[r:${relationshipType.toUpperCase()}]->(to)
        SET r += $properties
      `, {
        fromId: fromMemoryId,
        toId: toMemoryId,
        properties,
      });

      console.log(`🔗 Relationship created: ${fromMemoryId} -[${relationshipType}]-> ${toMemoryId}`);
    } catch (error) {
      console.error('❌ Error creating relationship in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getRelatedMemories(
    memoryId: string,
    relationshipType?: string,
    depth: number = 2
  ): Promise<MemoryItem[]> {
    const session = this.driver.session();
    try {
      const relationshipFilter = relationshipType ? `:${relationshipType.toUpperCase()}` : '';
      
      const result = await session.run(`
        MATCH (start:Memory {id: $memoryId})
        CALL apoc.path.subgraphNodes(start, {
          maxLevel: $depth,
          relationshipFilter: '${relationshipFilter}'
        })
        YIELD node
        WHERE node <> start
        RETURN node
        ORDER BY node.timestamp DESC
      `, {
        memoryId,
        depth,
      });

      return result.records.map(record => {
        const node = record.get('node').properties;
        return {
          id: node.id,
          agentId: node.agentId,
          type: node.type as MemoryType,
          content: node.content,
          timestamp: new Date(node.timestamp).getTime(), // Convert to number
          tags: node.tags || [],
          priority: node.priority || 5,
          relationships: node.relationships || [],
        };
      });
    } catch (error) {
      console.error('❌ Error getting related memories from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async findRelatedMemories(memoryId: string, _limit: number = 10): Promise<MemoryItem[]> {
    // Alias for getRelatedMemories for compatibility
    return this.getRelatedMemories(memoryId, undefined, 1);
  }

  async storeNeuralPattern(pattern: any): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (p:NeuralPattern {
          id: $id,
          type: $type,
          pattern: $pattern,
          confidence: $confidence,
          associatedMemoryIds: $associatedMemoryIds,
          metadata: $metadata
        })
      `, {
        id: pattern.id,
        type: pattern.type,
        pattern: this.toNeoProp(pattern.pattern),
        confidence: pattern.confidence,
        associatedMemoryIds: this.toNeoProp(pattern.associatedMemoryIds),
        metadata: this.toNeoProp(pattern.metadata),
      });
    } catch (error) {
      console.error('❌ Error storing neural pattern in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async storeLearningPattern(pattern: any): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (p:LearningPattern {
          id: $id,
          type: $type,
          featureVector: $featureVector,
          confidence: $confidence,
          occurrenceCount: $occurrenceCount,
          lastSeen: $lastSeen,
          associatedMemoryIds: $associatedMemoryIds,
          metadata: $metadata
        })
      `, {
        id: pattern.id,
        type: pattern.type,
        featureVector: this.toNeoProp(pattern.featureVector),
        confidence: pattern.confidence,
        occurrenceCount: pattern.occurrenceCount,
        lastSeen: pattern.lastSeen,
        associatedMemoryIds: this.toNeoProp(pattern.associatedMemoryIds),
        metadata: this.toNeoProp(pattern.metadata),
      });
    } catch (error) {
      console.error('❌ Error storing learning pattern in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async storePredictionEvaluation(evaluation: any): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (e:PredictionEvaluation {
          predictionId: $predictionId,
          actualOutcome: $actualOutcome,
          accuracy: $accuracy,
          typeAccuracy: $typeAccuracy,
          agentAccuracy: $agentAccuracy,
          timingAccuracy: $timingAccuracy,
          timestamp: $timestamp
        })
      `, evaluation);
    } catch (error) {
      console.error('❌ Error storing prediction evaluation in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getPredictionEvaluations(): Promise<any[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (e:PredictionEvaluation)
        RETURN e
        ORDER BY e.timestamp DESC
        LIMIT 100
      `);
      return result.records.map(record => record.get('e').properties) as any[];
    } catch (error) {
      console.error('❌ Error getting prediction evaluations from Neo4j:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  async getLearningPatterns(): Promise<any[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (p:LearningPattern)
        RETURN p
        ORDER BY p.lastSeen DESC
      `);
      return result.records.map(record => record.get('p').properties) as any[];
    } catch (error) {
      console.error('❌ Error getting learning patterns from Neo4j:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  async deleteLearningPattern(patternId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        MATCH (p:LearningPattern {id: $patternId})
        DELETE p
      `, { patternId });
    } catch (error) {
      console.error('❌ Error deleting learning pattern from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async createCollaboration(collaboration: any): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (c:Collaboration {
          id: $id,
          name: $name,
          description: $description,
          status: $status,
          createdAt: $createdAt,
          metadata: $metadata
        })
      `, {
        ...collaboration,
        metadata: this.toNeoProp(collaboration?.metadata)
      });
    } catch (error) {
      console.error('❌ Error creating collaboration in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async addAgentToCollaboration(collaborationId: string, agentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        MATCH (c:Collaboration {id: $collaborationId})
        MERGE (a:Agent {id: $agentId})
        MERGE (a)-[:PARTICIPATES_IN]->(c)
      `, { collaborationId, agentId });
    } catch (error) {
      console.error('❌ Error adding agent to collaboration in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async removeAgentFromCollaboration(collaborationId: string, agentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        MATCH (a:Agent {id: $agentId})-[r:PARTICIPATES_IN]->(c:Collaboration {id: $collaborationId})
        DELETE r
      `, { collaborationId, agentId });
    } catch (error) {
      console.error('❌ Error removing agent from collaboration in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async storeSharedMemory(memory: any): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE (m:SharedMemory {
          id: $id,
          content: $content,
          agentId: $agentId,
          collaborationId: $collaborationId,
          timestamp: $timestamp,
          metadata: $metadata
        })
      `, {
        ...memory,
        content: this.toNeoProp(memory?.content),
        metadata: this.toNeoProp(memory?.metadata)
      });
    } catch (error) {
      console.error('❌ Error storing shared memory in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getSharedMemoryIds(collaborationId: string): Promise<string[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (m:SharedMemory {collaborationId: $collaborationId})
        RETURN m.id as id
        ORDER BY m.timestamp DESC
      `, { collaborationId });
      return result.records.map(record => record.get('id')) as string[];
    } catch (error) {
      console.error('❌ Error getting shared memory IDs from Neo4j:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  async getAgentCollaborationGraph(agentId: string, limit: number = 50): Promise<any> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (a:Agent {id: $agentId})-[r:PARTICIPATES_IN]->(c:Collaboration)
        WITH a, c, r
        OPTIONAL MATCH (c)-[:SHARES_MEMORY]->(m:SharedMemory)
        RETURN {
          agent: a,
          collaborations: collect(DISTINCT c),
          sharedMemories: collect(DISTINCT m),
          relationships: collect(DISTINCT r)
        } as graph
        LIMIT $limit
      `, { agentId, limit });

      if (result.records.length === 0) {
        return {
          agent: null,
          collaborations: [],
          sharedMemories: [],
          relationships: []
        };
      }

      return result.records[0].get('graph').properties;
    } catch (error) {
      console.error('❌ Error getting agent collaboration graph from Neo4j:', error);
      return {
        agent: null,
        collaborations: [],
        sharedMemories: [],
        relationships: []
      };
    } finally {
      await session.close();
    }
  }

  async findMemoryPatterns(pattern: string, limit: number = 10): Promise<any[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (m:Memory)
        WHERE m.content CONTAINS $pattern
        OPTIONAL MATCH (m)-[r]-(related:Memory)
        RETURN m, collect(related) as related
        ORDER BY m.timestamp DESC
        LIMIT $limit
      `, {
        pattern,
        limit,
      });

      return result.records.map(record => ({
        memory: record.get('m').properties,
        related: record.get('related').map((r: any) => r.properties),
      }));
    } catch (error) {
      console.error('❌ Error finding memory patterns in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getMemoryTimeline(agentId: string, startDate?: Date, endDate?: Date): Promise<MemoryItem[]> {
    const session = this.driver.session();
    try {
      let query = `
        MATCH (a:Agent {id: $agentId})-[:HAS_MEMORY]->(m:Memory)
      `;

      const params: any = { agentId };

      if (startDate || endDate) {
        query += ' WHERE ';
        if (startDate) {
          query += 'm.timestamp >= $startDate';
          params.startDate = new Date(startDate).toISOString();
        }
        if (endDate) {
          query += startDate ? ' AND ' : '';
          query += 'm.timestamp <= $endDate';
          params.endDate = new Date(endDate).toISOString();
        }
      }

      query += `
        RETURN m
        ORDER BY m.timestamp ASC
      `;

      const result = await session.run(query, params);

      return result.records.map(record => {
        const node = record.get('m').properties;
        return {
          id: node.id,
          agentId: node.agentId,
          type: node.type as MemoryType,
          content: node.content,
          timestamp: new Date(node.timestamp).getTime(), // Convert to number
          tags: node.tags || [],
          priority: node.priority || 5,
          relationships: node.relationships || [],
        };
      });
    } catch (error) {
      console.error('❌ Error getting memory timeline from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async cleanup(): Promise<void> {
    try {
      // Cleanup logic for Neo4j
      console.log('🧹 Neo4j cleanup completed');
    } catch (error) {
      console.error('❌ Error during Neo4j cleanup:', error);
    }
  }
} 

// Export alias for compatibility
export { Neo4jMemoryClient as Neo4jClient }; 
