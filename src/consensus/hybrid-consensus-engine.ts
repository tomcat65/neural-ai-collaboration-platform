/**
 * HybridConsensusEngine
 * 
 * Combines RAFT consensus with claude-flow's advanced voting strategies
 * for enterprise-grade distributed AI coordination
 */

import { EventEmitter } from 'events';

// Extracted from claude-flow types
export interface ConsensusProposal {
  id: string;
  swarmId: string;
  taskId?: string;
  proposal: any;
  requiredThreshold: number;
  deadline?: Date;
  strategy?: VotingStrategyType;
}

export interface ConsensusVote {
  proposalId: string;
  agentId: string;
  vote: boolean;
  reason?: string;
  timestamp: Date;
  weight?: number; // For weighted voting
}

export interface ConsensusResult {
  proposalId: string;
  achieved: boolean;
  finalRatio: number;
  totalVotes: number;
  positiveVotes: number;
  negativeVotes: number;
  participationRate: number;
  strategy: VotingStrategyType;
  executionTime: number;
}

export interface VotingStrategy {
  name: string;
  description: string;
  threshold: number;
  requiresWeights?: boolean;
  recommend: (proposal: ConsensusProposal, analysis: any) => {
    vote: boolean;
    confidence: number;
    reasoning: string;
    factors: string[];
  };
}

export interface ConsensusMetrics {
  totalProposals: number;
  achievedConsensus: number;
  failedConsensus: number;
  avgVotingTime: number;
  avgParticipation: number;
  strategyUsage: Record<VotingStrategyType, number>;
  performanceByStrategy: Record<VotingStrategyType, {
    successRate: number;
    avgTime: number;
  }>;
}

export type VotingStrategyType = 'simple_majority' | 'supermajority' | 'unanimous' | 'weighted' | 'leader_based';

export interface RAFTNode {
  id: string;
  address: string;
  isLeader: boolean;
  lastHeartbeat: Date;
  capabilities: string[];
  weight?: number; // For weighted voting
}

export interface HybridConsensusOptions {
  raftNodes: RAFTNode[];
  defaultStrategy: VotingStrategyType;
  defaultThreshold: number;
  enableMetrics: boolean;
}

export class HybridConsensusEngine extends EventEmitter {
  private activeProposals: Map<string, ConsensusProposal>;
  private votingStrategies: Map<VotingStrategyType, VotingStrategy>;
  private metrics: ConsensusMetrics;
  private raftNodes: Map<string, RAFTNode>;
  private defaultStrategy: VotingStrategyType;
  private defaultThreshold: number;
  private isActive: boolean = false;
  private proposalVotes: Map<string, Map<string, ConsensusVote>>;

  constructor(options: HybridConsensusOptions) {
    super();
    
    this.activeProposals = new Map();
    this.votingStrategies = new Map();
    this.raftNodes = new Map();
    this.proposalVotes = new Map();
    this.defaultStrategy = options.defaultStrategy;
    this.defaultThreshold = options.defaultThreshold;
    
    // Initialize RAFT nodes
    options.raftNodes.forEach(node => {
      this.raftNodes.set(node.id, node);
    });
    
    // Initialize metrics
    this.metrics = {
      totalProposals: 0,
      achievedConsensus: 0,
      failedConsensus: 0,
      avgVotingTime: 0,
      avgParticipation: 0,
      strategyUsage: {
        simple_majority: 0,
        supermajority: 0,
        unanimous: 0,
        weighted: 0,
        leader_based: 0
      },
      performanceByStrategy: {
        simple_majority: { successRate: 0, avgTime: 0 },
        supermajority: { successRate: 0, avgTime: 0 },
        unanimous: { successRate: 0, avgTime: 0 },
        weighted: { successRate: 0, avgTime: 0 },
        leader_based: { successRate: 0, avgTime: 0 }
      }
    };
    
    this.initializeVotingStrategies();
  }

  /**
   * Initialize hybrid consensus engine
   */
  async initialize(): Promise<void> {
    this.isActive = true;
    this.startProposalMonitor();
    this.startTimeoutChecker();
    this.startMetricsCollector();
    
    this.emit('initialized');
    console.log('🚀 HybridConsensusEngine initialized with', this.raftNodes.size, 'RAFT nodes');
  }

