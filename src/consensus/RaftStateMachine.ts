import { v4 as uuidv4 } from 'uuid';
import { MessageHub } from '../message-hub/MessageHub';

// RAFT State Machine for AI-to-AI Consensus
export enum RaftState {
  FOLLOWER = 'follower',
  CANDIDATE = 'candidate',
  LEADER = 'leader'
}

export interface RaftNode {
  id: string;
  state: RaftState;
  currentTerm: number;
  votedFor: string | null;
  log: RaftLogEntry[];
  commitIndex: number;
  lastApplied: number;
  nextIndex: Map<string, number>;
  matchIndex: Map<string, number>;
  electionTimeout: number;
  heartbeatInterval: number;
  lastHeartbeat: number;
}

export interface RaftLogEntry {
  term: number;
  index: number;
  command: string;
  data: any;
}

export interface VoteRequest {
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface VoteResponse {
  term: number;
  voteGranted: boolean;
}

export interface AppendEntriesRequest {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RaftLogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponse {
  term: number;
  success: boolean;
}

export class RaftStateMachine {
  private node: RaftNode;
  private messageHub: MessageHub;
  private electionTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(nodeId: string, messageHub: MessageHub) {
    this.messageHub = messageHub;
    this.node = {
      id: nodeId,
      state: RaftState.FOLLOWER,
      currentTerm: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      lastApplied: 0,
      nextIndex: new Map(),
      matchIndex: new Map(),
      electionTimeout: 150 + Math.random() * 150, // 150-300ms for AI agents
      heartbeatInterval: 50, // 50ms for fast AI coordination
      lastHeartbeat: Date.now()
    };
  }

  // Start the RAFT state machine
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.messageHub.initialize();
    console.log(`🚀 RAFT Node ${this.node.id} started as ${this.node.state}`);
    
    this.startElectionTimer();
    this.startHeartbeatTimer();
  }

  // Stop the RAFT state machine
  stop(): void {
    this.isRunning = false;
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    console.log(`🛑 RAFT Node ${this.node.id} stopped`);
  }

  // Start election timeout timer
  private startElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    
    this.electionTimer = setTimeout(() => {
      if (this.isRunning && this.node.state !== RaftState.LEADER) {
        this.startElection();
      }
    }, this.node.electionTimeout);
  }

