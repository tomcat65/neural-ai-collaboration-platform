import { EventEmitter } from 'events';

export interface IMLCapabilityLearner {
  learnFromOutcome(selectionId: string, actualPerformance: PerformanceOutcome): Promise<void>;
  getLearnedWeights(nodeId: string): Promise<LearnedWeights>;
  updateModel(historicalData: PerformanceOutcome[]): Promise<void>;
  getLearningMetrics(): LearningMetrics;
}

export interface PerformanceOutcome {
  selectionId: string;
  nodeId: string;
  actualResponseTime: number;
  actualReliability: number;
  actualSuccessRate: number;
  expectedResponseTime: number;
  expectedReliability: number;
  expectedSuccessRate: number;
  context: {
    systemLoad: number;
    timeOfDay: number;
    topology: string;
    urgency: string;
  };
  timestamp: Date;
}

export interface LearnedWeights {
  nodeId: string;
  capabilityWeights: Map<string, number>;
  contextWeights: Map<string, number>;
  reliabilityScore: number;
  performanceScore: number;
  lastUpdated: Date;
}

export interface LearningMetrics {
  totalOutcomes: number;
  averagePredictionError: number;
  improvementRate: number;
  modelAccuracy: number;
  lastTrainingDate: Date;
}

export class MLCapabilityLearner extends EventEmitter implements IMLCapabilityLearner {
  private learnedWeights: Map<string, LearnedWeights> = new Map();
  private historicalData: PerformanceOutcome[] = [];
  private learningRate: number = 0.1;
  private metrics: LearningMetrics = {
    totalOutcomes: 0,
    averagePredictionError: 0,
    improvementRate: 0,
    modelAccuracy: 0,
    lastTrainingDate: new Date()
  };

  constructor() {
    super();
    console.log('🧠 MLCapabilityLearner initialized');
  }

  async learnFromOutcome(selectionId: string, actualPerformance: PerformanceOutcome): Promise<void> {
    console.log(`🧠 Learning from outcome: ${selectionId} for node ${actualPerformance.nodeId}`);
    
    this.historicalData.push(actualPerformance);
    this.metrics.totalOutcomes++;

    // Calculate prediction errors
    const responseTimeError = Math.abs(actualPerformance.actualResponseTime - actualPerformance.expectedResponseTime);
    const reliabilityError = Math.abs(actualPerformance.actualReliability - actualPerformance.expectedReliability);
    const successRateError = Math.abs(actualPerformance.actualSuccessRate - actualPerformance.expectedSuccessRate);

    // Update learned weights for this node
    await this.updateNodeWeights(actualPerformance.nodeId, {
      responseTimeError,
      reliabilityError,
      successRateError,
      context: actualPerformance.context
    });

    // Update global metrics
    this.updateLearningMetrics();

    this.emit('learning.completed', {
      selectionId,
      nodeId: actualPerformance.nodeId,
      errors: { responseTimeError, reliabilityError, successRateError }
    });
  }

  async getLearnedWeights(nodeId: string): Promise<LearnedWeights> {
    const weights = this.learnedWeights.get(nodeId);
    if (!weights) {
      // Return default weights for new nodes
      return {
        nodeId,
        capabilityWeights: new Map(),
        contextWeights: new Map(),
        reliabilityScore: 0.5,
        performanceScore: 0.5,
        lastUpdated: new Date()
      };
    }
    return weights;
  }

  async updateModel(historicalData: PerformanceOutcome[]): Promise<void> {
    console.log(`🧠 Updating model with ${historicalData.length} historical outcomes`);
    
    this.historicalData = [...this.historicalData, ...historicalData];
    
    // Batch learning from all historical data
    for (const outcome of historicalData) {
      await this.learnFromOutcome(outcome.selectionId, outcome);
    }

    this.metrics.lastTrainingDate = new Date();
    this.emit('model.updated', { totalOutcomes: this.historicalData.length });
  }

  getLearningMetrics(): LearningMetrics {
    return { ...this.metrics };
  }

  private async updateNodeWeights(nodeId: string, errors: {
    responseTimeError: number;
    reliabilityError: number;
    successRateError: number;
    context: any;
  }): Promise<void> {
    const currentWeights = await this.getLearnedWeights(nodeId);
    
    // Adjust capability weights based on errors
    const totalError = errors.responseTimeError + errors.reliabilityError + errors.successRateError;
    const adjustment = this.learningRate * (1 - totalError / 3); // Normalize error

    // Update reliability and performance scores
    currentWeights.reliabilityScore = Math.max(0, Math.min(1, 
      currentWeights.reliabilityScore + adjustment * (1 - errors.reliabilityError)
    ));
    currentWeights.performanceScore = Math.max(0, Math.min(1,
      currentWeights.performanceScore + adjustment * (1 - errors.responseTimeError)
    ));

    // Update context weights
    for (const [contextKey, contextValue] of Object.entries(errors.context)) {
      const currentContextWeight = currentWeights.contextWeights.get(contextKey) || 0.5;
      const newContextWeight = currentContextWeight + adjustment * 0.1;
      currentWeights.contextWeights.set(contextKey, Math.max(0, Math.min(1, newContextWeight)));
    }

    currentWeights.lastUpdated = new Date();
    this.learnedWeights.set(nodeId, currentWeights);
  }

  private updateLearningMetrics(): void {
    if (this.historicalData.length === 0) return;

    // Calculate average prediction error
    const totalError = this.historicalData.reduce((sum, outcome) => {
      const responseTimeError = Math.abs(outcome.actualResponseTime - outcome.expectedResponseTime);
      const reliabilityError = Math.abs(outcome.actualReliability - outcome.expectedReliability);
      const successRateError = Math.abs(outcome.actualSuccessRate - outcome.expectedSuccessRate);
      return sum + (responseTimeError + reliabilityError + successRateError) / 3;
    }, 0);

    this.metrics.averagePredictionError = totalError / this.historicalData.length;
    this.metrics.modelAccuracy = Math.max(0, 1 - this.metrics.averagePredictionError);
  }

  async shutdown(): Promise<void> {
    console.log('🛑 MLCapabilityLearner shutdown complete');
    this.removeAllListeners();
  }
}

export default MLCapabilityLearner; 