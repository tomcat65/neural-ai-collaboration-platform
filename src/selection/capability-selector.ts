/**
 * CapabilitySelector - Phase 1 Implementation
 * 
 * Implements Claude's collaborative design for Task 2.3: Capability-Based Node Selection
 * Phase 1: Basic capability matching with weighted scoring algorithm
 */

import { EventEmitter } from 'events';
import MLCapabilityLearner, { PerformanceOutcome } from '../ml/ml-capability-learner.js';
import PerformancePredictor, { PredictionContext, PerformancePrediction } from '../ml/performance-predictor.js';
import MLWeightOptimizer, { WeightOptimizationData } from '../ml/ml-weight-optimizer.js';
import MLMemoryIntegration from '../ml/ml-memory-integration.js';
import ConflictResolutionEngine, { EngineContext } from '../conflict/conflict-resolution-engine.js';

// Core interfaces from Claude's architecture
export interface ICapabilitySelector {
  // Phase 1: Basic capability matching
  selectOptimalNodes(
    requirement: CapabilityRequirement,
    constraints: SelectionConstraints
  ): Promise<SelectedNode[]>;
  
  // Weighted scoring system
  calculateCapabilityScore(
    node: NodeCapabilities,
    requirement: CapabilityRequirement
  ): CapabilityScore;
  
  // Real-time capability updates
  updateNodeCapabilities(
    nodeId: string,
    capabilities: NodeCapabilities
  ): Promise<void>;
  
  // Integration points
  syncWithMemoryServer(): Promise<void>;
  syncWithANP(): Promise<NodeCapabilities[]>;
  getCapabilityStatistics(): CapabilityStats;
  
  // Phase 2: ML Enhancement methods
  learnFromSelectionOutcome(selectionId: string, nodeId: string, actualPerformance: any): Promise<void>;
  predictNodePerformance(nodeId: string, context: any): Promise<PerformancePrediction>;
  optimizeSelectionWeights(nodeId: string, performanceData: any): Promise<void>;
  getMLMetrics(): Promise<any>;
  
  // Phase 3: Conflict Resolution methods
  resolveSelectionConflicts(selections: SelectedNode[], context: any): Promise<SelectedNode[]>;
  getConflictMetrics(): Promise<any>;
  enableConflictResolution(enabled: boolean): Promise<void>;
}

export interface CapabilityRequirement {
  id: string;
  type: 'compute' | 'storage' | 'network' | 'specialized';
  capabilities: {
    [key: string]: {
      required: boolean;
      weight: number;      // 0.0 to 1.0
      minLevel?: number;   // Minimum capability level
      preferred?: any;     // Preferred values
    };
  };
  constraints: {
    minNodes: number;
    maxNodes: number;
    topology?: string;     // Integration with TopologyManager
    excludeNodes?: string[];
    requiredNodes?: string[];
  };
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface NodeCapabilities {
  nodeId: string;
  capabilities: {
    [key: string]: {
      level: number;       // 0-100 capability level
      verified: boolean;   // Has this been verified?
      lastUpdated: Date;
      performance?: {      // Historical performance data
        avgResponseTime: number;
        successRate: number;
        reliability: number;
      };
    };
  };
  metadata: {
    nodeType: string;
    location?: string;
    trustScore: number;
    loadFactor: number;    // Current utilization 0-1
  };
}

export interface CapabilityScore {
  nodeId: string;
  totalScore: number;      // 0-100 overall match score
  breakdown: {
    [capability: string]: {
      score: number;
      weight: number;
      contribution: number;
    };
  };
  penalties: {
    [reason: string]: number;
  };
  bonuses: {
    [reason: string]: number;
  };
}

export interface SelectedNode {
  nodeId: string;
  score: CapabilityScore;
  assignedRole?: string;
  estimatedPerformance: {
    responseTime: number;
    reliability: number;
    loadImpact: number;
  };
}

export interface SelectionConstraints {
  maxResponseTime?: number;
  minReliability?: number;
  preferredTopology?: string;
  costLimit?: number;
}

export interface CapabilityStats {
  totalNodes: number;
  avgTrustScore: number;
  avgLoadFactor: number;
  capabilityDistribution: {
    [capability: string]: number;
  };
  selectionHistory: {
    totalSelections: number;
    avgSatisfaction: number;
    avgResponseTime: number;
  };
}

export class CapabilitySelector extends EventEmitter implements ICapabilitySelector {
  private nodeCapabilities: Map<string, NodeCapabilities> = new Map();
  private selectionHistory: SelectedNode[] = [];
  private isMemoryServerSynced: boolean = false;
  private isANPSynced: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;

