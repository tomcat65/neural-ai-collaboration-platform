import { EventEmitter } from 'events';
import { SelectedNode, CapabilityRequirement } from '../selection/capability-selector.js';

export interface IConflictResolver {
  // Main conflict resolution
  resolveSelectionConflicts(
    conflictingSelections: ConflictingSelection[],
    context: ConflictContext
  ): Promise<ConflictResolution>;
  
  // Strategy-specific resolution
  resolveWithVoting(conflicts: ConflictingSelection[]): Promise<VotingResolution>;
  resolveWithTopology(conflicts: ConflictingSelection[]): Promise<TopologyResolution>;
  resolveWithML(conflicts: ConflictingSelection[]): Promise<MLResolution>;
  
  // Conflict detection and analysis
  detectConflicts(selections: SelectedNode[]): Promise<ConflictAnalysis>;
  analyzeConflictPatterns(historicalConflicts: ConflictResolution[]): Promise<ConflictPatterns>;
  
  // Learning and improvement
  learnFromResolution(resolution: ConflictResolution, outcome: ResolutionOutcome): Promise<void>;
  getConflictMetrics(): Promise<ConflictMetrics>;
}

export interface ConflictingSelection {
  id: string;
  nodes: SelectedNode[];
  conflictType: 'score_tie' | 'capability_overlap' | 'resource_contention' | 'topology_constraint';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: {
    requirement: CapabilityRequirement;
    systemLoad: number;
    urgency: string;
    topology: string;
  };
  timestamp: Date;
}

export interface ConflictContext {
  availableVoters: string[];
  topologyConstraints: string[];
  mlEnabled: boolean;
  votingTimeout: number;
  priority: 'speed' | 'accuracy' | 'consensus';
}

export interface ConflictResolution {
  id: string;
  resolvedNodes: SelectedNode[];
  strategy: 'voting' | 'topology' | 'ml' | 'hybrid';
  confidence: number;
  resolutionTime: number;
  factors: ResolutionFactors;
  timestamp: Date;
}

export interface VotingResolution extends ConflictResolution {
  strategy: 'voting';
  votingResults: {
    totalVotes: number;
    winningNode: string;
    voteDistribution: Map<string, number>;
    consensusReached: boolean;
  };
}

export interface TopologyResolution extends ConflictResolution {
  strategy: 'topology';
  topologyFactors: {
    optimalTopology: string;
    routingEfficiency: number;
    loadDistribution: number;
    constraintSatisfaction: number;
  };
}

export interface MLResolution extends ConflictResolution {
  strategy: 'ml';
  mlFactors: {
    historicalSuccess: number;
    patternMatch: number;
    predictionConfidence: number;
    learningImprovement: number;
  };
}

export interface ResolutionFactors {
  votingWeight: number;
  topologyWeight: number;
  mlWeight: number;
  urgencyImpact: number;
  loadConsideration: number;
}

export interface ConflictAnalysis {
  conflicts: ConflictingSelection[];
  totalConflicts: number;
  conflictDistribution: {
    score_tie: number;
    capability_overlap: number;
    resource_contention: number;
    topology_constraint: number;
  };
  severityBreakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface ConflictPatterns {
  frequentConflicts: string[];
  resolutionSuccessRates: Map<string, number>;
  timeBasedPatterns: {
    peakConflictHours: number[];
    averageResolutionTime: number;
  };
  improvementTrends: {
    conflictReduction: number;
    resolutionSpeedImprovement: number;
  };
}

export interface ResolutionOutcome {
  success: boolean;
  actualPerformance: {
    responseTime: number;
    reliability: number;
    satisfaction: number;
  };
  stakeholderFeedback: number; // 0-100
  conflicts: string[]; // Any new conflicts that emerged
}

export interface ConflictMetrics {
  totalResolutions: number;
  averageResolutionTime: number;
  successRate: number;
  strategyEffectiveness: {
    voting: number;
    topology: number;
    ml: number;
    hybrid: number;
  };
  stakeholderSatisfaction: number;
  conflictReductionRate: number;
}

export class ConflictResolver extends EventEmitter implements IConflictResolver {
  private resolutionHistory: ConflictResolution[] = [];
  private learningData: ResolutionOutcome[] = [];
  private metrics: ConflictMetrics = {
    totalResolutions: 0,
    averageResolutionTime: 0,
    successRate: 0,
    strategyEffectiveness: {
      voting: 0,
      topology: 0,
      ml: 0,
      hybrid: 0
    },
    stakeholderSatisfaction: 0,
    conflictReductionRate: 0
  };

  constructor() {
    super();
    console.log('🗳️ ConflictResolver initialized');
  }

