/**
 * HybridTopologyIntegration
 * 
 * Phase 2: Integrates HybridConsensusEngine with TopologyManager
 * for enterprise-grade distributed AI coordination with dynamic topology switching
 */

import { EventEmitter } from 'events';
import { HybridConsensusEngine, ConsensusProposal, RAFTNode } from './hybrid-consensus-engine.js';
import { TopologyManager, DistributedTask, TopologyType, NodeAssignment } from './topology-manager.js';

export interface HybridTopologyOptions {
  raftNodes: RAFTNode[];
  initialTopology: TopologyType;
  enableAutoTopologySwitching: boolean;
  consensusThreshold: number;
}

export interface CoordinationOperation {
  id: string;
  type: 'consensus_decision' | 'task_coordination' | 'topology_switch' | 'load_balancing';
  complexity: 'simple' | 'moderate' | 'complex' | 'critical';
  data: any;
  requiredTopology?: TopologyType;
  deadline?: Date;
}

export interface IntegrationMetrics {
  hybridConsensus: any;
  topologyManager: any;
  operationsProcessed: number;
  topologySwitches: number;
  avgResponseTime: number;
  coordinationEfficiency: number;
}

export class HybridTopologyIntegration extends EventEmitter {
  private hybridEngine: HybridConsensusEngine;
  private topologyManager: TopologyManager;
  private activeOperations: Map<string, CoordinationOperation>;
  private nodeAssignments: Map<string, NodeAssignment>;
  private enableAutoSwitching: boolean;
  private metrics: IntegrationMetrics;
  private isActive: boolean = false;

  constructor(options: HybridTopologyOptions) {
    super();
    
    this.enableAutoSwitching = options.enableAutoTopologySwitching;
    this.activeOperations = new Map();
    this.nodeAssignments = new Map();
    
    // Initialize metrics
    this.metrics = {
      hybridConsensus: {},
      topologyManager: {},
      operationsProcessed: 0,
      topologySwitches: 0,
      avgResponseTime: 0,
      coordinationEfficiency: 0
    };
    
    // Initialize hybrid consensus engine
    this.hybridEngine = new HybridConsensusEngine({
      raftNodes: options.raftNodes,
      defaultStrategy: 'supermajority',
      defaultThreshold: options.consensusThreshold,
      enableMetrics: true
    });
    
    // Initialize topology manager
    this.topologyManager = new TopologyManager(options.initialTopology);
    
    // Convert RAFT nodes to node assignments
    const nodeAssignments = this.convertRAFTNodesToAssignments(options.raftNodes);
    nodeAssignments.forEach(node => {
      this.nodeAssignments.set(node.nodeId, node);
    });
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the integrated system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Hybrid-Topology Integration...');
    
    // Initialize hybrid consensus engine
    await this.hybridEngine.initialize();
    
    // Initialize topology manager with node assignments
    const nodeAssignments = Array.from(this.nodeAssignments.values());
    await this.topologyManager.initialize(nodeAssignments);
    
    this.isActive = true;
    
    // Start coordination loops
    this.startCoordinationMonitor();
    this.startPerformanceOptimizer();
    
    console.log('✅ Hybrid-Topology Integration active');
    console.log(`📊 Consensus strategies: ${this.hybridEngine.getVotingStrategies().length}`);
    console.log(`🔗 Topology: ${this.topologyManager.getStatus().currentTopology}`);
    
    this.emit('initialized');
  }