  // Phase 2: ML Enhancement components
  private mlLearner: MLCapabilityLearner;
  private performancePredictor: PerformancePredictor;
  private weightOptimizer: MLWeightOptimizer;
  private mlMemoryIntegration: MLMemoryIntegration;
  private mlEnabled: boolean = true;

  // Phase 3: Conflict Resolution components
  private conflictResolutionEngine: ConflictResolutionEngine;
  private conflictResolutionEnabled: boolean = true;

  constructor() {
    super();
    
    // Initialize ML components
    this.mlLearner = new MLCapabilityLearner();
    this.performancePredictor = new PerformancePredictor();
    this.weightOptimizer = new MLWeightOptimizer();
    this.mlMemoryIntegration = new MLMemoryIntegration();
    
    // Initialize Conflict Resolution components
    this.conflictResolutionEngine = new ConflictResolutionEngine();
    
    this.startPeriodicSync();
    console.log('🎯 CapabilitySelector initialized - Phase 3 with ML Enhancement and Conflict Resolution');
  }

  /**
   * Select optimal nodes based on capability requirements
   */
  async selectOptimalNodes(
    requirement: CapabilityRequirement,
    constraints: SelectionConstraints = {}
  ): Promise<SelectedNode[]> {
    const startTime = Date.now();
    
    console.log(`🔍 Selecting nodes for requirement: ${requirement.id}`);
    
    // Get all available nodes
    const availableNodes = Array.from(this.nodeCapabilities.values());
    
    // Apply constraints
    let candidateNodes = this.applyConstraints(availableNodes, requirement, constraints);
    
    // Calculate scores for all candidates
    const scoredNodes: SelectedNode[] = [];
    
    for (const node of candidateNodes) {
      const score = this.calculateCapabilityScore(node, requirement);
      
      if (score.totalScore > 0) { // Only include nodes with positive scores
        const selectedNode: SelectedNode = {
          nodeId: node.nodeId,
          score,
          estimatedPerformance: this.estimatePerformance(node, requirement)
        };
        
        scoredNodes.push(selectedNode);
      }
    }
    
    // Sort by score (highest first)
    scoredNodes.sort((a, b) => b.score.totalScore - a.score.totalScore);
    
    // Apply node count constraints
    const minNodes = requirement.constraints.minNodes || 1;
    const maxNodes = requirement.constraints.maxNodes || scoredNodes.length;
    
    const selectedNodes = scoredNodes.slice(0, Math.max(minNodes, maxNodes));
    
    // Store selection history
    this.selectionHistory.push(...selectedNodes);
    
    const selectionTime = Date.now() - startTime;
    console.log(`✅ Selected ${selectedNodes.length} nodes in ${selectionTime}ms`);
    
    // Emit selection event
    this.emit('nodesSelected', {
      requirementId: requirement.id,
      selectedNodes: selectedNodes.map(n => n.nodeId),
      selectionTime,
      avgScore: selectedNodes.reduce((sum, n) => sum + n.score.totalScore, 0) / selectedNodes.length
    });
    
    return selectedNodes;
  }