  async resolveSelectionConflicts(
    conflictingSelections: ConflictingSelection[],
    context: ConflictContext
  ): Promise<ConflictResolution> {
    const startTime = Date.now();
    console.log(`🗳️ Resolving ${conflictingSelections.length} conflicts`);
    
    try {
      // Analyze conflicts to determine best strategy
      const analysis = await this.analyzeConflictPatterns(this.resolutionHistory);
      const strategy = this.selectResolutionStrategy(conflictingSelections, context, analysis);
      
      let resolution: ConflictResolution;
      
      switch (strategy) {
        case 'voting':
          resolution = await this.resolveWithVoting(conflictingSelections);
          break;
        case 'topology':
          resolution = await this.resolveWithTopology(conflictingSelections);
          break;
        case 'ml':
          resolution = await this.resolveWithML(conflictingSelections);
          break;
        case 'hybrid':
          resolution = await this.resolveWithHybrid(conflictingSelections, context);
          break;
        default:
          throw new Error(`Unknown resolution strategy: ${strategy}`);
      }
      
      resolution.id = `conflict-${Date.now()}`;
      resolution.resolutionTime = Date.now() - startTime;
      resolution.timestamp = new Date();
      
      // Store resolution history
      this.resolutionHistory.push(resolution);
      this.updateMetrics(resolution);
      
      this.emit('conflict.resolved', { resolution, strategy });
      return resolution;
      
    } catch (error) {
      console.error(`❌ Error resolving conflicts: ${error}`);
      this.emit('conflict.error', { error, conflictingSelections });
      throw error;
    }
  }

  async resolveWithVoting(conflicts: ConflictingSelection[]): Promise<VotingResolution> {
    console.log('🗳️ Resolving conflicts with voting consensus');
    
    // Simulate voting consensus integration
    const votingResults = await this.simulateVoting(conflicts);
    
    const resolution: VotingResolution = {
      id: '',
      resolvedNodes: conflicts[0].nodes.filter(node => node.nodeId === votingResults.winningNode),
      strategy: 'voting',
      confidence: votingResults.consensusReached ? 0.9 : 0.7,
      resolutionTime: 0,
      factors: {
        votingWeight: 0.8,
        topologyWeight: 0.1,
        mlWeight: 0.1,
        urgencyImpact: 0.5,
        loadConsideration: 0.3
      },
      timestamp: new Date(),
      votingResults
    };
    
    this.emit('voting.resolution.completed', { resolution });
    return resolution;
  }

  async resolveWithTopology(conflicts: ConflictingSelection[]): Promise<TopologyResolution> {
    console.log('🗳️ Resolving conflicts with topology-aware resolution');
    
    // Simulate topology manager integration
    const topologyFactors = await this.simulateTopologyResolution(conflicts);
    
    const resolution: TopologyResolution = {
      id: '',
      resolvedNodes: conflicts[0].nodes.slice(0, 1), // Select first node for now
      strategy: 'topology',
      confidence: topologyFactors.constraintSatisfaction,
      resolutionTime: 0,
      factors: {
        votingWeight: 0.1,
        topologyWeight: 0.8,
        mlWeight: 0.1,
        urgencyImpact: 0.4,
        loadConsideration: 0.6
      },
      timestamp: new Date(),
      topologyFactors
    };
    
    this.emit('topology.resolution.completed', { resolution });
    return resolution;
  }

  async resolveWithML(conflicts: ConflictingSelection[]): Promise<MLResolution> {
    console.log('🗳️ Resolving conflicts with ML-enhanced resolution');
    
    // Simulate ML integration
    const mlFactors = await this.simulateMLResolution(conflicts);
    
    const resolution: MLResolution = {
      id: '',
      resolvedNodes: conflicts[0].nodes.slice(0, 1), // Select first node for now
      strategy: 'ml',
      confidence: mlFactors.predictionConfidence,
      resolutionTime: 0,
      factors: {
        votingWeight: 0.1,
        topologyWeight: 0.1,
        mlWeight: 0.8,
        urgencyImpact: 0.3,
        loadConsideration: 0.2
      },
      timestamp: new Date(),
      mlFactors
    };
    
    this.emit('ml.resolution.completed', { resolution });
    return resolution;
  }