  /**
   * Submit coordination operation
   */
  async submitOperation(operation: CoordinationOperation): Promise<string> {
    const startTime = Date.now();
    console.log(`📨 Submitting ${operation.type} operation (${operation.complexity})`);
    
    // Store operation
    this.activeOperations.set(operation.id, operation);
    
    // Determine optimal approach based on operation type
    const approach = this.selectCoordinationApproach(operation);
    console.log(`🎯 Selected approach: ${approach.method} with ${approach.topology} topology`);
    
    // Switch topology if needed
    if (this.enableAutoSwitching && approach.topology !== this.topologyManager.getStatus().currentTopology) {
      await this.switchTopology(approach.topology, operation);
    }
    
    let result;
    
    // Execute based on approach
    switch (approach.method) {
      case 'consensus_first':
        result = await this.executeConsensusFirst(operation, approach);
        break;
      case 'topology_first':
        result = await this.executeTopologyFirst(operation, approach);
        break;
      case 'parallel_coordination':
        result = await this.executeParallelCoordination(operation, approach);
        break;
      case 'sequential_coordination':
        result = await this.executeSequentialCoordination(operation, approach);
        break;
      default:
        result = await this.executeDefaultCoordination(operation, approach);
    }
    
    // Update metrics
    const responseTime = Date.now() - startTime;
    this.updateOperationMetrics(operation, responseTime, !!result);
    
    // Clean up
    this.activeOperations.delete(operation.id);
    
    console.log(`✅ Operation ${operation.id} completed in ${responseTime}ms`);
    this.emit('operationCompleted', { operation, result, responseTime });
    
    return operation.id;
  }

  /**
   * Select coordination approach based on operation characteristics
   */
  private selectCoordinationApproach(operation: CoordinationOperation): {
    method: string;
    topology: TopologyType;
    reasoning: string;
  } {
    // Critical operations need consensus first, then hierarchical coordination
    if (operation.complexity === 'critical') {
      return {
        method: 'consensus_first',
        topology: 'hierarchical',
        reasoning: 'Critical operations require strong consensus and hierarchical oversight'
      };
    }
    
    // Task coordination benefits from topology-first approach
    if (operation.type === 'task_coordination') {
      const topology = operation.complexity === 'complex' ? 'mesh' : 'star';
      return {
        method: 'topology_first',
        topology,
        reasoning: 'Task coordination optimizes through topology selection first'
      };
    }
    
    // Topology switches use sequential coordination
    if (operation.type === 'topology_switch') {
      return {
        method: 'sequential_coordination',
        topology: 'ring',
        reasoning: 'Topology switches require sequential coordination across nodes'
      };
    }
    
    // Load balancing uses parallel coordination
    if (operation.type === 'load_balancing') {
      return {
        method: 'parallel_coordination',
        topology: 'mesh',
        reasoning: 'Load balancing benefits from parallel mesh coordination'
      };
    }
    
    // Default: parallel coordination with mesh topology
    return {
      method: 'parallel_coordination',
      topology: 'mesh',
      reasoning: 'Default parallel coordination for optimal performance'
    };
  }

  /**
   * Execute consensus-first coordination
   */
  private async executeConsensusFirst(operation: CoordinationOperation, approach: any): Promise<any> {
    console.log(`🏛️ Executing consensus-first: ${approach.reasoning}`);
    
    // 1. Achieve consensus on the operation
    const consensusProposal: Omit<ConsensusProposal, 'id'> = {
      swarmId: 'hybrid-topology-cluster',
      proposal: {
        operation: operation.type,
        data: operation.data,
        complexity: operation.complexity
      },
      requiredThreshold: 0.75, // Higher threshold for critical operations
      ...(operation.deadline && { deadline: operation.deadline }),
      strategy: 'supermajority'
    };
    
    const proposalId = await this.hybridEngine.createProposal(consensusProposal);
    
    // 2. Once consensus is achieved, coordinate through topology
    await this.waitForConsensus(proposalId);
    
    // 3. Execute coordinated task
    const coordinationTask: DistributedTask = {
      id: `coord-${operation.id}`,
      type: operation.type,
      complexity: operation.complexity,
      strategy: 'sequential',
      dependencies: [],
      requiredCapabilities: ['coordination', 'execution'],
      assignedNodes: [],
      phases: ['consensus-validation', 'execution', 'confirmation'],
      status: 'pending'
    };
    
    await this.topologyManager.submitTask(coordinationTask);
    
    return { consensus: true, coordination: true, approach: 'consensus_first' };
  }