  /**
   * Calculate capability score using weighted algorithm
   */
  calculateCapabilityScore(
    node: NodeCapabilities,
    requirement: CapabilityRequirement
  ): CapabilityScore {
    let totalScore = 0;
    let totalWeight = 0;
    const breakdown: any = {};
    const penalties: any = {};
    const bonuses: any = {};
    
    // Score each required capability
    for (const [capName, capReq] of Object.entries(requirement.capabilities)) {
      const nodeCapability = node.capabilities[capName];
      const weight = capReq.weight;
      totalWeight += weight;
      
      if (!nodeCapability) {
        // Missing capability
        const penalty = capReq.required ? -50 : -10;
        breakdown[capName] = { score: 0, weight, contribution: penalty * weight };
        totalScore += penalty * weight;
        continue;
      }
      
      // Calculate capability match score (0-100)
      const minLevel = capReq.minLevel || 50;
      let capScore = Math.min(100, (nodeCapability.level / minLevel) * 100);
      
      // Apply verification bonus
      if (nodeCapability.verified) {
        capScore *= 1.1; // 10% bonus for verified capabilities
        bonuses[`${capName}_verified`] = capScore * 0.1;
      }
      
      // Apply performance history bonus
      if (nodeCapability.performance) {
        const perfBonus = nodeCapability.performance.successRate * 0.2;
        capScore += perfBonus;
        bonuses[`${capName}_performance`] = perfBonus;
      }
      
      breakdown[capName] = {
        score: Math.min(100, capScore),
        weight,
        contribution: capScore * weight
      };
      
      totalScore += capScore * weight;
    }
    
    // Normalize score
    const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) : 0;
    
    // Apply node-level bonuses/penalties
    // Load factor penalty
    if (node.metadata.loadFactor > 0.8) {
      penalties.highLoad = -10;
    } else if (node.metadata.loadFactor > 0.6) {
      penalties.mediumLoad = -5;
    }
    
    // Trust score bonus
    if (node.metadata.trustScore > 0.9) {
      bonuses.highTrust = 5;
    } else if (node.metadata.trustScore > 0.7) {
      bonuses.mediumTrust = 2;
    }
    
    // Urgency bonus for high-urgency requirements
    if (requirement.urgency === 'critical') {
      bonuses.criticalUrgency = 3;
    } else if (requirement.urgency === 'high') {
      bonuses.highUrgency = 1;
    }
    
    const finalScore = Math.max(0, Math.min(100, 
      normalizedScore + 
      (Object.values(bonuses) as number[]).reduce((a, b) => a + b, 0) +
      (Object.values(penalties) as number[]).reduce((a, b) => a + b, 0)
    ));
    
    return {
      nodeId: node.nodeId,
      totalScore: finalScore,
      breakdown,
      penalties,
      bonuses
    };
  }

  /**
   * Update node capabilities in real-time
   */
  async updateNodeCapabilities(
    nodeId: string,
    capabilities: NodeCapabilities
  ): Promise<void> {
    this.nodeCapabilities.set(nodeId, {
      ...capabilities,
      capabilities: {
        ...capabilities.capabilities,
        // Update lastUpdated for all capabilities
        ...Object.fromEntries(
          Object.entries(capabilities.capabilities).map(([key, cap]) => [
            key,
            { ...cap, lastUpdated: new Date() }
          ])
        )
      }
    });
    
    // Emit capability update event
    this.emit('capabilitiesUpdated', {
      nodeId,
      timestamp: new Date(),
      capabilityCount: Object.keys(capabilities.capabilities).length
    });
    
    console.log(`📝 Updated capabilities for node: ${nodeId}`);
  }

  /**
   * Sync with Memory Server for persistence
   */
  async syncWithMemoryServer(): Promise<void> {
    try {
      console.log('🔄 Syncing with Memory Server...');
      
      // This would integrate with the actual Memory Server
      // For now, simulate the sync process
      const nodes = Array.from(this.nodeCapabilities.values());
      
      // Store capability data
      for (const node of nodes) {
        // Simulate storing to Memory Server
        await this.simulateMemoryServerStore(node);
      }
      
      this.isMemoryServerSynced = true;
      console.log(`✅ Memory Server sync complete. ${nodes.length} nodes stored`);
      
    } catch (error) {
      console.error('❌ Memory Server sync failed:', error);
      this.isMemoryServerSynced = false;
    }
  }