  // Start heartbeat timer (for leaders)
  private startHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isRunning && this.node.state === RaftState.LEADER) {
        this.sendHeartbeat();
      }
    }, this.node.heartbeatInterval);
  }

  // Start leader election
  private async startElection(): Promise<void> {
    console.log(`🗳️ Node ${this.node.id} starting election for term ${this.node.currentTerm + 1}`);
    
    this.node.state = RaftState.CANDIDATE;
    this.node.currentTerm++;
    this.node.votedFor = this.node.id;
    
    // Reset election timer
    this.startElectionTimer();
    
    // Request votes from other nodes
    await this.requestVotes();
  }

  // Request votes from other nodes
  private async requestVotes(): Promise<void> {
    const voteRequest: VoteRequest = {
      term: this.node.currentTerm,
      candidateId: this.node.id,
      lastLogIndex: this.node.log.length - 1,
      lastLogTerm: this.node.log.length > 0 ? this.node.log[this.node.log.length - 1].term : 0
    };

    // Send vote request via Message Hub
    await this.messageHub.storeMessage({
      timestamp: new Date().toISOString(),
      from_agent: this.node.id,
      to_agent: 'raft-cluster',
      content: JSON.stringify({
        type: 'vote_request',
        data: voteRequest
      }),
      message_type: 'consensus',
      priority: 'high',
      source: 'websocket'
    });
  }

  // Send heartbeat to followers
  private async sendHeartbeat(): Promise<void> {
    const heartbeat: AppendEntriesRequest = {
      term: this.node.currentTerm,
      leaderId: this.node.id,
      prevLogIndex: this.node.log.length - 1,
      prevLogTerm: this.node.log.length > 0 ? this.node.log[this.node.log.length - 1].term : 0,
      entries: [],
      leaderCommit: this.node.commitIndex
    };

    // Send heartbeat via Message Hub
    await this.messageHub.storeMessage({
      timestamp: new Date().toISOString(),
      from_agent: this.node.id,
      to_agent: 'raft-cluster',
      content: JSON.stringify({
        type: 'heartbeat',
        data: heartbeat
      }),
      message_type: 'consensus',
      priority: 'medium',
      source: 'websocket'
    });
  }

  // Handle incoming vote request
  async handleVoteRequest(request: VoteRequest): Promise<VoteResponse> {
    console.log(`🗳️ Node ${this.node.id} received vote request from ${request.candidateId}`);
    
    // If request term is less than current term, reject
    if (request.term < this.node.currentTerm) {
      return { term: this.node.currentTerm, voteGranted: false };
    }

    // If request term is greater, step down to follower
    if (request.term > this.node.currentTerm) {
      this.stepDown(request.term);
    }

    // Check if we can vote for this candidate
    const canVote = this.node.votedFor === null || this.node.votedFor === request.candidateId;
    const logUpToDate = this.isLogUpToDate(request.lastLogIndex, request.lastLogTerm);

    if (canVote && logUpToDate) {
      this.node.votedFor = request.candidateId;
      this.startElectionTimer(); // Reset election timer
      
      console.log(`✅ Node ${this.node.id} voted for ${request.candidateId}`);
      return { term: this.node.currentTerm, voteGranted: true };
    }

    return { term: this.node.currentTerm, voteGranted: false };
  }

  // Handle incoming vote response
  async handleVoteResponse(response: VoteResponse, voterId: string): Promise<void> {
    if (response.term > this.node.currentTerm) {
      this.stepDown(response.term);
      return;
    }

    if (this.node.state === RaftState.CANDIDATE && response.voteGranted) {
      // Count votes and potentially become leader
      // This would be implemented with vote counting logic
      console.log(`✅ Node ${this.node.id} received vote from ${voterId}`);
    }
  }

  // Handle incoming append entries (heartbeat or log entries)
  async handleAppendEntries(request: AppendEntriesRequest): Promise<AppendEntriesResponse> {
    console.log(`📨 Node ${this.node.id} received append entries from ${request.leaderId}`);
    
    // If request term is less than current term, reject
    if (request.term < this.node.currentTerm) {
      return { term: this.node.currentTerm, success: false };
    }

    // If request term is greater, step down to follower
    if (request.term > this.node.currentTerm) {
      this.stepDown(request.term);
    }

    // Reset election timer since we heard from leader
    this.startElectionTimer();

    // Update last heartbeat
    this.node.lastHeartbeat = Date.now();

    // If this is a heartbeat (no entries), just acknowledge
    if (request.entries.length === 0) {
      return { term: this.node.currentTerm, success: true };
    }

    // Process log entries (simplified for now)
    // In a full implementation, this would handle log consistency checks
    return { term: this.node.currentTerm, success: true };
  }

  // Step down to follower state
  private stepDown(newTerm: number): void {
    console.log(`⬇️ Node ${this.node.id} stepping down to follower for term ${newTerm}`);
    
    this.node.state = RaftState.FOLLOWER;
    this.node.currentTerm = newTerm;
    this.node.votedFor = null;
    
    this.startElectionTimer();
  }

  // Check if log is up to date for voting
  private isLogUpToDate(lastLogIndex: number, lastLogTerm: number): boolean {
    const myLastLogIndex = this.node.log.length - 1;
    const myLastLogTerm = this.node.log.length > 0 ? this.node.log[myLastLogIndex].term : 0;
    
    return lastLogTerm > myLastLogTerm || 
           (lastLogTerm === myLastLogTerm && lastLogIndex >= myLastLogIndex);
  }

  // Get current node state
  getNodeState(): RaftNode {
    return { ...this.node };
  }

  // Get current state as string
  getStateString(): string {
    return `${this.node.state.toUpperCase()} (Term: ${this.node.currentTerm})`;
  }
} 