  /**
   * Create a new consensus proposal
   */
  async createProposal(proposal: Omit<ConsensusProposal, 'id'>): Promise<string> {
    const fullProposal: ConsensusProposal = {
      id: this.generateProposalId(),
      ...proposal,
      strategy: proposal.strategy || this.defaultStrategy
    };
    
    // Store proposal
    this.activeProposals.set(fullProposal.id, fullProposal);
    
    // Update metrics
    this.metrics.totalProposals++;
    this.metrics.strategyUsage[fullProposal.strategy!]++;
    
    // Initiate voting across RAFT nodes
    await this.initiateVoting(fullProposal);
    
    this.emit('proposalCreated', fullProposal);
    console.log(`📊 Created proposal ${fullProposal.id} with ${fullProposal.strategy} strategy`);
    
    return fullProposal.id;
  }

  /**
   * Submit a vote from a RAFT node
   */
  async submitVote(vote: ConsensusVote): Promise<void> {
    const proposal = this.activeProposals.get(vote.proposalId);
    if (!proposal) {
      console.log(`⚠️ Vote received for already resolved proposal ${vote.proposalId} from ${vote.agentId}`);
      return; // Gracefully handle votes for completed proposals
    }
    
    // Validate vote
    if (!this.validateVote(vote, proposal)) {
      throw new Error('Invalid vote');
    }
    
    // Store vote
    if (!this.proposalVotes.has(vote.proposalId)) {
      this.proposalVotes.set(vote.proposalId, new Map());
    }
    this.proposalVotes.get(vote.proposalId)!.set(vote.agentId, vote);
    
    console.log(`🗳️ Vote received from ${vote.agentId}: ${vote.vote ? 'YES' : 'NO'} on ${vote.proposalId}`);
    
    // Check if consensus achieved
    await this.checkConsensus(proposal);
    
    this.emit('voteSubmitted', vote);
  }

  /**
   * Initialize voting strategies (extracted from claude-flow)
   */
  private initializeVotingStrategies(): void {
    // Simple majority strategy (>50%)
    this.votingStrategies.set('simple_majority', {
      name: 'Simple Majority',
      description: 'Requires more than 50% positive votes',
      threshold: 0.51,
      recommend: (_proposal, analysis) => ({
        vote: analysis?.recommendation || true,
        confidence: 0.7,
        reasoning: 'Based on simple majority principle',
        factors: ['proposal_quality', 'impact_assessment']
      })
    });
    
    // Supermajority strategy (2/3)
    this.votingStrategies.set('supermajority', {
      name: 'Supermajority',
      description: 'Requires 2/3 or more positive votes',
      threshold: 0.67,
      recommend: (_proposal, analysis) => ({
        vote: analysis?.strongRecommendation || false,
        confidence: 0.8,
        reasoning: 'Requires strong consensus for critical decisions',
        factors: ['criticality', 'risk_assessment', 'broad_support']
      })
    });
    
    // Unanimous strategy (100%)
    this.votingStrategies.set('unanimous', {
      name: 'Unanimous',
      description: 'Requires 100% agreement',
      threshold: 1.0,
      recommend: (_proposal, analysis) => ({
        vote: analysis?.perfectAlignment || false,
        confidence: 0.9,
        reasoning: 'All nodes must agree for this decision',
        factors: ['absolute_necessity', 'zero_dissent']
      })
    });
    
    // Weighted strategy (based on node capabilities)
    this.votingStrategies.set('weighted', {
      name: 'Weighted Voting',
      description: 'Weighted voting based on node capabilities',
      threshold: 0.6,
      requiresWeights: true,
      recommend: (_proposal, analysis) => {
        const expertise = analysis?.expertiseAlignment || 0.5;
        return {
          vote: expertise > 0.6,
          confidence: expertise,
          reasoning: 'Based on node expertise and proposal alignment',
          factors: ['expertise_level', 'domain_knowledge', 'past_performance']
        };
      }
    });
    
    // Leader-based strategy (leader vote has higher weight)
    this.votingStrategies.set('leader_based', {
      name: 'Leader-Based Consensus',
      description: 'Leader vote carries extra weight in decision',
      threshold: 0.5,
      recommend: (_proposal, analysis) => ({
        vote: analysis?.leaderRecommendation || true,
        confidence: 0.75,
        reasoning: 'Leader guidance with distributed validation',
        factors: ['leader_expertise', 'distributed_validation', 'coordination_efficiency']
      })
    });
  }

