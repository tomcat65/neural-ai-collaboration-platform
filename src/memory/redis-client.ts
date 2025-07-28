import { createClient, RedisClientType } from 'redis';

export interface RedisMemoryData {
  id: string;
  agentId: string;
  content: any;
  type: string;
  timestamp: Date;
  ttl?: number;
}

export class RedisClient {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private readonly defaultTTL = 3600; // 1 hour default TTL

  constructor(url: string = 'redis://localhost:6379') {
    this.client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
      }
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('🔌 Redis client disconnected');
      this.isConnected = false;
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('✅ Redis client initialized');
    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('❌ Redis health check failed:', error);
      return false;
    }
  }

  // Cache memory data with optional TTL
  async cacheMemory(key: string, data: RedisMemoryData, ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) {
        console.warn('⚠️ Redis not connected, skipping cache operation');
        return;
      }

      const cacheData = {
        ...data,
        cachedAt: new Date().toISOString()
      };

      const ttlSeconds = ttl || this.defaultTTL;
      await this.client.setEx(key, ttlSeconds, JSON.stringify(cacheData));

      console.log(`💾 Cached memory: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.error(`❌ Failed to cache memory ${key}:`, error);
    }
  }

  // Retrieve cached memory data
  async getCachedMemory(key: string): Promise<RedisMemoryData | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const cached = await this.client.get(key);
      if (!cached) return null;

      return JSON.parse(cached);
    } catch (error) {
      console.error(`❌ Failed to get cached memory ${key}:`, error);
      return null;
    }
  }

  // Cache search results
  async cacheSearchResults(query: string, results: any[], ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) return;

      const cacheKey = `search:${Buffer.from(query).toString('base64')}`;
      const cacheData = {
        query,
        results,
        count: results.length,
        cachedAt: new Date().toISOString()
      };

      const ttlSeconds = ttl || 300; // 5 minutes for search results
      await this.client.setEx(cacheKey, ttlSeconds, JSON.stringify(cacheData));

      console.log(`🔍 Cached search results for: "${query}" (${results.length} results)`);
    } catch (error) {
      console.error(`❌ Failed to cache search results for "${query}":`, error);
    }
  }

  // Get cached search results
  async getCachedSearchResults(query: string): Promise<any[] | null> {
    try {
      if (!this.isConnected) return null;

      const cacheKey = `search:${Buffer.from(query).toString('base64')}`;
      const cached = await this.client.get(cacheKey);
      
      if (!cached) return null;

      const data = JSON.parse(cached);
      console.log(`⚡ Retrieved cached search results for: "${query}" (${data.count} results)`);
      return data.results;
    } catch (error) {
      console.error(`❌ Failed to get cached search results for "${query}":`, error);
      return null;
    }
  }

  // Cache agent memory with agent-specific key
  async cacheAgentMemory(agentId: string, memoryId: string, data: any, ttl?: number): Promise<void> {
    const key = `agent:${agentId}:memory:${memoryId}`;
    await this.cacheMemory(key, {
      id: memoryId,
      agentId,
      content: data,
      type: 'agent_memory',
      timestamp: new Date()
    }, ttl);
  }

  // Get cached agent memory
  async getCachedAgentMemory(agentId: string, memoryId: string): Promise<any | null> {
    const key = `agent:${agentId}:memory:${memoryId}`;
    const cached = await this.getCachedMemory(key);
    return cached?.content || null;
  }

  // Cache frequently accessed data with tags
  async cacheWithTags(key: string, data: any, tags: string[], ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) return;

      // Store the main data
      await this.cacheMemory(key, {
        id: key,
        agentId: 'system',
        content: data,
        type: 'tagged_cache',
        timestamp: new Date()
      }, ttl);

      // Store tag mappings for invalidation
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        await this.client.sAdd(tagKey, key);
        if (ttl) {
          await this.client.expire(tagKey, ttl);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to cache with tags ${key}:`, error);
    }
  }

  // Invalidate cache by tags
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      if (!this.isConnected) return;

      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.client.sMembers(tagKey);
        
        if (keys.length > 0) {
          await this.client.del(keys);
          await this.client.del(tagKey);
          console.log(`🗑️ Invalidated ${keys.length} cached entries for tag: ${tag}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to invalidate by tags:`, error);
    }
  }

  // Get cache statistics
  async getCacheStats(): Promise<any> {
    try {
      if (!this.isConnected) {
        return { connected: false };
      }

      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      const stats = await this.client.info('stats');

      return {
        connected: true,
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
        stats: this.parseRedisInfo(stats)
      };
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error);
      return { connected: false, error: error.message };
    }
  }

  // Clear all cache
  async clearCache(): Promise<void> {
    try {
      if (!this.isConnected) return;

      await this.client.flushAll();
      console.log('🧹 Redis cache cleared');
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
    }
  }

  // Parse Redis INFO command output
  private parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    });

    return result;
  }

  async close(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.quit();
        console.log('🔌 Redis client closed');
      }
    } catch (error) {
      console.error('❌ Error closing Redis client:', error);
    }
  }
}