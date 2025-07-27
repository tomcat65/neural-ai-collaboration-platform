import { EventEmitter } from 'events';

export interface IPerformancePredictor {
  predictPerformance(nodeId: string, context: PredictionContext): Promise<PerformancePrediction>;
  updatePredictionModel(historicalData: PerformanceData[]): Promise<void>;
  getPredictionAccuracy(): PredictionAccuracy;
}

export interface PredictionContext {
  systemLoad: number;
  timeOfDay: number;
  topology: string;
  urgency: string;
  requiredCapabilities: string[];
  expectedWorkload: number;
}

export interface PerformancePrediction {
  nodeId: string;
  predictedResponseTime: number;
  predictedReliability: number;
  predictedSuccessRate: number;
  confidence: number;
  factors: PredictionFactors;
  timestamp: Date;
}

export interface PredictionFactors {
  historicalPerformance: number;
  contextualFit: number;
  capabilityMatch: number;
  loadImpact: number;
  timeBasedAdjustment: number;
}

export interface PerformanceData {
  nodeId: string;
  actualResponseTime: number;
  actualReliability: number;
  actualSuccessRate: number;
  context: PredictionContext;
  timestamp: Date;
}

export interface PredictionAccuracy {
  totalPredictions: number;
  averageError: number;
  accuracyRate: number;
  lastUpdated: Date;
}

export class PerformancePredictor extends EventEmitter implements IPerformancePredictor {
  private performanceHistory: Map<string, PerformanceData[]> = new Map();
  private predictionAccuracy: PredictionAccuracy = {
    totalPredictions: 0,
    averageError: 0,
    accuracyRate: 0,
    lastUpdated: new Date()
  };

  constructor() {
    super();
    console.log('🔮 PerformancePredictor initialized');
  }

  async predictPerformance(nodeId: string, context: PredictionContext): Promise<PerformancePrediction> {
    console.log(`🔮 Predicting performance for node ${nodeId}`);
    
    const startTime = Date.now();
    const nodeHistory = this.performanceHistory.get(nodeId) || [];
    
    // Calculate prediction factors
    const historicalPerformance = this.calculateHistoricalPerformance(nodeHistory, context);
    const contextualFit = this.calculateContextualFit(nodeHistory, context);
    const capabilityMatch = this.calculateCapabilityMatch(context);
    const loadImpact = this.calculateLoadImpact(context.systemLoad);
    const timeBasedAdjustment = this.calculateTimeAdjustment(context.timeOfDay);

    // Combine factors for final prediction
    const predictedResponseTime = this.predictResponseTime(historicalPerformance, contextualFit, loadImpact, timeBasedAdjustment);
    const predictedReliability = this.predictReliability(historicalPerformance, contextualFit, capabilityMatch);
    const predictedSuccessRate = this.predictSuccessRate(historicalPerformance, capabilityMatch, loadImpact);
    const confidence = this.calculateConfidence(nodeHistory.length, contextualFit);

    const prediction: PerformancePrediction = {
      nodeId,
      predictedResponseTime,
      predictedReliability,
      predictedSuccessRate,
      confidence,
      factors: {
        historicalPerformance,
        contextualFit,
        capabilityMatch,
        loadImpact,
        timeBasedAdjustment
      },
      timestamp: new Date()
    };

    const predictionTime = Date.now() - startTime;
    console.log(`🔮 Prediction completed in ${predictionTime}ms`);

    this.emit('prediction.completed', { nodeId, prediction, predictionTime });
    return prediction;
  }

  async updatePredictionModel(historicalData: PerformanceData[]): Promise<void> {
    console.log(`🔮 Updating prediction model with ${historicalData.length} data points`);
    
    // Group data by node
    for (const data of historicalData) {
      if (!this.performanceHistory.has(data.nodeId)) {
        this.performanceHistory.set(data.nodeId, []);
      }
      this.performanceHistory.get(data.nodeId)!.push(data);
    }

    // Update accuracy metrics
    this.updatePredictionAccuracy();
    
    this.emit('model.updated', { totalNodes: this.performanceHistory.size });
  }

  getPredictionAccuracy(): PredictionAccuracy {
    return { ...this.predictionAccuracy };
  }

