/**
 * RAFT Integration Bridge
 * 
 * Phase 1 Implementation: Bridge between Claude's WebSocket distributor 
 * and Cursor's ConsensusSystem for unified real-time distributed consensus
 * 
 * Architecture:
 * - WebSocket → MessageHub → ConsensusSystem (vote processing)
 * - ConsensusSystem → MessageHub → WebSocket (state broadcasting)
 * - Unified API for distributed AI-to-AI consensus operations
 */

import { EventEmitter } from 'events';
import { RAFTWebSocketDistributor } from './raft-websocket-distributor.js';
import { RAFTEventUnion, VoteRequestEvent, VoteResponseEvent, HeartbeatEvent } from './raft-events.js';

interface ConsensusSystemInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  getNodeState(): Promise<any>;
  getClusterStats(): Promise<any>;
  submitCommand(command: string, data: any): Promise<void>;
}

export class RAFTIntegrationBridge extends EventEmitter {
  private websocketDistributor: RAFTWebSocketDistributor;
  private consensusSystem: ConsensusSystemInterface | null = null;
  private messageHubPort: number;
  private isRunning: boolean = false;

  constructor(websocketPort: number = 3005, messageHubPort: number = 3003) {
    super();
    this.messageHubPort = messageHubPort;
    this.websocketDistributor = new RAFTWebSocketDistributor(websocketPort);
    this.setupIntegration();
  }

  private setupIntegration(): void {
    // Bridge: WebSocket → MessageHub → ConsensusSystem
    this.websocketDistributor.on('raft.event', async (event: RAFTEventUnion) => {
      try {
        await this.forwardToConsensusSystem(event);
      } catch (error) {
        console.error('❌ Error forwarding WebSocket event to ConsensusSystem:', error);
      }
    });

    // Bridge: ConsensusSystem → WebSocket (via MessageHub polling)
    this.startConsensusSystemPolling();
  }

