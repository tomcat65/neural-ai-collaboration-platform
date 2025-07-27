import { EventEmitter } from 'events';

export interface IMLMemoryIntegration {
  storeMLData(collection: string, data: MLData): Promise<void>;
  retrieveMLData(collection: string, query: MLQuery): Promise<MLData[]>;
  updateMLModel(modelId: string, modelData: MLModelData): Promise<void>;
  getMLModel(modelId: string): Promise<MLModelData | null>;
  getMLStatistics(): Promise<MLStatistics>;
}

export interface MLData {
  id: string;
  type: 'performance' | 'optimization' | 'learning' | 'prediction';
  nodeId: string;
  data: any;
  metadata: {
    timestamp: Date;
    context: Record<string, any>;
    version: string;
  };
}

export interface MLQuery {
  type?: string;
  nodeId?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  filters?: Record<string, any>;
}

export interface MLModelData {
  modelId: string;
  modelType: 'learner' | 'predictor' | 'optimizer';
  version: string;
  data: any;
  metadata: {
    created: Date;
    lastUpdated: Date;
    accuracy: number;
    trainingSamples: number;
  };
}

export interface MLStatistics {
  totalDataPoints: number;
  dataByType: Record<string, number>;
  nodesWithData: number;
  lastDataUpdate: Date;
  storageSize: number;
}

export class MLMemoryIntegration extends EventEmitter implements IMLMemoryIntegration {
  private memoryServerUrl: string;
  private collections: Set<string> = new Set();
  private cache: Map<string, MLData[]> = new Map();
  private modelCache: Map<string, MLModelData> = new Map();

  constructor(memoryServerUrl: string = 'http://localhost:5000') {
    super();
    this.memoryServerUrl = memoryServerUrl;
    console.log('💾 MLMemoryIntegration initialized');
  }

  async storeMLData(collection: string, data: MLData): Promise<void> {
    console.log(`💾 Storing ML data in collection: ${collection}`);
    
    try {
      // Add to cache
      if (!this.cache.has(collection)) {
        this.cache.set(collection, []);
      }
      this.cache.get(collection)!.push(data);
      
      // Store in Memory Server
      await this.storeInMemoryServer(collection, data);
      
      this.collections.add(collection);
      this.emit('data.stored', { collection, dataId: data.id });
      
    } catch (error) {
      console.error(`❌ Error storing ML data: ${error}`);
      this.emit('error', { operation: 'store', error });
      throw error;
    }
  }

  async retrieveMLData(collection: string, query: MLQuery): Promise<MLData[]> {
    console.log(`💾 Retrieving ML data from collection: ${collection}`);
    
    try {
      // Try cache first
      const cachedData = this.cache.get(collection) || [];
      let filteredData = this.filterData(cachedData, query);
      
      // If cache doesn't have enough data, fetch from Memory Server
      if (filteredData.length < (query.limit || 100)) {
        const serverData = await this.retrieveFromMemoryServer(collection, query);
        filteredData = [...filteredData, ...serverData];
        
        // Update cache
        this.cache.set(collection, [...cachedData, ...serverData]);
      }
      
      // Apply limit
      if (query.limit) {
        filteredData = filteredData.slice(0, query.limit);
      }
      
      this.emit('data.retrieved', { collection, count: filteredData.length });
      return filteredData;
      
    } catch (error) {
      console.error(`❌ Error retrieving ML data: ${error}`);
      this.emit('error', { operation: 'retrieve', error });
      throw error;
    }
  }

  async updateMLModel(modelId: string, modelData: MLModelData): Promise<void> {
    console.log(`💾 Updating ML model: ${modelId}`);
    
    try {
      // Update cache
      this.modelCache.set(modelId, modelData);
      
      // Store in Memory Server
      await this.storeModelInMemoryServer(modelId, modelData);
      
      this.emit('model.updated', { modelId, version: modelData.version });
      
    } catch (error) {
      console.error(`❌ Error updating ML model: ${error}`);
      this.emit('error', { operation: 'updateModel', error });
      throw error;
    }
  }