  async detectConflicts(selections: SelectedNode[]): Promise<ConflictAnalysis> {
    console.log('🔍 Detecting conflicts in selections');
    
    const conflicts: ConflictingSelection[] = [];
    
    // Detect score ties
    const scoreGroups = this.groupByScore(selections);
    for (const [score, nodes] of scoreGroups) {
      if (nodes.length > 1) {
        conflicts.push({
          id: `score-tie-${Date.now()}`,
          nodes,
          conflictType: 'score_tie',
          severity: this.calculateSeverity(nodes.length),
          context: {
            requirement: { id: 'detected', type: 'compute', capabilities: {}, constraints: { minNodes: 1, maxNodes: 1 }, urgency: 'medium' },
            systemLoad: 50,
            urgency: 'medium',
            topology: 'mesh'
          },
          timestamp: new Date()
        });
      }
    }
    
    // Detect capability overlaps
    const capabilityConflicts = this.detectCapabilityOverlaps(selections);
    conflicts.push(...capabilityConflicts);
    
    const conflictDistribution = this.calculateConflictDistribution(conflicts);
    const severityBreakdown = this.calculateSeverityBreakdown(conflicts);
    
    const analysis: ConflictAnalysis = {
      conflicts,
      totalConflicts: conflicts.length,
      conflictDistribution,
      severityBreakdown
    };
    
    this.emit('conflicts.detected', { analysis });
    return analysis;
  }

  async analyzeConflictPatterns(historicalConflicts: ConflictResolution[]): Promise<ConflictPatterns> {
    console.log('📊 Analyzing conflict patterns');
    
    const patterns: ConflictPatterns = {
      frequentConflicts: this.identifyFrequentConflicts(historicalConflicts),
      resolutionSuccessRates: this.calculateSuccessRates(historicalConflicts),
      timeBasedPatterns: this.analyzeTimePatterns(historicalConflicts),
      improvementTrends: this.calculateImprovementTrends(historicalConflicts)
    };
    
    this.emit('patterns.analyzed', { patterns });
    return patterns;
  }

  async learnFromResolution(resolution: ConflictResolution, outcome: ResolutionOutcome): Promise<void> {
    console.log('🧠 Learning from resolution outcome');
    
    this.learningData.push(outcome);
    
    // Update success rates
    if (outcome.success) {
      this.metrics.successRate = (this.metrics.successRate * this.metrics.totalResolutions + 1) / (this.metrics.totalResolutions + 1);
    }
    
    // Update stakeholder satisfaction
    this.metrics.stakeholderSatisfaction = (this.metrics.stakeholderSatisfaction * this.learningData.length + outcome.stakeholderFeedback) / (this.learningData.length + 1);
    
    this.emit('learning.completed', { resolution, outcome });
  }

  async getConflictMetrics(): Promise<ConflictMetrics> {
    return { ...this.metrics };
  }

  private selectResolutionStrategy(
    conflicts: ConflictingSelection[],
    context: ConflictContext,
    patterns: ConflictPatterns
  ): 'voting' | 'topology' | 'ml' | 'hybrid' {
    // Strategy selection logic based on context and patterns
    if (context.priority === 'consensus' && context.availableVoters.length > 0) {
      return 'voting';
    } else if (context.priority === 'speed' && context.mlEnabled) {
      return 'ml';
    } else if (conflicts.some(c => c.conflictType === 'topology_constraint')) {
      return 'topology';
    } else if (patterns.improvementTrends.conflictReduction > 0.1) {
      return 'hybrid';
    } else {
      return 'hybrid';
    }
  }

  private async resolveWithHybrid(conflicts: ConflictingSelection[], context: ConflictContext): Promise<ConflictResolution> {
    console.log('🔄 Resolving conflicts with hybrid strategy');
    
    // Combine multiple strategies
    const [votingRes, topologyRes, mlRes] = await Promise.all([
      this.resolveWithVoting(conflicts),
      this.resolveWithTopology(conflicts),
      this.resolveWithML(conflicts)
    ]);
    
    // Weight the results based on context
    const weights = this.calculateHybridWeights(context);
    
    const hybridResolution: ConflictResolution = {
      id: '',
      resolvedNodes: votingRes.resolvedNodes, // Use voting as base
      strategy: 'hybrid',
      confidence: (votingRes.confidence * weights.voting + 
                  topologyRes.confidence * weights.topology + 
                  mlRes.confidence * weights.ml),
      resolutionTime: 0,
      factors: {
        votingWeight: weights.voting,
        topologyWeight: weights.topology,
        mlWeight: weights.ml,
        urgencyImpact: 0.5,
        loadConsideration: 0.5
      },
      timestamp: new Date()
    };
    
    return hybridResolution;
  }

