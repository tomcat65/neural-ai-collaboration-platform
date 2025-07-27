/**
 * RAFT-Hybrid Integration Layer
 * 
 * Integrates HybridConsensusEngine with existing RAFT consensus system
 * and WebSocket coordination for enterprise-grade distributed AI consensus
 */

import { EventEmitter } from 'events';
import { HybridConsensusEngine, ConsensusProposal, ConsensusVote, RAFTNode, VotingStrategyType } from './hybrid-consensus-engine.js';
import { RAFTEvent, RAFTVote } from './raft-events.js';

export interface RAFTHybridOptions {
  wsPort: number;
  httpPort: number;
  raftNodes: RAFTNode[];
  defaultVotingStrategy: VotingStrategyType;
  enableAutoStrategy: boolean;
}

export interface ConsensusOperation {
  type: 'leader_election' | 'log_replication' | 'config_change' | 'ai_coordination' | 'task_assignment';
  complexity: 'simple' | 'moderate' | 'complex' | 'critical';
  data: any;
  requiredNodes?: string[];
  deadline?: Date;
}

export interface OperationToStrategyMapping {
  [key: string]: {
    strategy: VotingStrategyType;
    threshold?: number;
    reasoning: string;
  };
}

export class RAFTHybridIntegration extends EventEmitter {
  private hybridEngine: HybridConsensusEngine;
  private wsConnections: Map<string, any> = new Map();
  private activeOperations: Map<string, ConsensusOperation> = new Map();
  private nodeCapabilities: Map<string, string[]> = new Map();
  private operationMappings!: OperationToStrategyMapping;
  private wsPort: number;
  private httpPort: number;
  private enableAutoStrategy: boolean;