  /**
   * Sync with ANP System for real-time updates
   */
  async syncWithANP(): Promise<NodeCapabilities[]> {
    try {
      console.log('🔄 Syncing with ANP System...');
      
      // This would connect to the actual ANP system
      // For now, return mock data
      const mockNodes: NodeCapabilities[] = [
        {
          nodeId: 'claude-code-cli',
          capabilities: {
            'code_analysis': { level: 95, verified: true, lastUpdated: new Date() },
            'testing': { level: 90, verified: true, lastUpdated: new Date() },
            'architecture': { level: 98, verified: true, lastUpdated: new Date() }
          },
          metadata: {
            nodeType: 'claude',
            trustScore: 0.95,
            loadFactor: 0.3
          }
        },
        {
          nodeId: 'cursor-ai-assistant',
          capabilities: {
            'implementation': { level: 92, verified: true, lastUpdated: new Date() },
            'debugging': { level: 88, verified: true, lastUpdated: new Date() },
            'testing': { level: 85, verified: true, lastUpdated: new Date() }
          },
          metadata: {
            nodeType: 'cursor',
            trustScore: 0.92,
            loadFactor: 0.4
          }
        },
        {
          nodeId: 'memory-server',
          capabilities: {
            'storage': { level: 98, verified: true, lastUpdated: new Date() },
            'retrieval': { level: 96, verified: true, lastUpdated: new Date() },
            'persistence': { level: 99, verified: true, lastUpdated: new Date() }
          },
          metadata: {
            nodeType: 'memory',
            trustScore: 0.98,
            loadFactor: 0.2
          }
        }
      ];
      
      // Update local capabilities
      for (const node of mockNodes) {
        this.nodeCapabilities.set(node.nodeId, node);
      }
      
      this.isANPSynced = true;
      console.log(`✅ ANP sync complete. ${mockNodes.length} nodes updated`);
      
      return mockNodes;
      
    } catch (error) {
      console.error('❌ ANP sync failed:', error);
      this.isANPSynced = false;
      return [];
    }
  }

  /**
   * Get capability statistics
   */
  getCapabilityStatistics(): CapabilityStats {
    const nodes = Array.from(this.nodeCapabilities.values());
    
    if (nodes.length === 0) {
      return {
        totalNodes: 0,
        avgTrustScore: 0,
        avgLoadFactor: 0,
        capabilityDistribution: {},
        selectionHistory: {
          totalSelections: 0,
          avgSatisfaction: 0,
          avgResponseTime: 0
        }
      };
    }
    
    // Calculate averages
    const avgTrustScore = nodes.reduce((sum, n) => sum + n.metadata.trustScore, 0) / nodes.length;
    const avgLoadFactor = nodes.reduce((sum, n) => sum + n.metadata.loadFactor, 0) / nodes.length;
    
    // Calculate capability distribution
    const capabilityDistribution: { [key: string]: number } = {};
    for (const node of nodes) {
      for (const capName of Object.keys(node.capabilities)) {
        capabilityDistribution[capName] = (capabilityDistribution[capName] || 0) + 1;
      }
    }
    
    // Calculate selection history
    const totalSelections = this.selectionHistory.length;
    const avgSatisfaction = totalSelections > 0 
      ? this.selectionHistory.reduce((sum, n) => sum + n.score.totalScore, 0) / totalSelections
      : 0;
    const avgResponseTime = totalSelections > 0
      ? this.selectionHistory.reduce((sum, n) => sum + n.estimatedPerformance.responseTime, 0) / totalSelections
      : 0;
    
    return {
      totalNodes: nodes.length,
      avgTrustScore,
      avgLoadFactor,
      capabilityDistribution,
      selectionHistory: {
        totalSelections,
        avgSatisfaction,
        avgResponseTime
      }
    };
  }