  private async simulateVoting(conflicts: ConflictingSelection[]): Promise<VotingResolution['votingResults']> {
    // Simulate voting consensus
    const nodes = conflicts[0]?.nodes || [];
    
    if (nodes.length === 0) {
      // Return default voting results if no nodes
      return {
        totalVotes: 0,
        winningNode: '',
        voteDistribution: new Map<string, number>(),
        consensusReached: false
      };
    }
    
    const voteDistribution = new Map<string, number>();
    
    // Simulate votes
    for (const node of nodes) {
      voteDistribution.set(node.nodeId, Math.floor(Math.random() * 10) + 1);
    }
    
    const winningNode = Array.from(voteDistribution.entries())
      .reduce((a, b) => voteDistribution.get(a[0])! > voteDistribution.get(b[0])! ? a : b)[0];
    
    const totalVotes = Array.from(voteDistribution.values()).reduce((a, b) => a + b, 0);
    const consensusReached = voteDistribution.get(winningNode)! / totalVotes > 0.6;
    
    return {
      totalVotes,
      winningNode,
      voteDistribution,
      consensusReached
    };
  }

  private async simulateTopologyResolution(_conflicts: ConflictingSelection[]): Promise<TopologyResolution['topologyFactors']> {
    // Simulate topology manager integration
    return {
      optimalTopology: 'mesh',
      routingEfficiency: 0.85,
      loadDistribution: 0.78,
      constraintSatisfaction: 0.92
    };
  }

  private async simulateMLResolution(_conflicts: ConflictingSelection[]): Promise<MLResolution['mlFactors']> {
    // Simulate ML integration
    return {
      historicalSuccess: 0.88,
      patternMatch: 0.82,
      predictionConfidence: 0.85,
      learningImprovement: 0.12
    };
  }

  private groupByScore(selections: SelectedNode[]): Map<number, SelectedNode[]> {
    const groups = new Map<number, SelectedNode[]>();
    
    for (const selection of selections) {
      const score = Math.round(selection.score.totalScore);
      if (!groups.has(score)) {
        groups.set(score, []);
      }
      groups.get(score)!.push(selection);
    }
    
    return groups;
  }

  private calculateSeverity(nodeCount: number): 'low' | 'medium' | 'high' | 'critical' {
    if (nodeCount <= 2) return 'low';
    if (nodeCount <= 4) return 'medium';
    if (nodeCount <= 6) return 'high';
    return 'critical';
  }

  private detectCapabilityOverlaps(_selections: SelectedNode[]): ConflictingSelection[] {
    // Simplified capability overlap detection
    return [];
  }

  private calculateConflictDistribution(conflicts: ConflictingSelection[]): ConflictAnalysis['conflictDistribution'] {
    const distribution = { score_tie: 0, capability_overlap: 0, resource_contention: 0, topology_constraint: 0 };
    
    for (const conflict of conflicts) {
      distribution[conflict.conflictType]++;
    }
    
    return distribution;
  }

  private calculateSeverityBreakdown(conflicts: ConflictingSelection[]): ConflictAnalysis['severityBreakdown'] {
    const breakdown = { low: 0, medium: 0, high: 0, critical: 0 };
    
    for (const conflict of conflicts) {
      breakdown[conflict.severity]++;
    }
    
    return breakdown;
  }

  private identifyFrequentConflicts(_historicalConflicts: ConflictResolution[]): string[] {
    // Simplified frequent conflict identification
    return ['score_tie', 'capability_overlap'];
  }

  private calculateSuccessRates(_historicalConflicts: ConflictResolution[]): Map<string, number> {
    const rates = new Map<string, number>();
    rates.set('voting', 0.85);
    rates.set('topology', 0.78);
    rates.set('ml', 0.82);
    rates.set('hybrid', 0.88);
    return rates;
  }

  private analyzeTimePatterns(_historicalConflicts: ConflictResolution[]): ConflictPatterns['timeBasedPatterns'] {
    return {
      peakConflictHours: [9, 14, 16],
      averageResolutionTime: 250
    };
  }

  private calculateImprovementTrends(_historicalConflicts: ConflictResolution[]): ConflictPatterns['improvementTrends'] {
    return {
      conflictReduction: 0.15,
      resolutionSpeedImprovement: 0.22
    };
  }

  private calculateHybridWeights(_context: ConflictContext): { voting: number; topology: number; ml: number } {
    return {
      voting: 0.4,
      topology: 0.3,
      ml: 0.3
    };
  }

  private updateMetrics(resolution: ConflictResolution): void {
    this.metrics.totalResolutions++;
    this.metrics.averageResolutionTime = 
      (this.metrics.averageResolutionTime * (this.metrics.totalResolutions - 1) + resolution.resolutionTime) / this.metrics.totalResolutions;
    
    // Update strategy effectiveness
    const currentRate = this.metrics.strategyEffectiveness[resolution.strategy];
    this.metrics.strategyEffectiveness[resolution.strategy] = (currentRate * 0.9) + (resolution.confidence * 0.1);
  }

  async shutdown(): Promise<void> {
    console.log('🛑 ConflictResolver shutdown complete');
    this.removeAllListeners();
  }
}

export default ConflictResolver; 