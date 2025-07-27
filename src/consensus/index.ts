import { RaftStateMachine } from './RaftStateMachine';
import { ConsensusStorage } from './ConsensusStorage';
import { MessageHub } from '../message-hub/MessageHub';
import { v4 as uuidv4 } from 'uuid';

// Consensus System - Phase 1 Implementation
export class ConsensusSystem {
  private raftNode: RaftStateMachine;
  private storage: ConsensusStorage;
  private messageHub: MessageHub;
  private nodeId: string;
  private isRunning = false;

  constructor(nodeId?: string) {
    this.nodeId = nodeId || `consensus-node-${uuidv4().slice(0, 8)}`;
    this.messageHub = new MessageHub();
    this.storage = new ConsensusStorage();
    this.raftNode = new RaftStateMachine(this.nodeId, this.messageHub);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      console.log('🚀 Starting Consensus System...');
      
      // Initialize storage and message hub
      await Promise.all([
        this.storage.initialize(),
        this.messageHub.initialize()
      ]);

      // Start RAFT state machine
      await this.raftNode.start();

      // Register this node
      const nodeState = this.raftNode.getNodeState();
      await this.storage.registerNode(nodeState);

      this.isRunning = true;
      console.log(`✅ Consensus System started - Node: ${this.nodeId}`);
      console.log(`📊 Initial State: ${this.raftNode.getStateString()}`);

      // Start message processing loop
      this.startMessageProcessing();
      
    } catch (error) {
      console.error('❌ Failed to start Consensus System:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log('🛑 Stopping Consensus System...');
      
      this.raftNode.stop();
      await this.storage.close();
      
      this.isRunning = false;
      console.log('✅ Consensus System stopped');
      
    } catch (error) {
      console.error('❌ Error stopping Consensus System:', error);
      throw error;
    }
  }

  private async startMessageProcessing(): Promise<void> {
    // Process messages every 100ms
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.processConsensusMessages();
      } catch (error) {
        console.error('❌ Error processing consensus messages:', error);
      }
    }, 100);
  }

  private async processConsensusMessages(): Promise<void> {
    // Get recent consensus messages from Message Hub
    const messages = await this.messageHub.listMessages({
      message_type: 'consensus',
      limit: 10
    });

    for (const message of messages) {
      try {
        const content = JSON.parse(message.content);
        
        switch (content.type) {
          case 'vote_request':
            await this.handleVoteRequest(content.data, message.from_agent);
            break;
          case 'vote_response':
            await this.handleVoteResponse(content.data, message.from_agent);
            break;
          case 'heartbeat':
            await this.handleHeartbeat(content.data, message.from_agent);
            break;
          case 'append_entries':
            await this.handleAppendEntries(content.data, message.from_agent);
            break;
          default:
            console.log(`⚠️ Unknown message type: ${content.type}`);
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    }
  }

  private async handleVoteRequest(request: any, from: string): Promise<void> {
    const response = await this.raftNode.handleVoteRequest(request);
    
    // Store vote request and response
    const requestId = await this.storage.storeVoteRequest(request);
    await this.storage.storeVoteResponse(requestId, response, this.nodeId);
    
    // Send response back
    await this.messageHub.storeMessage({
      timestamp: new Date().toISOString(),
      from_agent: this.nodeId,
      to_agent: from,
      content: JSON.stringify({
        type: 'vote_response',
        data: response
      }),
      message_type: 'consensus',
      priority: 'high',
      source: 'hub'
    });
  }

  private async handleVoteResponse(response: any, from: string): Promise<void> {
    await this.raftNode.handleVoteResponse(response, from);
    
    // Update node state in storage
    const nodeState = this.raftNode.getNodeState();
    await this.storage.updateNodeState(
      this.nodeId,
      nodeState.state,
      nodeState.currentTerm,
      nodeState.votedFor
    );
  }

  private async handleHeartbeat(heartbeat: any, from: string): Promise<void> {
    const response = await this.raftNode.handleAppendEntries(heartbeat);
    
    // Send acknowledgment back
    await this.messageHub.storeMessage({
      timestamp: new Date().toISOString(),
      from_agent: this.nodeId,
      to_agent: from,
      content: JSON.stringify({
        type: 'append_entries_response',
        data: response
      }),
      message_type: 'consensus',
      priority: 'medium',
      source: 'hub'
    });
  }

  private async handleAppendEntries(request: any, from: string): Promise<void> {
    const response = await this.raftNode.handleAppendEntries(request);
    
    // Send acknowledgment back
    await this.messageHub.storeMessage({
      timestamp: new Date().toISOString(),
      from_agent: this.nodeId,
      to_agent: from,
      content: JSON.stringify({
        type: 'append_entries_response',
        data: response
      }),
      message_type: 'consensus',
      priority: 'medium',
      source: 'hub'
    });
  }

  // Public API methods
  async getNodeState(): Promise<any> {
    return this.raftNode.getNodeState();
  }

  async getClusterStats(): Promise<any> {
    return this.storage.getClusterStats();
  }

  async submitCommand(command: string, data: any): Promise<void> {
    if (this.raftNode.getNodeState().state !== 'leader') {
      throw new Error('Only leader can submit commands');
    }

    // This would be implemented to add commands to the log
    console.log(`📝 Submitting command: ${command}`, data);
  }

  async getLogEntries(fromIndex: number, toIndex: number): Promise<any[]> {
    return this.storage.getLogEntries(fromIndex, toIndex);
  }
}

// Export for use in other modules
export { RaftStateMachine, ConsensusStorage };
export * from './RaftStateMachine';