  /**
   * Apply selection constraints
   */
  private applyConstraints(
    nodes: NodeCapabilities[],
    requirement: CapabilityRequirement,
    constraints: SelectionConstraints
  ): NodeCapabilities[] {
    let filteredNodes = [...nodes];
    
    // Apply exclude nodes constraint
    if (requirement.constraints.excludeNodes) {
      filteredNodes = filteredNodes.filter(n => 
        !requirement.constraints.excludeNodes!.includes(n.nodeId)
      );
    }
    
    // Apply required nodes constraint
    if (requirement.constraints.requiredNodes) {
      const requiredNodes = filteredNodes.filter(n => 
        requirement.constraints.requiredNodes!.includes(n.nodeId)
      );
      if (requiredNodes.length < requirement.constraints.requiredNodes.length) {
        // Not all required nodes are available
        return [];
      }
    }
    
    // Apply load factor constraint
    if (constraints.maxResponseTime) {
      filteredNodes = filteredNodes.filter(n => 
        n.metadata.loadFactor < 0.9 // High load nodes might be slow
      );
    }
    
    // Apply reliability constraint
    if (constraints.minReliability) {
      filteredNodes = filteredNodes.filter(n => 
        n.metadata.trustScore >= (constraints.minReliability || 0)
      );
    }
    
    return filteredNodes;
  }

  /**
   * Estimate performance for selected node
   */
  private estimatePerformance(
    node: NodeCapabilities,
    requirement: CapabilityRequirement
  ): { responseTime: number; reliability: number; loadImpact: number } {
    // Base response time based on load factor
    const baseResponseTime = 50 + (node.metadata.loadFactor * 100);
    
    // Reliability based on trust score
    const reliability = node.metadata.trustScore * 100;
    
    // Load impact based on current load
    const loadImpact = node.metadata.loadFactor * 20;
    
    return {
      responseTime: Math.round(baseResponseTime),
      reliability: Math.round(reliability),
      loadImpact: Math.round(loadImpact)
    };
  }

