import { EventEmitter } from 'events';
import { MessageHubIntegration } from '../message-hub/hub-integration';

interface VotingNode {
  id: string;
  capabilities: string[];
  trustScore: number;
  lastSeen: number;
  instanceId?: string;
}

interface ConsensusVote {
  nodeId: string;
  decision: 'approve' | 'reject' | 'abstain';
  confidence: number;
  timestamp: number;
  reasoning?: string;
}

interface VotingProposal {
  id: string;
  type: string;
  data: any;
  requiredMajority?: number;
  timeout?: number;
  eligibilityCriteria?: {
    minTrustScore?: number;
    requiredCapabilities?: string[];
    maxInactiveTime?: number;
  };
}

interface VotingResult {
  proposalId: string;
  decision: 'APPROVED' | 'REJECTED' | 'NO_QUORUM';
  votes: ConsensusVote[];
  summary: {
    approve: number;
    reject: number;
    abstain: number;
    total: number;
    requiredMajority: number;
  };
  duration: number;
}

export class VotingConsensus extends EventEmitter {
  private hub: MessageHubIntegration;
  private nodes: Map<string, VotingNode> = new Map();
  private activeVotes: Map<string, ConsensusVote[]> = new Map();
  private votingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private hubPort: number;
  private mcpPort: number;

  constructor(hubPort: number = 3003, mcpPort: number = 3001) {
    super();
    this.hubPort = hubPort;
    this.mcpPort = mcpPort;
    this.hub = new MessageHubIntegration(hubPort, mcpPort);
  }

  async initialize(): Promise<void> {
    console.log('🗳️ Initializing Voting Consensus System...');
    
    // Start the Message Hub integration
    await this.hub.start();
    
    // Register ourselves as a voting coordinator
    // await this.hub.registerAgent({
    //   agentId: 'voting-consensus',
    //   instanceId: 'coordinator',
    //   capabilities: ['voting.coordinate', 'consensus.manage']
    // });

    // Subscribe to voting-related messages
    this.setupMessageHandlers();
    
    console.log('✅ Voting Consensus System initialized');
  }

  private setupMessageHandlers(): void {
    // Listen for node registrations
    this.hub.on('agent.online', (data: any) => {
      this.registerNode({
        id: data.agentId,
        capabilities: data.capabilities || [],
        trustScore: 0.8, // Default trust score
        lastSeen: Date.now(),
        instanceId: data.instanceId
      });
    });

    // Listen for node disconnections
    this.hub.on('agent.offline', (data: any) => {
      const node = this.nodes.get(data.agentId);
      if (node) {
        node.lastSeen = Date.now() - 60000; // Mark as inactive
      }
    });

    // Listen for votes
    this.hub.on('consensus.vote', (data: any) => {
      this.recordVote(data.proposalId, {
        nodeId: data.from,
        decision: data.decision,
        confidence: data.confidence || 1.0,
        timestamp: Date.now(),
        reasoning: data.reasoning
      });
    });
  }

  async initiateVote(proposal: VotingProposal): Promise<VotingResult> {
    const startTime = Date.now();
    console.log(`🗳️ Initiating vote for proposal: ${proposal.id}`);
    
    // Get eligible voters
    const eligibleNodes = this.getEligibleVoters(proposal);
    console.log(`📊 Eligible voters: ${eligibleNodes.length} nodes`);
    
    if (eligibleNodes.length === 0) {
      return {
        proposalId: proposal.id,
        decision: 'NO_QUORUM',
        votes: [],
        summary: {
          approve: 0,
          reject: 0,
          abstain: 0,
          total: 0,
          requiredMajority: proposal.requiredMajority || 0.67
        },
        duration: Date.now() - startTime
      };
    }

    // Initialize vote collection
    this.activeVotes.set(proposal.id, []);
    
    // Broadcast vote request via Message Hub
    // await this.hub.broadcast({
    //   type: 'consensus.vote.request',
    //   proposalId: proposal.id,
    //   proposal: proposal.data,
    //   eligibleVoters: eligibleNodes.map(n => n.id),
    //   timeout: proposal.timeout || 10000,
    //   requiredMajority: proposal.requiredMajority || 0.67
    // });

    // Wait for votes with timeout
    const result = await this.collectVotes(
      proposal.id, 
      eligibleNodes, 
      proposal.timeout || 10000,
      proposal.requiredMajority || 0.67
    );

    // Clean up
    this.activeVotes.delete(proposal.id);
    const timeout = this.votingTimeouts.get(proposal.id);
    if (timeout) {
      clearTimeout(timeout);
      this.votingTimeouts.delete(proposal.id);
    }

    result.duration = Date.now() - startTime;
    console.log(`🏁 Voting completed in ${result.duration}ms: ${result.decision}`);
    
    this.emit('voting.complete', result);
    return result;
  }