  /**
   * Execute topology-first coordination
   */
  private async executeTopologyFirst(operation: CoordinationOperation, approach: any): Promise<any> {
    console.log(`🔗 Executing topology-first: ${approach.reasoning}`);
    
    // 1. Coordinate through topology first
    const coordinationTask: DistributedTask = {
      id: `topo-${operation.id}`,
      type: operation.type,
      complexity: operation.complexity,
      strategy: operation.complexity === 'complex' ? 'parallel' : 'adaptive',
      dependencies: [],
      requiredCapabilities: this.getRequiredCapabilities(operation),
      assignedNodes: [],
      phases: ['preparation', 'coordination', 'execution'],
      status: 'pending'
    };
    
    const taskId = await this.topologyManager.submitTask(coordinationTask);
    
    // 2. If consensus is needed, do it after topology coordination
    if (operation.complexity === 'moderate' || operation.complexity === 'complex') {
      const consensusProposal: Omit<ConsensusProposal, 'id'> = {
        swarmId: 'hybrid-topology-cluster',
        proposal: {
          operation: operation.type,
          coordinationResult: taskId,
          data: operation.data
        },
        requiredThreshold: 0.6,
        strategy: 'simple_majority'
      };
      
      await this.hybridEngine.createProposal(consensusProposal);
    }
    
    return { coordination: true, consensus: true, approach: 'topology_first' };
  }

  /**
   * Execute parallel coordination
   */
  private async executeParallelCoordination(operation: CoordinationOperation, approach: any): Promise<any> {
    console.log(`⚡ Executing parallel coordination: ${approach.reasoning}`);
    
    // Create parallel tasks for consensus and topology coordination
    const coordinationTask: DistributedTask = {
      id: `parallel-coord-${operation.id}`,
      type: operation.type,
      complexity: operation.complexity,
      strategy: 'parallel',
      dependencies: [],
      requiredCapabilities: this.getRequiredCapabilities(operation),
      assignedNodes: [],
      phases: ['parallel-preparation', 'parallel-execution', 'parallel-aggregation'],
      status: 'pending'
    };
    
    const consensusProposal: Omit<ConsensusProposal, 'id'> = {
      swarmId: 'hybrid-topology-cluster',
      proposal: {
        operation: operation.type,
        data: operation.data,
        parallelCoordination: true
      },
      requiredThreshold: 0.6,
      strategy: 'simple_majority'
    };
    
    // Execute both in parallel
    const [topologyResult, consensusResult] = await Promise.all([
      this.topologyManager.submitTask(coordinationTask),
      this.hybridEngine.createProposal(consensusProposal)
    ]);
    
    return { 
      coordination: topologyResult, 
      consensus: consensusResult, 
      approach: 'parallel_coordination' 
    };
  }

  /**
   * Execute sequential coordination
   */
  private async executeSequentialCoordination(operation: CoordinationOperation, approach: any): Promise<any> {
    console.log(`🔄 Executing sequential coordination: ${approach.reasoning}`);
    
    // Sequential phases: preparation → consensus → topology coordination → execution
    const phases = ['preparation', 'consensus', 'topology-setup', 'execution', 'validation'];
    
    for (const phase of phases) {
      console.log(`📋 Executing phase: ${phase}`);
      
      if (phase === 'consensus') {
        const consensusProposal: Omit<ConsensusProposal, 'id'> = {
          swarmId: 'hybrid-topology-cluster',
          proposal: { operation: operation.type, phase, data: operation.data },
          requiredThreshold: 0.67,
          strategy: 'supermajority'
        };
        await this.hybridEngine.createProposal(consensusProposal);
      } else {
        const coordinationTask: DistributedTask = {
          id: `seq-${operation.id}-${phase}`,
          type: `${operation.type}-${phase}`,
          complexity: operation.complexity,
          strategy: 'sequential',
          dependencies: [],
          requiredCapabilities: this.getRequiredCapabilities(operation),
          assignedNodes: [],
          phases: [phase],
          status: 'pending'
        };
        await this.topologyManager.submitTask(coordinationTask);
      }
    }
    
    return { phases: phases.length, approach: 'sequential_coordination' };
  }