  /**
   * Simulate Memory Server storage
   */
  private async simulateMemoryServerStore(node: NodeCapabilities): Promise<void> {
    // Simulate async storage operation
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Start periodic synchronization
   */
  private startPeriodicSync(): void {
    // Initial sync
    this.syncWithANP();
    this.syncWithMemoryServer();
    
    // Periodic sync every 60 seconds
    this.syncInterval = setInterval(() => {
      this.syncWithANP();
      this.syncWithMemoryServer();
    }, 60000);
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Shutdown ML components
    await this.mlLearner.shutdown();
    await this.performancePredictor.shutdown();
    await this.weightOptimizer.shutdown();
    await this.mlMemoryIntegration.shutdown();
    
    // Shutdown Conflict Resolution components
    await this.conflictResolutionEngine.shutdown();
    
    console.log('🛑 CapabilitySelector shutdown complete');
    this.removeAllListeners();
  }

  // Phase 2: ML Enhancement Methods

  async learnFromSelectionOutcome(selectionId: string, nodeId: string, actualPerformance: any): Promise<void> {
    if (!this.mlEnabled) return;
    
    console.log(`🧠 Learning from selection outcome: ${selectionId} for node ${nodeId}`);
    
    try {
      const performanceOutcome: PerformanceOutcome = {
        selectionId,
        nodeId,
        actualResponseTime: actualPerformance.responseTime || 0,
        actualReliability: actualPerformance.reliability || 0,
        actualSuccessRate: actualPerformance.successRate || 0,
        expectedResponseTime: actualPerformance.expectedResponseTime || 0,
        expectedReliability: actualPerformance.expectedReliability || 0,
        expectedSuccessRate: actualPerformance.expectedSuccessRate || 0,
        context: {
          systemLoad: actualPerformance.context?.systemLoad || 0,
          timeOfDay: actualPerformance.context?.timeOfDay || 0,
          topology: actualPerformance.context?.topology || 'unknown',
          urgency: actualPerformance.context?.urgency || 'medium'
        },
        timestamp: new Date()
      };

      await this.mlLearner.learnFromOutcome(selectionId, performanceOutcome);
      
      // Store in ML Memory
      await this.mlMemoryIntegration.storeMLData('performance_outcomes', {
        id: selectionId,
        type: 'performance',
        nodeId,
        data: performanceOutcome,
        metadata: {
          timestamp: new Date(),
          context: performanceOutcome.context,
          version: '1.0'
        }
      });

      this.emit('ml.learning.completed', { selectionId, nodeId });
      
    } catch (error) {
      console.error(`❌ Error learning from selection outcome: ${error}`);
      this.emit('ml.error', { operation: 'learning', error });
    }
  }

  async predictNodePerformance(nodeId: string, context: any): Promise<PerformancePrediction> {
    if (!this.mlEnabled) {
      // Return default prediction if ML is disabled
      return {
        nodeId,
        predictedResponseTime: 100,
        predictedReliability: 0.8,
        predictedSuccessRate: 0.9,
        confidence: 0.5,
        factors: {
          historicalPerformance: 0.5,
          contextualFit: 0.5,
          capabilityMatch: 0.5,
          loadImpact: 0.5,
          timeBasedAdjustment: 1.0
        },
        timestamp: new Date()
      };
    }

    console.log(`🔮 Predicting performance for node: ${nodeId}`);
    
    try {
      const predictionContext: PredictionContext = {
        systemLoad: context.systemLoad || 0,
        timeOfDay: context.timeOfDay || 0,
        topology: context.topology || 'unknown',
        urgency: context.urgency || 'medium',
        requiredCapabilities: context.requiredCapabilities || [],
        expectedWorkload: context.expectedWorkload || 0
      };

      const prediction = await this.performancePredictor.predictPerformance(nodeId, predictionContext);
      
      this.emit('ml.prediction.completed', { nodeId, prediction });
      return prediction;
      
    } catch (error) {
      console.error(`❌ Error predicting node performance: ${error}`);
      this.emit('ml.error', { operation: 'prediction', error });
      throw error;
    }
  }

  async optimizeSelectionWeights(nodeId: string, performanceData: any): Promise<void> {
    if (!this.mlEnabled) return;
    
    console.log(`⚖️ Optimizing selection weights for node: ${nodeId}`);
    
    try {
      const optimizationData: WeightOptimizationData = {
        nodeId,
        currentWeights: new Map(Object.entries(performanceData.currentWeights || {})),
        performanceOutcome: {
          responseTime: performanceData.responseTime || 0,
          reliability: performanceData.reliability || 0,
          successRate: performanceData.successRate || 0,
          satisfaction: performanceData.satisfaction || 0
        },
        context: {
          systemLoad: performanceData.context?.systemLoad || 0,
          urgency: performanceData.context?.urgency || 'medium',
          topology: performanceData.context?.topology || 'unknown',
          capabilityRequirements: performanceData.context?.capabilityRequirements || []
        },
        timestamp: new Date()
      };

      const optimizedWeights = await this.weightOptimizer.optimizeWeights(nodeId, optimizationData);
      
      // Store optimization result
      await this.mlMemoryIntegration.storeMLData('weight_optimizations', {
        id: `${nodeId}_${Date.now()}`,
        type: 'optimization',
        nodeId,
        data: optimizedWeights,
        metadata: {
          timestamp: new Date(),
          context: optimizationData.context,
          version: '1.0'
        }
      });

      this.emit('ml.optimization.completed', { nodeId, optimizedWeights });
      
    } catch (error) {
      console.error(`❌ Error optimizing selection weights: ${error}`);
      this.emit('ml.error', { operation: 'optimization', error });
    }
  }

  async getMLMetrics(): Promise<any> {
    if (!this.mlEnabled) {
      return {
        mlEnabled: false,
        message: 'ML features are disabled'
      };
    }

    console.log('📊 Retrieving ML metrics');
    
    try {
      const [learningMetrics, predictionAccuracy, optimizationMetrics, memoryStats] = await Promise.all([
        this.mlLearner.getLearningMetrics(),
        this.performancePredictor.getPredictionAccuracy(),
        this.weightOptimizer.getOptimizationMetrics(),
        this.mlMemoryIntegration.getMLStatistics()
      ]);

      const mlMetrics = {
        mlEnabled: true,
        learning: learningMetrics,
        prediction: predictionAccuracy,
        optimization: optimizationMetrics,
        memory: memoryStats,
        timestamp: new Date()
      };

      this.emit('ml.metrics.retrieved', mlMetrics);
      return mlMetrics;
      
    } catch (error) {
      console.error(`❌ Error retrieving ML metrics: ${error}`);
      this.emit('ml.error', { operation: 'getMetrics', error });
      throw error;
    }
  }

  // Phase 3: Conflict Resolution Methods

  async resolveSelectionConflicts(selections: SelectedNode[], context: any): Promise<SelectedNode[]> {
    if (!this.conflictResolutionEnabled) {
      console.log('⚠️ Conflict resolution disabled, returning original selections');
      return selections;
    }

    console.log(`🗳️ Resolving conflicts for ${selections.length} selections`);
    
    try {
      const engineContext: EngineContext = {
        systemLoad: context.systemLoad || 50,
        urgency: context.urgency || 'medium',
        priority: context.priority || 'accuracy',
        availableVoters: context.availableVoters || [],
        topologyConstraints: context.topologyConstraints || [],
        mlEnabled: this.mlEnabled,
        votingTimeout: context.votingTimeout || 5000
      };

      const processedSelections = await this.conflictResolutionEngine.processSelections(selections, engineContext);
      
      this.emit('conflicts.resolved', { 
        originalCount: selections.length, 
        resolvedCount: processedSelections.resolvedSelections.length,
        conflictsDetected: processedSelections.conflictsDetected,
        conflictsResolved: processedSelections.conflictsResolved
      });
      
      return processedSelections.resolvedSelections;
      
    } catch (error) {
      console.error(`❌ Error resolving selection conflicts: ${error}`);
      this.emit('conflict.error', { operation: 'resolution', error });
      return selections; // Return original selections on error
    }
  }

  async getConflictMetrics(): Promise<any> {
    if (!this.conflictResolutionEnabled) {
      return {
        conflictResolutionEnabled: false,
        message: 'Conflict resolution is disabled'
      };
    }

    console.log('📊 Retrieving conflict resolution metrics');
    
    try {
      const engineStatus = await this.conflictResolutionEngine.getEngineStatus();
      const conflictMetrics = { totalResolutions: 0, successRate: 0, averageResolutionTime: 0 };

      const metrics = {
        conflictResolutionEnabled: true,
        engineStatus,
        conflictMetrics,
        timestamp: new Date()
      };

      this.emit('conflict.metrics.retrieved', metrics);
      return metrics;
      
    } catch (error) {
      console.error(`❌ Error retrieving conflict metrics: ${error}`);
      this.emit('conflict.error', { operation: 'getMetrics', error });
      throw error;
    }
  }

  async enableConflictResolution(enabled: boolean): Promise<void> {
    console.log(`🗳️ ${enabled ? 'Enabling' : 'Disabling'} conflict resolution`);
    
    this.conflictResolutionEnabled = enabled;
    
    if (enabled) {
      // Enable all resolution strategies
      await this.conflictResolutionEngine.enableStrategy('voting');
      await this.conflictResolutionEngine.enableStrategy('topology');
      await this.conflictResolutionEngine.enableStrategy('ml');
      await this.conflictResolutionEngine.enableStrategy('hybrid');
      await this.conflictResolutionEngine.enableStrategy('auto');
    } else {
      // Disable all strategies except auto
      await this.conflictResolutionEngine.disableStrategy('voting');
      await this.conflictResolutionEngine.disableStrategy('topology');
      await this.conflictResolutionEngine.disableStrategy('ml');
      await this.conflictResolutionEngine.disableStrategy('hybrid');
    }
    
    this.emit('conflict.resolution.toggled', { enabled });
  }
}

export default CapabilitySelector; 