  private getEligibleVoters(proposal: VotingProposal): VotingNode[] {
    const criteria = proposal.eligibilityCriteria || {};
    const minTrust = criteria.minTrustScore || 0.7;
    const maxInactive = criteria.maxInactiveTime || 30000;
    const requiredCaps = criteria.requiredCapabilities || [];
    
    return Array.from(this.nodes.values()).filter(node => {
      // Check trust score
      if (node.trustScore < minTrust) return false;
      
      // Check if node is active
      if (Date.now() - node.lastSeen > maxInactive) return false;
      
      // Check required capabilities
      if (requiredCaps.length > 0) {
        const hasAllCaps = requiredCaps.every(cap => 
          node.capabilities.includes(cap)
        );
        if (!hasAllCaps) return false;
      }
      
      return true;
    });
  }

  private async collectVotes(
    proposalId: string,
    eligibleNodes: VotingNode[],
    timeout: number,
    requiredMajority: number
  ): Promise<VotingResult> {
    return new Promise((resolve) => {
      const checkVotes = () => {
        const votes = this.activeVotes.get(proposalId) || [];
        const summary = this.tallyVotes(votes);
        
        // Check if we have enough votes for a decision
        const totalVotes = votes.length;
        const eligibleCount = eligibleNodes.length;
        
        // Early approval if we have enough approvals
        if (summary.approve / eligibleCount >= requiredMajority) {
          resolve({
            proposalId,
            decision: 'APPROVED',
            votes,
            summary: { ...summary, total: eligibleCount, requiredMajority },
            duration: 0
          });
          return;
        }
        
        // Early rejection if approval is impossible
        const remainingVotes = eligibleCount - totalVotes;
        const maxPossibleApprovals = summary.approve + remainingVotes;
        if (maxPossibleApprovals / eligibleCount < requiredMajority) {
          resolve({
            proposalId,
            decision: 'REJECTED',
            votes,
            summary: { ...summary, total: eligibleCount, requiredMajority },
            duration: 0
          });
          return;
        }
        
        // Check if all votes are in
        if (totalVotes >= eligibleCount) {
          const decision = summary.approve / eligibleCount >= requiredMajority
            ? 'APPROVED' : 'REJECTED';
          resolve({
            proposalId,
            decision,
            votes,
            summary: { ...summary, total: eligibleCount, requiredMajority },
            duration: 0
          });
          return;
        }
      };

      // Check votes periodically
      const interval = setInterval(checkVotes, 100);
      
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        clearInterval(interval);
        const votes = this.activeVotes.get(proposalId) || [];
        const summary = this.tallyVotes(votes);
        const eligibleCount = eligibleNodes.length;
        
        // Determine decision based on current votes
        let decision: 'APPROVED' | 'REJECTED' | 'NO_QUORUM';
        if (votes.length < eligibleCount * 0.5) {
          decision = 'NO_QUORUM'; // Not enough participation
        } else {
          decision = summary.approve / votes.length >= requiredMajority
            ? 'APPROVED' : 'REJECTED';
        }
        
        resolve({
          proposalId,
          decision,
          votes,
          summary: { ...summary, total: eligibleCount, requiredMajority },
          duration: 0
        });
      }, timeout);
      
      this.votingTimeouts.set(proposalId, timeoutHandle);
      
      // Initial check
      checkVotes();
    });
  }

  private recordVote(proposalId: string, vote: ConsensusVote): void {
    const votes = this.activeVotes.get(proposalId);
    if (!votes) return;
    
    // Check if node already voted
    const existingVoteIndex = votes.findIndex(v => v.nodeId === vote.nodeId);
    if (existingVoteIndex >= 0) {
      // Update vote if changed
      votes[existingVoteIndex] = vote;
    } else {
      // Add new vote
      votes.push(vote);
    }
    
    console.log(`🗳️ Vote recorded from ${vote.nodeId}: ${vote.decision} (confidence: ${vote.confidence})`);
  }

  private tallyVotes(votes: ConsensusVote[]): VotingResult['summary'] {
    const summary = {
      approve: 0,
      reject: 0,
      abstain: 0,
      total: votes.length,
      requiredMajority: 0.67
    };
    
    for (const vote of votes) {
      // Weight votes by confidence
      const weight = vote.confidence;
      
      switch (vote.decision) {
        case 'approve':
          summary.approve += weight;
          break;
        case 'reject':
          summary.reject += weight;
          break;
        case 'abstain':
          summary.abstain += weight;
          break;
      }
    }
    
    return summary;
  }

  registerNode(node: VotingNode): void {
    this.nodes.set(node.id, node);
    console.log(`📝 Node registered: ${node.id} (trust: ${node.trustScore})`);
  }

  updateNodeTrust(nodeId: string, trustScore: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.trustScore = Math.max(0, Math.min(1, trustScore));
      console.log(`🔄 Trust updated for ${nodeId}: ${node.trustScore}`);
    }
  }

  getNodeStats(): { total: number; active: number; trusted: number } {
    const now = Date.now();
    const nodes = Array.from(this.nodes.values());
    
    return {
      total: nodes.length,
      active: nodes.filter(n => now - n.lastSeen < 30000).length,
      trusted: nodes.filter(n => n.trustScore >= 0.7).length
    };
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Voting Consensus System...');
    
    // Clear all timeouts
    for (const timeout of this.votingTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    // Shutdown hub
    // await this.hub.shutdown();
    
    console.log('✅ Voting Consensus System shut down');
  }
}

// Export for use in other modules
export default VotingConsensus;
export type { VotingNode, ConsensusVote, VotingProposal, VotingResult };