import { EventEmitter } from 'events';

export interface IMLWeightOptimizer {
  optimizeWeights(nodeId: string, performanceData: WeightOptimizationData): Promise<OptimizedWeights>;
  updateOptimizationModel(historicalOptimizations: WeightOptimizationData[]): Promise<void>;
  getOptimizationMetrics(): OptimizationMetrics;
}

export interface WeightOptimizationData {
  nodeId: string;
  currentWeights: Map<string, number>;
  performanceOutcome: {
    responseTime: number;
    reliability: number;
    successRate: number;
    satisfaction: number;
  };
  context: {
    systemLoad: number;
    urgency: string;
    topology: string;
    capabilityRequirements: string[];
  };
  timestamp: Date;
}

export interface OptimizedWeights {
  nodeId: string;
  optimizedWeights: Map<string, number>;
  confidence: number;
  improvement: number;
  factors: OptimizationFactors;
  timestamp: Date;
}

export interface OptimizationFactors {
  performanceGap: number;
  contextualRelevance: number;
  historicalTrend: number;
  loadAdjustment: number;
  urgencyImpact: number;
}

export interface OptimizationMetrics {
  totalOptimizations: number;
  averageImprovement: number;
  optimizationAccuracy: number;
  lastOptimization: Date;
}

export class MLWeightOptimizer extends EventEmitter implements IMLWeightOptimizer {
  private optimizationHistory: Map<string, WeightOptimizationData[]> = new Map();
  private metrics: OptimizationMetrics = {
    totalOptimizations: 0,
    averageImprovement: 0,
    optimizationAccuracy: 0,
    lastOptimization: new Date()
  };
  private optimizationRate: number = 0.15;

  constructor() {
    super();
    console.log('⚖️ MLWeightOptimizer initialized');
  }

  async optimizeWeights(nodeId: string, performanceData: WeightOptimizationData): Promise<OptimizedWeights> {
    console.log(`⚖️ Optimizing weights for node ${nodeId}`);
    
    const startTime = Date.now();
    const nodeHistory = this.optimizationHistory.get(nodeId) || [];
    
    // Calculate optimization factors
    const performanceGap = this.calculatePerformanceGap(performanceData.performanceOutcome);
    const contextualRelevance = this.calculateContextualRelevance(nodeHistory, performanceData.context);
    const historicalTrend = this.calculateHistoricalTrend(nodeHistory);
    const loadAdjustment = this.calculateLoadAdjustment(performanceData.context.systemLoad);
    const urgencyImpact = this.calculateUrgencyImpact(performanceData.context.urgency);

    // Generate optimized weights
    const optimizedWeights = await this.generateOptimizedWeights(
      performanceData.currentWeights,
      {
        performanceGap,
        contextualRelevance,
        historicalTrend,
        loadAdjustment,
        urgencyImpact
      }
    );

    // Calculate improvement and confidence
    const improvement = this.calculateImprovement(performanceData.performanceOutcome);
    const confidence = this.calculateOptimizationConfidence(nodeHistory.length, contextualRelevance);

    const optimization: OptimizedWeights = {
      nodeId,
      optimizedWeights,
      confidence,
      improvement,
      factors: {
        performanceGap,
        contextualRelevance,
        historicalTrend,
        loadAdjustment,
        urgencyImpact
      },
      timestamp: new Date()
    };

    const optimizationTime = Date.now() - startTime;
    console.log(`⚖️ Weight optimization completed in ${optimizationTime}ms`);

    this.emit('optimization.completed', { nodeId, optimization, optimizationTime });
    return optimization;
  }

  async updateOptimizationModel(historicalOptimizations: WeightOptimizationData[]): Promise<void> {
    console.log(`⚖️ Updating optimization model with ${historicalOptimizations.length} optimizations`);
    
    // Group optimizations by node
    for (const optimization of historicalOptimizations) {
      if (!this.optimizationHistory.has(optimization.nodeId)) {
        this.optimizationHistory.set(optimization.nodeId, []);
      }
      this.optimizationHistory.get(optimization.nodeId)!.push(optimization);
    }

    // Update metrics
    this.updateOptimizationMetrics();
    
    this.emit('model.updated', { totalNodes: this.optimizationHistory.size });
  }

  getOptimizationMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }

  private calculatePerformanceGap(performanceOutcome: WeightOptimizationData['performanceOutcome']): number {
    // Calculate how far performance is from optimal (1.0)
    const optimalPerformance = 1.0;
    const currentPerformance = (performanceOutcome.reliability + performanceOutcome.successRate + performanceOutcome.satisfaction) / 3;
    
    return Math.max(0, optimalPerformance - currentPerformance);
  }

  private calculateContextualRelevance(nodeHistory: WeightOptimizationData[], context: WeightOptimizationData['context']): number {
    if (nodeHistory.length === 0) return 0.5;

    const similarContexts = nodeHistory.filter(data => 
      this.calculateContextSimilarity(data.context, context) > 0.6
    );

    if (similarContexts.length === 0) return 0.5;

    const avgPerformance = similarContexts.reduce((sum, data) => 
      sum + (data.performanceOutcome.reliability + data.performanceOutcome.successRate) / 2, 0
    ) / similarContexts.length;

    return avgPerformance;
  }

  private calculateHistoricalTrend(nodeHistory: WeightOptimizationData[]): number {
    if (nodeHistory.length < 2) return 0.5;

    // Calculate trend based on recent performance improvements
    const recentData = nodeHistory.slice(-5); // Last 5 optimizations
    const improvements = recentData.map(data => 
      (data.performanceOutcome.reliability + data.performanceOutcome.successRate) / 2
    );

    // Calculate trend (positive = improving, negative = declining)
    let trend = 0;
    for (let i = 1; i < improvements.length; i++) {
      trend += improvements[i] - improvements[i - 1];
    }

    return Math.max(0, Math.min(1, 0.5 + trend / improvements.length));
  }

  private calculateLoadAdjustment(systemLoad: number): number {
    // Higher load requires more conservative weight adjustments
    return Math.max(0.1, 1 - (systemLoad / 100) * 0.5);
  }

  private calculateUrgencyImpact(urgency: string): number {
    // Higher urgency allows more aggressive optimization
    switch (urgency) {
      case 'emergency': return 1.5;
      case 'high': return 1.2;
      case 'medium': return 1.0;
      case 'low': return 0.8;
      default: return 1.0;
    }
  }

  private async generateOptimizedWeights(
    currentWeights: Map<string, number>,
    factors: OptimizationFactors
  ): Promise<Map<string, number>> {
    const optimizedWeights = new Map<string, number>();
    
    // Calculate overall optimization strength
    const optimizationStrength = this.calculateOptimizationStrength(factors);
    
    for (const [weightKey, currentWeight] of currentWeights) {
      let optimizedWeight = currentWeight;
      
      // Apply optimization based on factors
      const performanceAdjustment = factors.performanceGap * this.optimizationRate;
      const contextualAdjustment = factors.contextualRelevance * 0.1;
      const trendAdjustment = (factors.historicalTrend - 0.5) * 0.2;
      const loadAdjustment = factors.loadAdjustment * 0.1;
      const urgencyAdjustment = (factors.urgencyImpact - 1.0) * 0.1;
      
      const totalAdjustment = (
        performanceAdjustment + 
        contextualAdjustment + 
        trendAdjustment + 
        loadAdjustment + 
        urgencyAdjustment
      ) * optimizationStrength;
      
      optimizedWeight = Math.max(0, Math.min(1, currentWeight + totalAdjustment));
      optimizedWeights.set(weightKey, optimizedWeight);
    }
    
    return optimizedWeights;
  }

  private calculateOptimizationStrength(factors: OptimizationFactors): number {
    // Combine factors to determine how aggressive optimization should be
    const performanceWeight = 0.4;
    const contextualWeight = 0.2;
    const trendWeight = 0.2;
    const loadWeight = 0.1;
    const urgencyWeight = 0.1;
    
    return (
      factors.performanceGap * performanceWeight +
      factors.contextualRelevance * contextualWeight +
      factors.historicalTrend * trendWeight +
      factors.loadAdjustment * loadWeight +
      factors.urgencyImpact * urgencyWeight
    );
  }

  private calculateImprovement(performanceOutcome: WeightOptimizationData['performanceOutcome']): number {
    // Calculate improvement potential based on current performance
    const currentPerformance = (performanceOutcome.reliability + performanceOutcome.successRate + performanceOutcome.satisfaction) / 3;
    const maxImprovement = 1.0 - currentPerformance;
    
    return Math.max(0, maxImprovement);
  }

  private calculateOptimizationConfidence(dataPoints: number, contextualRelevance: number): number {
    const dataConfidence = Math.min(1, dataPoints / 5); // More data = higher confidence
    const contextConfidence = contextualRelevance;
    
    return (dataConfidence * 0.6 + contextConfidence * 0.4);
  }

  private calculateContextSimilarity(context1: WeightOptimizationData['context'], context2: WeightOptimizationData['context']): number {
    const loadDiff = Math.abs(context1.systemLoad - context2.systemLoad) / 100;
    const topologyMatch = context1.topology === context2.topology ? 1 : 0;
    const urgencyMatch = context1.urgency === context2.urgency ? 1 : 0;
    
    // Calculate capability similarity
    const capabilityIntersection = context1.capabilityRequirements.filter(cap => 
      context2.capabilityRequirements.includes(cap)
    ).length;
    const capabilityUnion = new Set([...context1.capabilityRequirements, ...context2.capabilityRequirements]).size;
    const capabilitySimilarity = capabilityUnion > 0 ? capabilityIntersection / capabilityUnion : 0;
    
    const similarity = (1 - loadDiff) * 0.3 + topologyMatch * 0.2 + urgencyMatch * 0.2 + capabilitySimilarity * 0.3;
    return Math.max(0, Math.min(1, similarity));
  }

  private updateOptimizationMetrics(): void {
    this.metrics.totalOptimizations++;
    this.metrics.lastOptimization = new Date();
    
    // Calculate average improvement across all optimizations
    let totalImprovement = 0;
    let totalOptimizations = 0;
    
    for (const nodeHistory of this.optimizationHistory.values()) {
      for (const optimization of nodeHistory) {
        const improvement = this.calculateImprovement(optimization.performanceOutcome);
        totalImprovement += improvement;
        totalOptimizations++;
      }
    }
    
    if (totalOptimizations > 0) {
      this.metrics.averageImprovement = totalImprovement / totalOptimizations;
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛑 MLWeightOptimizer shutdown complete');
    this.removeAllListeners();
  }
}

export default MLWeightOptimizer; 