  /**
   * Initiate voting process across RAFT nodes
   */
  private async initiateVoting(proposal: ConsensusProposal): Promise<void> {
    const strategy = this.votingStrategies.get(proposal.strategy!);
    if (!strategy) {
      throw new Error(`Unknown voting strategy: ${proposal.strategy}`);
    }
    
    console.log(`🎯 Initiating ${strategy.name} voting for proposal ${proposal.id}`);
    console.log(`📋 Proposal: ${JSON.stringify(proposal.proposal)}`);
    console.log(`🎚️ Required threshold: ${strategy.threshold}`);
    console.log(`👥 Eligible voters: ${Array.from(this.raftNodes.keys()).join(', ')}`);
    
    // In real implementation, would broadcast to RAFT nodes via WebSocket
    this.emit('votingInitiated', { proposal, strategy, eligibleVoters: Array.from(this.raftNodes.keys()) });
    
    // Set up deadline monitoring
    if (proposal.deadline) {
      const timeUntilDeadline = proposal.deadline.getTime() - Date.now();
      setTimeout(async () => {
        await this.handleVotingDeadline(proposal.id);
      }, timeUntilDeadline);
    }
  }

  /**
   * Check if consensus has been achieved
   */
  private async checkConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const startTime = Date.now();
    const strategy = this.votingStrategies.get(proposal.strategy!)!;
    
    // Get votes for this proposal
    const totalVoters = this.raftNodes.size;
    const votes = this.proposalVotes.get(proposal.id) || new Map();
    const currentVotes = votes.size;
    const positiveVotes = Array.from(votes.values()).filter(v => v.vote).length;
    const currentRatio = currentVotes > 0 ? positiveVotes / currentVotes : 0;
    
    const result: ConsensusResult = {
      proposalId: proposal.id,
      achieved: false,
      finalRatio: currentRatio,
      totalVotes: currentVotes,
      positiveVotes,
      negativeVotes: currentVotes - positiveVotes,
      participationRate: currentVotes / totalVoters,
      strategy: proposal.strategy!,
      executionTime: Date.now() - startTime
    };
    
    // Apply strategy-specific logic
    let thresholdMet = false;
    
    switch (proposal.strategy) {
      case 'weighted':
        thresholdMet = this.checkWeightedConsensus(proposal, currentRatio);
        break;
      case 'leader_based':
        thresholdMet = this.checkLeaderBasedConsensus(proposal, currentRatio);
        break;
      default:
        thresholdMet = currentRatio >= strategy.threshold;
    }
    
    if (thresholdMet) {
      result.achieved = true;
      await this.handleConsensusAchieved(proposal, result);
    } else if (currentVotes === totalVoters) {
      // All votes in but consensus not achieved
      await this.handleConsensusFailed(proposal, result);
    }
    