  /**
   * Execute default coordination
   */
  private async executeDefaultCoordination(operation: CoordinationOperation, approach: any): Promise<any> {
    console.log(`🔧 Executing default coordination: ${approach.reasoning}`);
    
    // Simple coordination - topology task with optional consensus
    const coordinationTask: DistributedTask = {
      id: `default-${operation.id}`,
      type: operation.type,
      complexity: operation.complexity,
      strategy: 'adaptive',
      dependencies: [],
      requiredCapabilities: this.getRequiredCapabilities(operation),
      assignedNodes: [],
      phases: ['analysis', 'execution', 'validation'],
      status: 'pending'
    };
    
    const taskId = await this.topologyManager.submitTask(coordinationTask);
    
    return { coordination: taskId, approach: 'default_coordination' };
  }

  /**
   * Switch topology with consensus coordination
   */
  private async switchTopology(newTopology: TopologyType, operation: CoordinationOperation): Promise<void> {
    console.log(`🔄 Switching to ${newTopology} topology for ${operation.type}`);
    
    this.metrics.topologySwitches++;
    
    // Create consensus proposal for topology switch
    const switchProposal: Omit<ConsensusProposal, 'id'> = {
      swarmId: 'hybrid-topology-cluster',
      proposal: {
        action: 'topology_switch',
        fromTopology: this.topologyManager.getStatus().currentTopology,
        toTopology: newTopology,
        reason: `Optimal for ${operation.type} (${operation.complexity})`
      },
      requiredThreshold: 0.6,
      strategy: 'simple_majority'
    };
    
    // Don't wait for consensus, proceed with switch
    await this.hybridEngine.createProposal(switchProposal);
    
    // Execute topology switch
    // Note: In real implementation, would wait for consensus before switching
    // For demo, we proceed immediately
  }

  /**
   * Convert RAFT nodes to node assignments
   */
  private convertRAFTNodesToAssignments(raftNodes: RAFTNode[]): NodeAssignment[] {
    return raftNodes.map(node => ({
      nodeId: node.id,
      role: node.isLeader ? 'leader' : 'follower',
      capabilities: node.capabilities || ['consensus', 'coordination'],
      responsibilities: node.isLeader ? 
        ['leadership', 'coordination', 'decision_making'] :
        ['execution', 'validation', 'support'],
      canRunParallel: !node.isLeader, // Leaders coordinate, followers can run parallel
      weight: node.weight || (node.isLeader ? 2.0 : 1.0)
    }));
  }

  /**
   * Get required capabilities for operation
   */
  private getRequiredCapabilities(operation: CoordinationOperation): string[] {
    const baseCapabilities = ['coordination'];
    
    switch (operation.type) {
      case 'consensus_decision':
        return [...baseCapabilities, 'consensus_building', 'decision_making'];
      case 'task_coordination':
        return [...baseCapabilities, 'task_management', 'resource_allocation'];
      case 'topology_switch':
        return [...baseCapabilities, 'system_reconfiguration', 'topology_management'];
      case 'load_balancing':
        return [...baseCapabilities, 'load_analysis', 'resource_optimization'];
      default:
        return baseCapabilities;
    }
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Hybrid consensus engine events
    this.hybridEngine.on('consensusAchieved', (event) => {
      console.log(`🎉 Consensus achieved: ${event.proposal.proposal.operation || 'operation'}`);
      this.emit('consensusAchieved', event);
    });
    
    this.hybridEngine.on('consensusFailed', (event) => {
      console.log(`❌ Consensus failed: ${event.proposal.proposal.operation || 'operation'}`);
      this.emit('consensusFailed', event);
    });
    
    // Topology manager events
    this.topologyManager.on('topologyChanged', (event) => {
      console.log(`🔄 Topology changed: ${event.from} → ${event.to}`);
      this.emit('topologyChanged', event);
    });
    
    this.topologyManager.on('taskCompleted', (event) => {
      console.log(`✅ Topology task completed: ${event.task.type}`);
      this.emit('topologyTaskCompleted', event);
    });
  }