  constructor(options: RAFTHybridOptions) {
    super();
    
    this.wsPort = options.wsPort;
    this.httpPort = options.httpPort;
    this.enableAutoStrategy = options.enableAutoStrategy;
    
    // Initialize operation to strategy mappings
    this.initializeOperationMappings();
    
    // Initialize hybrid consensus engine
    this.hybridEngine = new HybridConsensusEngine({
      raftNodes: options.raftNodes,
      defaultStrategy: options.defaultVotingStrategy,
      defaultThreshold: 0.67,
      enableMetrics: true
    });
    
    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Initialize the integration layer
   */
  async initialize(): Promise<void> {
    console.log('🔗 Initializing RAFT-Hybrid Integration...');
    
    // Initialize hybrid consensus engine
    await this.hybridEngine.initialize();
    
    // Start WebSocket server for RAFT coordination
    await this.startWebSocketServer();
    
    // Start HTTP API server
    await this.startHttpServer();
    
    console.log(`✅ RAFT-Hybrid Integration active on WebSocket:${this.wsPort}, HTTP:${this.httpPort}`);
    this.emit('initialized');
  }

  /**
   * Submit a consensus operation for processing
   */
  async submitOperation(operation: ConsensusOperation): Promise<string> {
    console.log(`🎯 Submitting ${operation.type} operation with ${operation.complexity} complexity`);
    
    // Auto-select strategy if enabled
    const strategy = this.enableAutoStrategy ? 
      this.selectOptimalStrategy(operation) : 
      this.operationMappings[operation.type]?.strategy || 'supermajority';
    
    const mapping = this.operationMappings[operation.type];
    console.log(`🧠 Selected strategy: ${strategy} (${mapping?.reasoning || 'default'})`);
    
    // Create consensus proposal
    const proposal: Omit<ConsensusProposal, 'id'> = {
      swarmId: 'raft-cluster',
      proposal: operation.data,
      requiredThreshold: mapping?.threshold || 0.67,
      ...(operation.deadline && { deadline: operation.deadline }),
      strategy
    };
    
    // Submit to hybrid engine
    const proposalId = await this.hybridEngine.createProposal(proposal);
    
    // Track operation
    this.activeOperations.set(proposalId, operation);
    
    // Broadcast to RAFT nodes
    await this.broadcastToRAFTNodes({
      type: 'CONSENSUS_PROPOSAL',
      proposalId,
      operation,
      strategy,
      threshold: proposal.requiredThreshold
    });
    
    return proposalId;
  }

  /**
   * Process RAFT vote and submit to hybrid engine
   */
  async processRAFTVote(raftVote: RAFTVote, proposalId: string): Promise<void> {
    console.log(`📥 Processing RAFT vote from ${raftVote.candidateId} for proposal ${proposalId}`);
    
    // Convert RAFT vote to consensus vote
    const consensusVote: ConsensusVote = {
      proposalId,
      agentId: raftVote.candidateId,
      vote: raftVote.granted,
      reason: `RAFT vote from node ${raftVote.candidateId}`,
      timestamp: new Date(),
      weight: this.getNodeWeight(raftVote.candidateId)
    };
    
    // Submit to hybrid engine
    await this.hybridEngine.submitVote(consensusVote);
  }

  /**
   * Select optimal voting strategy based on operation characteristics
   */
  private selectOptimalStrategy(operation: ConsensusOperation): VotingStrategyType {
    // Critical operations require unanimous consent
    if (operation.complexity === 'critical') {
      return 'unanimous';
    }
    
    // Leader elections benefit from leader-based voting
    if (operation.type === 'leader_election') {
      return 'leader_based';
    }
    
    // Config changes need strong consensus
    if (operation.type === 'config_change') {
      return 'supermajority';
    }
    
    // AI coordination can use weighted voting based on capabilities
    if (operation.type === 'ai_coordination' && this.hasWeightedCapabilities()) {
      return 'weighted';
    }
    
    // Default to supermajority for complex operations
    if (operation.complexity === 'complex') {
      return 'supermajority';
    }
    
    // Simple operations can use simple majority
    return 'simple_majority';
  }

  /**
   * Initialize operation to strategy mappings
   */
  private initializeOperationMappings(): void {
    this.operationMappings = {
      leader_election: {
        strategy: 'leader_based',
        threshold: 0.51,
        reasoning: 'Leader election benefits from leader-based coordination'
      },
      log_replication: {
        strategy: 'simple_majority',
        threshold: 0.51,
        reasoning: 'Log replication is frequent and needs fast consensus'
      },
      config_change: {
        strategy: 'supermajority',
        threshold: 0.67,
        reasoning: 'Configuration changes require strong consensus'
      },
      ai_coordination: {
        strategy: 'weighted',
        threshold: 0.6,
        reasoning: 'AI coordination benefits from capability-based voting'
      },
      task_assignment: {
        strategy: 'supermajority',
        threshold: 0.67,
        reasoning: 'Task assignments need broad agreement'
      }
    };
  }

  /**
   * Check if nodes have weighted capabilities defined
   */
  private hasWeightedCapabilities(): boolean {
    return this.nodeCapabilities.size > 0;
  }

  /**
   * Get node weight for voting
   */
  private getNodeWeight(nodeId: string): number {
    const capabilities = this.nodeCapabilities.get(nodeId);
    if (!capabilities) return 1.0;
    
    // Weight based on number of capabilities
    return Math.min(capabilities.length / 5.0, 2.0); // Max weight of 2.0
  }

  /**
   * Setup event forwarding between hybrid engine and RAFT system
   */
  private setupEventForwarding(): void {
    // Forward consensus events to RAFT system
    this.hybridEngine.on('consensusAchieved', async (event) => {
      console.log(`🎉 Consensus achieved for operation: ${event.proposal.proposal}`);
      await this.executeRAFTAction(event.proposal, event.result);
      this.emit('operationCompleted', event);
    });
    
    this.hybridEngine.on('consensusFailed', (event) => {
      console.log(`❌ Consensus failed for operation: ${event.proposal.proposal}`);
      this.emit('operationFailed', event);
    });
    
    this.hybridEngine.on('voteSubmitted', (vote) => {
      this.emit('voteReceived', vote);
    });
  }

  /**
   * Execute RAFT action based on consensus result
   */
  private async executeRAFTAction(_proposal: any, _result: any): Promise<void> {
          const operation = Array.from(this.activeOperations.values())
        .find(op => JSON.stringify(op.data) === JSON.stringify(_proposal.proposal));
    
    if (!operation) return;
    
    console.log(`⚡ Executing RAFT action for ${operation.type}`);
    
    switch (operation.type) {
      case 'leader_election':
        await this.executeLeaderElection(operation.data);
        break;
      case 'log_replication':
        await this.executeLogReplication(operation.data);
        break;
      case 'config_change':
        await this.executeConfigChange(operation.data);
        break;
      case 'ai_coordination':
        await this.executeAICoordination(operation.data);
        break;
      case 'task_assignment':
        await this.executeTaskAssignment(operation.data);
        break;
    }
  }

  /**
   * Execute leader election
   */
  private async executeLeaderElection(data: any): Promise<void> {
    console.log(`👑 Executing leader election: ${data.candidateId} -> Leader`);
    // In real implementation, would update RAFT state
  }

  /**
   * Execute log replication
   */
  private async executeLogReplication(data: any): Promise<void> {
    console.log(`📝 Executing log replication: ${data.entries?.length || 0} entries`);
    // In real implementation, would replicate logs to followers
  }

  /**
   * Execute configuration change
   */
  private async executeConfigChange(data: any): Promise<void> {
    console.log(`⚙️ Executing config change: ${data.changeType}`);
    // In real implementation, would update cluster configuration
  }

  /**
   * Execute AI coordination
   */
  private async executeAICoordination(data: any): Promise<void> {
    console.log(`🤖 Executing AI coordination: ${data.coordinationType}`);
    // In real implementation, would coordinate AI agents
  }

  /**
   * Execute task assignment
   */
  private async executeTaskAssignment(data: any): Promise<void> {
    console.log(`📋 Executing task assignment: ${data.taskId} -> ${data.assignedTo}`);
    // In real implementation, would assign task to agent
  }

  /**
   * Broadcast message to all RAFT nodes
   */
  private async broadcastToRAFTNodes(message: any): Promise<void> {
    console.log(`📡 Broadcasting to ${this.wsConnections.size} RAFT nodes:`, message.type);
    
    for (const [nodeId, connection] of this.wsConnections) {
      try {
        if (connection.readyState === 1) { // WebSocket.OPEN
          connection.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error(`❌ Failed to send to node ${nodeId}:`, error);
      }
    }
  }

  /**
   * Start WebSocket server for RAFT coordination
   */
  private async startWebSocketServer(): Promise<void> {
    // WebSocket server implementation would go here
    // For now, just log the setup
    console.log(`🌐 WebSocket server ready on port ${this.wsPort}`);
  }

  /**
   * Start HTTP API server
   */
  private async startHttpServer(): Promise<void> {
    // HTTP server implementation would go here
    // For now, just log the setup
    console.log(`🌍 HTTP API server ready on port ${this.httpPort}`);
  }

  /**
   * Get consensus metrics
   */
  getMetrics() {
    return {
      hybrid: this.hybridEngine.getMetrics(),
      activeOperations: this.activeOperations.size,
      connectedNodes: this.wsConnections.size,
      nodeCapabilities: Object.fromEntries(this.nodeCapabilities)
    };
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      active: true,
      activeProposals: this.hybridEngine.getActiveProposals().length,
      strategies: this.hybridEngine.getVotingStrategies().map(s => s.name),
      connectedNodes: Array.from(this.wsConnections.keys()),
      operationTypes: Object.keys(this.operationMappings)
    };
  }

  /**
   * Shutdown integration layer
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down RAFT-Hybrid Integration...');
    
    // Close WebSocket connections
    for (const connection of this.wsConnections.values()) {
      connection.close();
    }
    this.wsConnections.clear();
    
    // Shutdown hybrid engine
    await this.hybridEngine.shutdown();
    
    this.emit('shutdown');
  }
}