  private async forwardToConsensusSystem(event: RAFTEventUnion): Promise<void> {
    // Convert WebSocket RAFT events to MessageHub format for ConsensusSystem
    const messageHubPayload = {
      timestamp: new Date().toISOString(),
      from_agent: event.nodeId,
      to_agent: 'consensus-system',
      content: JSON.stringify({
        type: this.mapEventTypeToConsensusFormat(event.type),
        data: event.payload
      }),
      message_type: 'consensus',
      priority: this.mapEventPriority(event.type),
      source: 'websocket'
    };

    // Send to MessageHub for ConsensusSystem processing
    try {
      const response = await fetch(`http://localhost:${this.messageHubPort}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageHubPayload)
      });

      if (response.ok) {
        console.log(`📡 Forwarded ${event.type} to ConsensusSystem via MessageHub`);
        this.emit('event.forwarded', { event, success: true });
      } else {
        throw new Error(`MessageHub returned ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Failed to forward ${event.type} to MessageHub:`, error);
      this.emit('event.forwarded', { event, success: false, error });
    }
  }

  private mapEventTypeToConsensusFormat(eventType: string): string {
    const mapping: { [key: string]: string } = {
      'VOTE_REQUEST': 'vote_request',
      'VOTE_RESPONSE': 'vote_response',
      'HEARTBEAT': 'heartbeat',
      'APPEND_ENTRIES': 'append_entries',
      'APPEND_ENTRIES_RESPONSE': 'append_entries_response',
      'STATE_CHANGE': 'state_change',
      'LEADER_ELECTION': 'leader_election',
      'CONSENSUS_ACHIEVED': 'consensus_achieved'
    };
    return mapping[eventType] || eventType.toLowerCase();
  }

  private mapEventPriority(eventType: string): string {
    const highPriority = ['VOTE_REQUEST', 'VOTE_RESPONSE', 'LEADER_ELECTION'];
    const mediumPriority = ['HEARTBEAT', 'APPEND_ENTRIES', 'STATE_CHANGE'];
    
    if (highPriority.includes(eventType)) return 'high';
    if (mediumPriority.includes(eventType)) return 'medium';
    return 'low';
  }

  private startConsensusSystemPolling(): void {
    // Poll MessageHub for ConsensusSystem state changes to broadcast via WebSocket
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.pollConsensusSystemUpdates();
      } catch (error) {
        console.error('❌ Error polling ConsensusSystem updates:', error);
      }
    }, 200); // Poll every 200ms for near real-time updates
  }

  private async pollConsensusSystemUpdates(): Promise<void> {
    try {
      // Get recent consensus messages from MessageHub
      const response = await fetch(`http://localhost:${this.messageHubPort}/api/messages?message_type=consensus&limit=10&source=hub`);
      
      if (!response.ok) return;

      const messages = await response.json() as any[];
      
      for (const message of messages) {
        try {
          const content = JSON.parse(message.content);
          
          // Convert ConsensusSystem updates to WebSocket events
          const websocketEvent = this.mapConsensusUpdateToWebSocketEvent(content, message);
          
          if (websocketEvent) {
            this.websocketDistributor.broadcastRAFTEvent(websocketEvent);
            console.log(`📡 Broadcasted ${websocketEvent.type} via WebSocket`);
          }
        } catch (error) {
          console.error('❌ Error processing consensus update:', error);
        }
      }
    } catch (error) {
      console.error('❌ Error polling consensus updates:', error);
    }
  }

  private mapConsensusUpdateToWebSocketEvent(content: any, message: any): RAFTEventUnion | null {
    const baseEvent = {
      nodeId: message.from_agent,
      term: content.data?.term || 0,
      timestamp: message.timestamp
    };

    switch (content.type) {
      case 'vote_response':
        return {
          ...baseEvent,
          type: 'VOTE_RESPONSE',
          payload: content.data
        } as any;

      case 'state_change':
        return {
          ...baseEvent,
          type: 'STATE_CHANGE',
          payload: content.data
        } as any;

      case 'leader_election':
        return {
          ...baseEvent,
          type: 'LEADER_ELECTION',
          payload: content.data
        } as any;

      case 'consensus_achieved':
        return {
          ...baseEvent,
          type: 'CONSENSUS_ACHIEVED',
          payload: content.data
        } as any;

      default:
        return null;
    }
  }

  // Public API for unified consensus operations

  public async start(): Promise<void> {
    console.log('🚀 Starting RAFT Integration Bridge...');
    console.log('🔗 WebSocket ↔ MessageHub ↔ ConsensusSystem integration');
    console.log('⚡ Real-time distributed AI consensus: ACTIVE');

    await this.websocketDistributor.start();
    this.isRunning = true;

    console.log('✅ RAFT Integration Bridge operational');
    console.log('🤝 Claude WebSocket + Cursor ConsensusSystem: UNIFIED');
  }

  public async stop(): Promise<void> {
    console.log('🛑 Stopping RAFT Integration Bridge...');
    
    this.isRunning = false;
    await this.websocketDistributor.stop();
    
    console.log('✅ RAFT Integration Bridge stopped');
  }

  public setConsensusSystem(consensusSystem: ConsensusSystemInterface): void {
    this.consensusSystem = consensusSystem;
    console.log('🔗 ConsensusSystem connected to Integration Bridge');
  }

  public getWebSocketDistributor(): RAFTWebSocketDistributor {
    return this.websocketDistributor;
  }

  public async getUnifiedStatus() {
    const websocketStatus = {
      connectedNodes: this.websocketDistributor.getConnectedNodes(),
      metrics: this.websocketDistributor.getMetrics(),
      clusterSize: this.websocketDistributor.getClusterSize(),
      currentTerm: this.websocketDistributor.getCurrentTerm()
    };

    let consensusStatus = {};
    if (this.consensusSystem) {
      try {
        consensusStatus = {
          nodeState: await this.consensusSystem.getNodeState(),
          clusterStats: await this.consensusSystem.getClusterStats()
        };
      } catch (error) {
        consensusStatus = { error: 'ConsensusSystem unavailable' };
      }
    }

    return {
      status: 'operational',
      service: 'raft-integration-bridge',
      version: '1.0.0-phase1',
      timestamp: new Date().toISOString(),
      integration: {
        websocket: websocketStatus,
        consensus: consensusStatus,
        bridge: {
          running: this.isRunning,
          messageHubPort: this.messageHubPort,
          realTimeCoordination: 'ACTIVE'
        }
      },
      performance: {
        target: 'Sub-second distributed AI consensus',
        approach: 'Real-time WebSocket + Persistent ConsensusSystem',
        collaboration: 'Claude WebSocket + Cursor RAFT Algorithm'
      }
    };
  }

  // Convenience methods for AI agents to use the unified consensus system

  public async requestVote(candidateId: string, term: number, lastLogIndex: number, lastLogTerm: number): Promise<void> {
    const voteRequest: VoteRequestEvent = {
      type: 'VOTE_REQUEST',
      nodeId: candidateId,
      term,
      timestamp: new Date().toISOString(),
      payload: {
        candidateId,
        lastLogIndex,
        lastLogTerm
      }
    };

    this.websocketDistributor.broadcastRAFTEvent(voteRequest);
  }

  public async submitConsensusCommand(command: string, data: any): Promise<void> {
    if (this.consensusSystem) {
      await this.consensusSystem.submitCommand(command, data);
    } else {
      throw new Error('ConsensusSystem not connected to Integration Bridge');
    }
  }
}