  private calculateHistoricalPerformance(nodeHistory: PerformanceData[], context: PredictionContext): number {
    if (nodeHistory.length === 0) return 0.5;

    // Filter recent and contextually similar data
    const recentData = nodeHistory.filter(data => 
      Date.now() - data.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    if (recentData.length === 0) return 0.5;

    // Calculate weighted average based on recency and context similarity
    const weightedSum = recentData.reduce((sum, data) => {
      const recencyWeight = 1 / (1 + (Date.now() - data.timestamp.getTime()) / (60 * 60 * 1000)); // Hours
      const contextSimilarity = this.calculateContextSimilarity(data.context, context);
      const weight = recencyWeight * contextSimilarity;
      
      const performance = (data.actualReliability + data.actualSuccessRate) / 2;
      return sum + (performance * weight);
    }, 0);

    const totalWeight = recentData.reduce((sum, data) => {
      const recencyWeight = 1 / (1 + (Date.now() - data.timestamp.getTime()) / (60 * 60 * 1000));
      const contextSimilarity = this.calculateContextSimilarity(data.context, context);
      return sum + (recencyWeight * contextSimilarity);
    }, 0);

    return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  private calculateContextualFit(nodeHistory: PerformanceData[], context: PredictionContext): number {
    if (nodeHistory.length === 0) return 0.5;

    const similarContexts = nodeHistory.filter(data => 
      this.calculateContextSimilarity(data.context, context) > 0.7
    );

    if (similarContexts.length === 0) return 0.5;

    const avgPerformance = similarContexts.reduce((sum, data) => 
      sum + (data.actualReliability + data.actualSuccessRate) / 2, 0
    ) / similarContexts.length;

    return avgPerformance;
  }

  private calculateCapabilityMatch(context: PredictionContext): number {
    // Simulate capability matching based on required capabilities
    const capabilityCount = context.requiredCapabilities.length;
    const workloadFactor = Math.min(1, context.expectedWorkload / 100);
    
    // Higher capability count and lower workload = better match
    return Math.min(1, (capabilityCount * 0.2) + (1 - workloadFactor) * 0.8);
  }

  private calculateLoadImpact(systemLoad: number): number {
    // Higher load = lower performance
    return Math.max(0.1, 1 - (systemLoad / 100));
  }

  private calculateTimeAdjustment(timeOfDay: number): number {
    // Simulate time-based performance patterns
    // Peak hours (9-17) might have slightly lower performance
    const hour = timeOfDay;
    if (hour >= 9 && hour <= 17) {
      return 0.95; // Slight performance reduction during business hours
    }
    return 1.0; // Normal performance during off-hours
  }

  private calculateContextSimilarity(context1: PredictionContext, context2: PredictionContext): number {
    const loadDiff = Math.abs(context1.systemLoad - context2.systemLoad) / 100;
    const timeDiff = Math.abs(context1.timeOfDay - context2.timeOfDay) / 24;
    const topologyMatch = context1.topology === context2.topology ? 1 : 0;
    const urgencyMatch = context1.urgency === context2.urgency ? 1 : 0;

    const similarity = (1 - loadDiff) * 0.3 + (1 - timeDiff) * 0.2 + topologyMatch * 0.3 + urgencyMatch * 0.2;
    return Math.max(0, Math.min(1, similarity));
  }

  private predictResponseTime(historicalPerformance: number, contextualFit: number, loadImpact: number, timeAdjustment: number): number {
    // Base response time: 50ms
    const baseResponseTime = 50;
    
    // Adjust based on factors
    const performanceFactor = 1 + (1 - historicalPerformance);
    const contextFactor = 1 + (1 - contextualFit) * 0.5;
    const loadFactor = 1 + (1 - loadImpact);
    const timeFactor = 1 + (1 - timeAdjustment) * 0.2;

    return baseResponseTime * performanceFactor * contextFactor * loadFactor * timeFactor;
  }

  private predictReliability(historicalPerformance: number, contextualFit: number, capabilityMatch: number): number {
    return (historicalPerformance * 0.4 + contextualFit * 0.3 + capabilityMatch * 0.3);
  }

  private predictSuccessRate(historicalPerformance: number, capabilityMatch: number, loadImpact: number): number {
    return (historicalPerformance * 0.5 + capabilityMatch * 0.3 + loadImpact * 0.2);
  }

  private calculateConfidence(dataPoints: number, contextualFit: number): number {
    const dataConfidence = Math.min(1, dataPoints / 10); // More data = higher confidence
    const contextConfidence = contextualFit;
    
    return (dataConfidence * 0.7 + contextConfidence * 0.3);
  }

  private updatePredictionAccuracy(): void {
    // This would be updated with actual prediction vs outcome comparisons
    this.predictionAccuracy.lastUpdated = new Date();
  }

  async shutdown(): Promise<void> {
    console.log('🛑 PerformancePredictor shutdown complete');
    this.removeAllListeners();
  }
}

export default PerformancePredictor; 