    return result;
  }

  /**
   * Check weighted consensus based on node capabilities
   */
  private checkWeightedConsensus(_proposal: ConsensusProposal, ratio: number): boolean {
    // In real implementation, would calculate weighted votes based on node weights
    const strategy = this.votingStrategies.get('weighted')!;
    return ratio >= strategy.threshold;
  }

  /**
   * Check leader-based consensus
   */
  private checkLeaderBasedConsensus(_proposal: ConsensusProposal, ratio: number): boolean {
    // In real implementation, would check if leader voted and apply extra weight
    const leaderNode = Array.from(this.raftNodes.values()).find(node => node.isLeader);
    if (!leaderNode) {
      // Fallback to simple majority if no leader
      return ratio >= 0.51;
    }
    
    const strategy = this.votingStrategies.get('leader_based')!;
    return ratio >= strategy.threshold;
  }

  /**
   * Handle consensus achieved
   */
  private async handleConsensusAchieved(proposal: ConsensusProposal, result: ConsensusResult): Promise<void> {
    // Remove from active proposals
    this.activeProposals.delete(proposal.id);
    
    // Update metrics
    this.metrics.achievedConsensus++;
    this.updateStrategyMetrics(proposal.strategy!, true, result.executionTime);
    
    console.log(`✅ Consensus ACHIEVED for proposal ${proposal.id}`);
    console.log(`📊 Result: ${result.positiveVotes}/${result.totalVotes} votes (${(result.finalRatio * 100).toFixed(1)}%)`);
    console.log(`⏱️ Execution time: ${result.executionTime}ms`);
    
    this.emit('consensusAchieved', { proposal, result });
  }

  /**
   * Handle consensus failed
   */
  private async handleConsensusFailed(proposal: ConsensusProposal, result: ConsensusResult): Promise<void> {
    // Remove from active proposals
    this.activeProposals.delete(proposal.id);
    
    // Update metrics
    this.metrics.failedConsensus++;
    this.updateStrategyMetrics(proposal.strategy!, false, result.executionTime);
    
    console.log(`❌ Consensus FAILED for proposal ${proposal.id}`);
    console.log(`📊 Result: ${result.positiveVotes}/${result.totalVotes} votes (${(result.finalRatio * 100).toFixed(1)}%)`);
    console.log(`🎯 Required: ${(this.votingStrategies.get(proposal.strategy!)!.threshold * 100).toFixed(1)}%`);
    
    this.emit('consensusFailed', { proposal, result });
  }

  /**
   * Handle voting deadline
   */
  private async handleVotingDeadline(proposalId: string): Promise<void> {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;
    
    console.log(`⏰ Voting deadline reached for proposal ${proposalId}`);
    const result = await this.checkConsensus(proposal);
    
    if (!result.achieved) {
      await this.handleConsensusFailed(proposal, result);
    }
  }

  /**
   * Update strategy-specific metrics
   */
  private updateStrategyMetrics(strategy: VotingStrategyType, success: boolean, executionTime: number): void {
    const current = this.metrics.performanceByStrategy[strategy];
    const totalDecisions = this.metrics.achievedConsensus + this.metrics.failedConsensus;
    
    // Update success rate
    current.successRate = success ? 
      (current.successRate * (totalDecisions - 1) + 1) / totalDecisions :
      current.successRate * (totalDecisions - 1) / totalDecisions;
    
    // Update average time
    current.avgTime = (current.avgTime * (totalDecisions - 1) + executionTime) / totalDecisions;
  }

  /**
   * Validate vote
   */
  private validateVote(vote: ConsensusVote, proposal: ConsensusProposal): boolean {
    // Check if voting is still open
    if (proposal.deadline && new Date() > proposal.deadline) {
      return false;
    }
    
    // Check if node exists
    if (!this.raftNodes.has(vote.agentId)) {
      return false;
    }
    
    // Validate vote structure
    if (typeof vote.vote !== 'boolean') {
      return false;
    }
    
    return true;
  }

  /**
   * Generate unique proposal ID
   */
  private generateProposalId(): string {
    return `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get consensus metrics
   */
  getMetrics(): ConsensusMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active proposals
   */
  getActiveProposals(): ConsensusProposal[] {
    return Array.from(this.activeProposals.values());
  }

  /**
   * Get available voting strategies
   */
  getVotingStrategies(): VotingStrategy[] {
    return Array.from(this.votingStrategies.values());
  }

  /**
   * Start proposal monitor
   */
  private startProposalMonitor(): void {
    setInterval(async () => {
      if (!this.isActive) return;
      
      try {
        for (const proposal of this.activeProposals.values()) {
          await this.checkConsensus(proposal);
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Start timeout checker
   */
  private startTimeoutChecker(): void {
    setInterval(async () => {
      if (!this.isActive) return;
      
      try {
        const now = Date.now();
        
        for (const proposal of this.activeProposals.values()) {
          if (proposal.deadline && proposal.deadline.getTime() < now) {
            await this.handleVotingDeadline(proposal.id);
          }
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, 1000); // Every second
  }

  /**
   * Start metrics collector
   */
  private startMetricsCollector(): void {
    setInterval(async () => {
      if (!this.isActive) return;
      
      try {
        // Update average metrics
        const totalDecisions = this.metrics.achievedConsensus + this.metrics.failedConsensus;
        if (totalDecisions > 0) {
          this.metrics.avgParticipation = 
            Object.values(this.metrics.performanceByStrategy)
              .reduce((sum, strategy) => sum + strategy.successRate, 0) / 
            Object.keys(this.metrics.performanceByStrategy).length;
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Shutdown consensus engine
   */
  async shutdown(): Promise<void> {
    this.isActive = false;
    this.activeProposals.clear();
    
    console.log('🛑 HybridConsensusEngine shutdown');
    this.emit('shutdown');
  }
}