  async getMLModel(modelId: string): Promise<MLModelData | null> {
    console.log(`💾 Retrieving ML model: ${modelId}`);
    
    try {
      // Try cache first
      const cachedModel = this.modelCache.get(modelId);
      if (cachedModel) {
        return cachedModel;
      }
      
      // Fetch from Memory Server
      const serverModel = await this.retrieveModelFromMemoryServer(modelId);
      if (serverModel) {
        this.modelCache.set(modelId, serverModel);
      }
      
      return serverModel;
      
    } catch (error) {
      console.error(`❌ Error retrieving ML model: ${error}`);
      this.emit('error', { operation: 'getModel', error });
      throw error;
    }
  }

  async getMLStatistics(): Promise<MLStatistics> {
    console.log('💾 Retrieving ML statistics');
    
    try {
      const stats: MLStatistics = {
        totalDataPoints: 0,
        dataByType: {},
        nodesWithData: 0,
        lastDataUpdate: new Date(0),
        storageSize: 0
      };
      
      // Calculate statistics from cache
      for (const [collection, data] of this.cache) {
        stats.totalDataPoints += data.length;
        
        for (const item of data) {
          // Count by type
          stats.dataByType[item.type] = (stats.dataByType[item.type] || 0) + 1;
          
          // Track unique nodes
          (stats.nodesWithData as any).add(item.nodeId);
          
          // Track last update
          if (item.metadata.timestamp > stats.lastDataUpdate) {
            stats.lastDataUpdate = item.metadata.timestamp;
          }
        }
      }
      
      // Convert Set to number
      stats.nodesWithData = (stats.nodesWithData as any).size;
      
      // Estimate storage size (rough calculation)
      stats.storageSize = JSON.stringify(this.cache).length;
      
      return stats;
      
    } catch (error) {
      console.error(`❌ Error retrieving ML statistics: ${error}`);
      this.emit('error', { operation: 'getStatistics', error });
      throw error;
    }
  }

  private async storeInMemoryServer(collection: string, data: MLData): Promise<void> {
    // Simulate Memory Server storage
    const endpoint = `${this.memoryServerUrl}/ml/${collection}`;
    
    // In a real implementation, this would make an HTTP POST request
    console.log(`📡 Storing in Memory Server: ${endpoint}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async retrieveFromMemoryServer(collection: string, query: MLQuery): Promise<MLData[]> {
    // Simulate Memory Server retrieval
    const endpoint = `${this.memoryServerUrl}/ml/${collection}`;
    
    console.log(`📡 Retrieving from Memory Server: ${endpoint}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 15));
    
    // Return empty array for simulation
    return [];
  }

  private async storeModelInMemoryServer(modelId: string, modelData: MLModelData): Promise<void> {
    // Simulate Memory Server model storage
    const endpoint = `${this.memoryServerUrl}/ml/models/${modelId}`;
    
    console.log(`📡 Storing model in Memory Server: ${endpoint}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  private async retrieveModelFromMemoryServer(modelId: string): Promise<MLModelData | null> {
    // Simulate Memory Server model retrieval
    const endpoint = `${this.memoryServerUrl}/ml/models/${modelId}`;
    
    console.log(`📡 Retrieving model from Memory Server: ${endpoint}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 15));
    
    // Return null for simulation (model not found)
    return null;
  }

  private filterData(data: MLData[], query: MLQuery): MLData[] {
    return data.filter(item => {
      // Filter by type
      if (query.type && item.type !== query.type) {
        return false;
      }
      
      // Filter by nodeId
      if (query.nodeId && item.nodeId !== query.nodeId) {
        return false;
      }
      
      // Filter by time range
      if (query.timeRange) {
        const timestamp = item.metadata.timestamp;
        if (timestamp < query.timeRange.start || timestamp > query.timeRange.end) {
          return false;
        }
      }
      
      // Filter by custom filters
      if (query.filters) {
        for (const [key, value] of Object.entries(query.filters)) {
          if (item.data[key] !== value) {
            return false;
          }
        }
      }
      
      return true;
    });
  }

  async shutdown(): Promise<void> {
    console.log('🛑 MLMemoryIntegration shutdown complete');
    this.removeAllListeners();
  }
}

export default MLMemoryIntegration; 