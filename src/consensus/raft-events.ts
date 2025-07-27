/**
 * RAFT Consensus Event Types and Schemas
 * 
 * Phase 1 Implementation: WebSocket Vote Distribution Layer
 * Integrates with Cursor's RAFT state machine core
 * 
 * Architecture:
 * - Event-driven RAFT communication via WebSocket
 * - Type-safe vote broadcasting and state synchronization  
 * - Real-time consensus coordination
 */

export interface RAFTNode {
  nodeId: string;
  agentId: string;
  currentTerm: number;
  state: 'LEADER' | 'FOLLOWER' | 'CANDIDATE';
  lastHeartbeat: string;
  votedFor?: string;
}

export interface RAFTVote {
  voteId: string;
  term: number;
  candidateId: string;
  voterId: string;
  granted: boolean;
  timestamp: string;
}

export interface RAFTLogEntry {
  index: number;
  term: number;
  command: any;
  timestamp: string;
  agentId: string;
}

export interface RAFTHeartbeat {
  heartbeatId: string;
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RAFTLogEntry[];
  leaderCommit: number;
  timestamp: string;
}

export interface RAFTAppendEntriesResponse {
  responseId: string;
  term: number;
  success: boolean;
  followerId: string;
  matchIndex?: number;
  timestamp: string;
}

// WebSocket Event Types for RAFT Communication
export interface RAFTEvent {
  type: 'VOTE_REQUEST' | 'VOTE_RESPONSE' | 'HEARTBEAT' | 'APPEND_ENTRIES' | 
        'APPEND_ENTRIES_RESPONSE' | 'STATE_CHANGE' | 'LEADER_ELECTION' | 'CONSENSUS_ACHIEVED';
  nodeId: string;
  term: number;
  timestamp: string;
  payload: RAFTVote | RAFTHeartbeat | RAFTAppendEntriesResponse | RAFTNode | any;
}

// Vote Request Event
export interface VoteRequestEvent extends RAFTEvent {
  type: 'VOTE_REQUEST';
  payload: {
    candidateId: string;
    lastLogIndex: number;
    lastLogTerm: number;
  };
}

// Vote Response Event  
export interface VoteResponseEvent extends RAFTEvent {
  type: 'VOTE_RESPONSE';
  payload: RAFTVote;
}

// Heartbeat Event
export interface HeartbeatEvent extends RAFTEvent {
  type: 'HEARTBEAT';
  payload: RAFTHeartbeat;
}

// State Change Event
export interface StateChangeEvent extends RAFTEvent {
  type: 'STATE_CHANGE';
  payload: {
    previousState: 'LEADER' | 'FOLLOWER' | 'CANDIDATE';
    newState: 'LEADER' | 'FOLLOWER' | 'CANDIDATE';
    reason: string;
  };
}

// Leader Election Event
export interface LeaderElectionEvent extends RAFTEvent {
  type: 'LEADER_ELECTION';
  payload: {
    newLeaderId: string;
    votesReceived: number;
    totalNodes: number;
  };
}

// Consensus Achievement Event
export interface ConsensusAchievedEvent extends RAFTEvent {
  type: 'CONSENSUS_ACHIEVED';
  payload: {
    decision: any;
    logIndex: number;
    participatingNodes: string[];
  };
}

export type RAFTEventUnion = VoteRequestEvent | VoteResponseEvent | HeartbeatEvent | 
                             StateChangeEvent | LeaderElectionEvent | ConsensusAchievedEvent;

// Performance metrics for RAFT operations
export interface RAFTMetrics {
  totalVotes: number;
  successfulElections: number;
  averageElectionTime: number;
  heartbeatLatency: number;
  consensusAchievementTime: number;
  nodesParticipating: number;
  lastConsensusTimestamp: string;
}