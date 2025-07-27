/**
 * RAFT WebSocket Vote Distribution System
 * 
 * Phase 1 Implementation: Real-time consensus communication layer
 * Integrates with Cursor's RAFT state machine via WebSocket events
 * 
 * Key Features:
 * - Real-time vote broadcasting across AI agents
 * - State synchronization for RAFT consensus
 * - Event-driven architecture for distributed coordination
 * - Performance monitoring for sub-second consensus
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { 
  RAFTEvent, 
  RAFTEventUnion,
  RAFTNode, 
  RAFTVote, 
  RAFTMetrics,
  VoteRequestEvent,
  VoteResponseEvent,
  HeartbeatEvent,
  StateChangeEvent,
  LeaderElectionEvent,
  ConsensusAchievedEvent
} from './raft-events.js';

interface ConnectedRAFTNode {
  nodeId: string;
  agentId: string;
  websocket: WebSocket;
  state: 'LEADER' | 'FOLLOWER' | 'CANDIDATE';
  currentTerm: number;
  lastActivity: Date;
  votesReceived: Set<string>;
}

export class RAFTWebSocketDistributor extends EventEmitter {
  private server: any;
  private wss: WebSocketServer;
  private port: number;
  private nodes: Map<string, ConnectedRAFTNode> = new Map();
  private currentTerm: number = 0;
  private metrics: RAFTMetrics;
  private electionStartTime: number = 0;

  constructor(port: number = 3005) {
    super();
    this.port = port;
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });
    
    this.metrics = {
      totalVotes: 0,
      successfulElections: 0,
      averageElectionTime: 0,
      heartbeatLatency: 0,
      consensusAchievementTime: 0,
      nodesParticipating: 0,
      lastConsensusTimestamp: new Date().toISOString()
    };

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, _request) => {
      console.log('🔗 RAFT node attempting to connect');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleRAFTEvent(ws, message);
        } catch (error) {
          console.error('❌ Invalid RAFT message format:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.handleNodeDisconnection(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
    });
  }

  private handleRAFTEvent(ws: WebSocket, event: RAFTEventUnion): void {
    console.log(`📡 RAFT Event: ${event.type} from node ${event.nodeId}`);

    // Update current term if higher
    if (event.term > this.currentTerm) {
      this.currentTerm = event.term;
    }

    switch (event.type) {
      case 'VOTE_REQUEST':
        this.handleVoteRequest(ws, event as VoteRequestEvent);
        break;
        
      case 'VOTE_RESPONSE':
        this.handleVoteResponse(ws, event as VoteResponseEvent);
        break;
        
      case 'HEARTBEAT':
        this.handleHeartbeat(ws, event as HeartbeatEvent);
        break;
        
      case 'STATE_CHANGE':
        this.handleStateChange(ws, event as StateChangeEvent);
        break;
        
      case 'LEADER_ELECTION':
        this.handleLeaderElection(ws, event as LeaderElectionEvent);
        break;
        
      case 'CONSENSUS_ACHIEVED':
        this.handleConsensusAchieved(ws, event as ConsensusAchievedEvent);
        break;
        
      default:
        console.warn(`⚠️ Unknown RAFT event type: ${(event as any).type}`);
    }

    // Emit event for local processing by Cursor's RAFT state machine
    this.emit('raft.event', event);
  }

  private handleVoteRequest(ws: WebSocket, event: VoteRequestEvent): void {
    const { nodeId, term, payload } = event;
    
    // Register or update the candidate node
    this.updateNodeInfo(ws, nodeId, 'CANDIDATE', term);
    
    // Start election timing
    if (this.electionStartTime === 0) {
      this.electionStartTime = Date.now();
    }

    // Broadcast vote request to all other nodes
    this.broadcastToOtherNodes(nodeId, event);
    
    console.log(`🗳️ Vote request from candidate ${payload.candidateId} for term ${term}`);
  }

  private handleVoteResponse(ws: WebSocket, event: VoteResponseEvent): void {
    const { nodeId, payload } = event;
    const vote = payload as RAFTVote;
    
    // Update metrics
    this.metrics.totalVotes++;
    
    // Track votes for the candidate
    const candidate = this.nodes.get(vote.candidateId);
    if (candidate) {
      if (vote.granted) {
        candidate.votesReceived.add(vote.voterId);
      }
      
      // Check if candidate has majority
      const majority = Math.floor(this.nodes.size / 2) + 1;
      if (candidate.votesReceived.size >= majority) {
        // Trigger leader election
        const electionTime = Date.now() - this.electionStartTime;
        this.electionStartTime = 0;
        
        const leaderEvent: LeaderElectionEvent = {
          type: 'LEADER_ELECTION',
          nodeId: vote.candidateId,
          term: vote.term,
          timestamp: new Date().toISOString(),
          payload: {
            newLeaderId: vote.candidateId,
            votesReceived: candidate.votesReceived.size,
            totalNodes: this.nodes.size
          }
        };
        
        this.handleLeaderElection(ws, leaderEvent);
      }
    }
    
    // Broadcast vote response to all nodes
    this.broadcastToAllNodes(event);
    
    console.log(`✅ Vote ${vote.granted ? 'granted' : 'denied'} by ${vote.voterId} for ${vote.candidateId}`);
  }

  private handleHeartbeat(ws: WebSocket, event: HeartbeatEvent): void {
    const { nodeId, term, payload } = event;
    const heartbeat = payload as any;
    
    // Update leader node info
    this.updateNodeInfo(ws, nodeId, 'LEADER', term);
    
    // Broadcast heartbeat to followers
    this.broadcastToOtherNodes(nodeId, event);
    
    // Update heartbeat latency metrics
    const latency = Date.now() - new Date(heartbeat.timestamp).getTime();
    this.metrics.heartbeatLatency = (this.metrics.heartbeatLatency + latency) / 2;
    
    console.log(`💓 Heartbeat from leader ${heartbeat.leaderId} for term ${term}`);
  }

  private handleStateChange(ws: WebSocket, event: StateChangeEvent): void {
    const { nodeId, term, payload } = event;
    
    // Update node state
    this.updateNodeInfo(ws, nodeId, payload.newState, term);
    
    // Broadcast state change to all nodes
    this.broadcastToAllNodes(event);
    
    console.log(`🔄 State change: ${nodeId} ${payload.previousState} → ${payload.newState}`);
  }

  private handleLeaderElection(_ws: WebSocket, event: LeaderElectionEvent): void {
    const { payload } = event;
    
    // Update metrics
    this.metrics.successfulElections++;
    const electionTime = Date.now() - this.electionStartTime;
    this.metrics.averageElectionTime = 
      (this.metrics.averageElectionTime + electionTime) / this.metrics.successfulElections;
    
    // Update leader node state
    const leader = this.nodes.get(payload.newLeaderId);
    if (leader) {
      leader.state = 'LEADER';
      leader.votesReceived.clear();
    }
    
    // Set all other nodes to followers
    this.nodes.forEach((node, nodeId) => {
      if (nodeId !== payload.newLeaderId) {
        node.state = 'FOLLOWER';
        node.votesReceived.clear();
      }
    });
    
    // Broadcast leader election result
    this.broadcastToAllNodes(event);
    
    console.log(`👑 New leader elected: ${payload.newLeaderId} with ${payload.votesReceived}/${payload.totalNodes} votes`);
  }

  private handleConsensusAchieved(_ws: WebSocket, event: ConsensusAchievedEvent): void {
    const { payload } = event;
    
    // Update metrics
    const consensusTime = Date.now() - this.electionStartTime;
    this.metrics.consensusAchievementTime = consensusTime;
    this.metrics.lastConsensusTimestamp = new Date().toISOString();
    this.metrics.nodesParticipating = payload.participatingNodes.length;
    
    // Broadcast consensus achievement
    this.broadcastToAllNodes(event);
    
    console.log(`🎯 Consensus achieved on log index ${payload.logIndex} with ${payload.participatingNodes.length} nodes`);
  }

  private updateNodeInfo(ws: WebSocket, nodeId: string, state: 'LEADER' | 'FOLLOWER' | 'CANDIDATE', term: number): void {
    const existingNode = this.nodes.get(nodeId);
    
    if (existingNode) {
      existingNode.state = state;
      existingNode.currentTerm = term;
      existingNode.lastActivity = new Date();
    } else {
      this.nodes.set(nodeId, {
        nodeId,
        agentId: nodeId, // For now, nodeId === agentId
        websocket: ws,
        state,
        currentTerm: term,
        lastActivity: new Date(),
        votesReceived: new Set()
      });
    }
  }

  private broadcastToAllNodes(event: RAFTEventUnion): void {
    const message = JSON.stringify(event);
    this.nodes.forEach((node) => {
      if (node.websocket.readyState === WebSocket.OPEN) {
        node.websocket.send(message);
      }
    });
  }

  private broadcastToOtherNodes(excludeNodeId: string, event: RAFTEventUnion): void {
    const message = JSON.stringify(event);
    this.nodes.forEach((node, nodeId) => {
      if (nodeId !== excludeNodeId && node.websocket.readyState === WebSocket.OPEN) {
        node.websocket.send(message);
      }
    });
  }

  private handleNodeDisconnection(ws: WebSocket): void {
    // Find and remove disconnected node
    for (const [nodeId, node] of this.nodes.entries()) {
      if (node.websocket === ws) {
        this.nodes.delete(nodeId);
        console.log(`🔌 RAFT node ${nodeId} disconnected`);
        
        // Emit disconnection event
        this.emit('node.disconnected', { nodeId, previousState: node.state });
        break;
      }
    }
  }

  // Public API for Cursor's RAFT state machine integration
  
  public async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 RAFT WebSocket Distributor started on port ${this.port}`);
        console.log(`📡 Real-time vote distribution: ACTIVE`);
        console.log(`🗳️ Consensus coordination: READY`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          console.log('🛑 RAFT WebSocket Distributor stopped');
          resolve();
        });
      });
    });
  }

  public getConnectedNodes(): RAFTNode[] {
    return Array.from(this.nodes.values()).map(node => ({
      nodeId: node.nodeId,
      agentId: node.agentId,
      currentTerm: node.currentTerm,
      state: node.state,
      lastHeartbeat: node.lastActivity.toISOString()
    }));
  }

  public getMetrics(): RAFTMetrics {
    return { ...this.metrics };
  }

  public getCurrentTerm(): number {
    return this.currentTerm;
  }

  public getClusterSize(): number {
    return this.nodes.size;
  }

  // Send RAFT event to all nodes (for Cursor's state machine to use)
  public broadcastRAFTEvent(event: RAFTEventUnion): void {
    this.broadcastToAllNodes(event);
    this.emit('raft.event.sent', event);
  }
}