  /**
   * Wait for consensus to be achieved
   */
  private async waitForConsensus(proposalId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkConsensus = () => {
        // In real implementation, would check consensus status
        // For demo, resolve immediately
        setTimeout(resolve, 100);
      };
      
      this.hybridEngine.once('consensusAchieved', (event) => {
        if (event.result.proposalId === proposalId) {
          resolve();
        }
      });
      
      // Start checking
      setTimeout(checkConsensus, 50);
    });
  }

  /**
   * Update operation metrics
   */
  private updateOperationMetrics(_operation: CoordinationOperation, responseTime: number, _success: boolean): void {
    this.metrics.operationsProcessed++;
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime + responseTime) / 2;
    
    // Calculate coordination efficiency
    const expectedTime = this.getExpectedResponseTime(_operation);
    const efficiency = Math.min(expectedTime / responseTime, 1.0);
    this.metrics.coordinationEfficiency = (this.metrics.coordinationEfficiency + efficiency) / 2;
  }

  private getExpectedResponseTime(operation: CoordinationOperation): number {
    // Expected response times by complexity
    const expectedTimes = {
      simple: 200,
      moderate: 500,
      complex: 1000,
      critical: 2000
    };
    
    return expectedTimes[operation.complexity] || 500;
  }

  /**
   * Get integrated metrics
   */
  getMetrics(): IntegrationMetrics {
    return {
      ...this.metrics,
      hybridConsensus: this.hybridEngine.getMetrics(),
      topologyManager: this.topologyManager.getMetrics()
    };
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      consensus: this.hybridEngine.getMetrics(),
      topology: this.topologyManager.getStatus(),
      activeOperations: this.activeOperations.size,
      autoSwitching: this.enableAutoSwitching
    };
  }

  /**
   * Start coordination monitoring
   */
  private startCoordinationMonitor(): void {
    setInterval(() => {
      if (!this.isActive) return;
      
      // Monitor coordination health
      this.monitorCoordinationHealth();
    }, 30000); // Every 30 seconds
  }

  /**
   * Start performance optimizer
   */
  private startPerformanceOptimizer(): void {
    setInterval(() => {
      if (!this.isActive) return;
      
      // Optimize coordination performance
      this.optimizeCoordinationPerformance();
    }, 60000); // Every minute
  }

  private monitorCoordinationHealth(): void {
    const status = this.getStatus();
    const metrics = this.getMetrics();
    
    if (metrics.coordinationEfficiency < 0.7) {
      console.log('⚠️ Coordination efficiency below threshold');
      this.emit('performanceWarning', { type: 'efficiency', value: metrics.coordinationEfficiency });
    }
    
    if (metrics.avgResponseTime > 2000) {
      console.log('⚠️ Average response time too high');
      this.emit('performanceWarning', { type: 'response_time', value: metrics.avgResponseTime });
    }
  }

  private optimizeCoordinationPerformance(): void {
    // Analyze recent performance and suggest optimizations
    const metrics = this.getMetrics();
    
    if (this.enableAutoSwitching) {
      // Consider topology optimization based on performance
      const topologyPerf = metrics.topologyManager.topologyPerformance;
      const bestTopology = Object.entries(topologyPerf)
        .sort(([,a], [,b]) => (b as any).successRate - (a as any).successRate)[0][0] as TopologyType;
      
      const currentTopology = this.topologyManager.getStatus().currentTopology;
      if (bestTopology !== currentTopology && topologyPerf[bestTopology].usageCount > 3) {
        console.log(`🎯 Performance optimization suggests ${bestTopology} topology`);
        this.emit('optimizationSuggestion', { suggestedTopology: bestTopology });
      }
    }
  }

  /**
   * Shutdown integrated system
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Hybrid-Topology Integration...');
    
    this.isActive = false;
    
    // Shutdown components
    await this.hybridEngine.shutdown();
    await this.topologyManager.shutdown();
    
    // Clear state
    this.activeOperations.clear();
    
    console.log('✅ Hybrid-Topology Integration shutdown complete');
    this.emit('shutdown');
  }
}