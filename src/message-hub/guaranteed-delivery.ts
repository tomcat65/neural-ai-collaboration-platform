/**
 * Guaranteed Message Delivery System
 * 
 * Features:
 * - Immediate delivery confirmation
 * - Read receipt acknowledgment  
 * - Sender verification of receiver response
 * - Timeout handling for undelivered messages
 * - Retry mechanism with exponential backoff
 * - Multi-agent instance support
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface GuaranteedMessage {
  id: string;
  from: string;
  to: string | string[]; // Support single agent, multiple agents, or 'broadcast'
  content: string;
  messageType: 'content' | 'confirmation' | 'system'; // Infinite loop prevention
  deliveryMode: 'A2A' | 'A2MA' | 'broadcast'; // Agent-to-Agent, Agent-to-Multiple-Agents, broadcast
  timestamp: string;
  requiresAck: boolean;
  requiresReadReceipt: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: any;
  
  // Delivery tracking
  status: 'pending' | 'sent' | 'delivered' | 'acknowledged' | 'read' | 'timeout' | 'failed';
  deliveryAttempts: number;
  lastAttempt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  readAt?: string;
  timeoutAt?: string;
  
  // Multi-recipient tracking
  recipientStatus?: Map<string, {
    status: 'pending' | 'delivered' | 'acknowledged' | 'read' | 'failed';
    deliveredAt?: string;
    acknowledgedAt?: string;
    readAt?: string;
  }>;
  
  // Loop prevention
  confirmationChainDepth: number; // Max depth = 1
  processedBy?: Set<string>; // Deduplication tracking
}

export interface DeliveryConfirmation {
  messageId: string;
  status: 'delivered' | 'failed';
  timestamp: string;
  receiverInstance: string;
}

export interface AckResponse {
  originalMessageId: string;
  ackType: 'delivery' | 'read';
  timestamp: string;
  receiverAgent: string;
  receiverInstance: string;
}

export interface AgentInstance {
  agentId: string;
  instanceId: string;
  isOnline: boolean;
  lastSeen: string;
  capabilities: string[];
  websocketId?: string;
}

export class GuaranteedDeliverySystem extends EventEmitter {
  private pendingMessages: Map<string, GuaranteedMessage> = new Map();
  private agentInstances: Map<string, AgentInstance[]> = new Map();
  private deliveryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private ackTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly DEFAULT_DELIVERY_TIMEOUT = 5000; // 5 seconds
  private readonly DEFAULT_ACK_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_BASE = 1000; // 1 second

  constructor() {
    super();
    this.startCleanupRoutine();
  }

  /**
   * Send message with guaranteed delivery - supports A2A, A2MA, and broadcast
   */
  async sendMessage(
    from: string,
    to: string | string[] | 'broadcast',
    content: string,
    options: {
      messageType?: 'content' | 'confirmation' | 'system';
      priority?: 'low' | 'medium' | 'high' | 'critical';
      requiresAck?: boolean;
      requiresReadReceipt?: boolean;
      metadata?: any;
      confirmationChainDepth?: number;
    } = {}
  ): Promise<GuaranteedMessage> {
    
    // Determine delivery mode
    let deliveryMode: 'A2A' | 'A2MA' | 'broadcast';
    let recipients: string[];
    
    if (to === 'broadcast') {
      deliveryMode = 'broadcast';
      recipients = this.getAllRegisteredAgents();
    } else if (Array.isArray(to)) {
      deliveryMode = 'A2MA';
      recipients = to;
    } else {
      deliveryMode = 'A2A';
      recipients = [to];
    }

    // Infinite loop prevention: confirmations NEVER generate more confirmations
    const messageType = options.messageType ?? 'content';
    const confirmationDepth = options.confirmationChainDepth ?? 0;
    
    if (messageType === 'confirmation' && confirmationDepth > 0) {
      throw new Error('Confirmation messages cannot generate further confirmations (infinite loop prevention)');
    }

    const message: GuaranteedMessage = {
      id: uuidv4(),
      from,
      to,
      content,
      messageType,
      deliveryMode,
      timestamp: new Date().toISOString(),
      requiresAck: messageType === 'content' ? (options.requiresAck ?? true) : false,
      requiresReadReceipt: messageType === 'content' ? (options.requiresReadReceipt ?? true) : false,
      priority: options.priority ?? 'medium',
      metadata: options.metadata,
      status: 'pending',
      deliveryAttempts: 0,
      confirmationChainDepth: confirmationDepth,
      processedBy: new Set(),
      recipientStatus: new Map()
    };

    // Initialize recipient tracking for multi-recipient scenarios
    if (deliveryMode !== 'A2A') {
      recipients.forEach(recipient => {
        message.recipientStatus?.set(recipient, {
          status: 'pending'
        });
      });
    }

    // Store message for tracking
    this.pendingMessages.set(message.id, message);

    // Attempt delivery
    await this.attemptDelivery(message);

    return message;
  }

  /**
   * Attempt message delivery with retry logic
   */
  private async attemptDelivery(message: GuaranteedMessage): Promise<void> {
    message.deliveryAttempts++;
    message.lastAttempt = new Date().toISOString();
    message.status = 'sent';

    console.log(`📤 Attempting delivery #${message.deliveryAttempts}: ${message.from} → ${message.to} (${message.deliveryMode})`);

    try {
      let targetAgents: string[] = [];
      
      // Determine target agents based on delivery mode
      switch (message.deliveryMode) {
        case 'A2A':
          targetAgents = [message.to as string];
          break;
        case 'A2MA':
          targetAgents = message.to as string[];
          break;
        case 'broadcast':
          targetAgents = this.getAllRegisteredAgents().filter(agentId => agentId !== message.from);
          break;
      }

      console.log(`🎯 Target agents for ${message.deliveryMode}: [${targetAgents.join(', ')}]`);

      let anyDelivered = false;
      const deliveryResults: { [agentId: string]: boolean } = {};

      // Attempt delivery to each target agent
      for (const targetAgent of targetAgents) {
        const targetInstances = this.getAgentInstances(targetAgent);
        
        if (targetInstances.length === 0) {
          console.log(`❌ No online instances found for agent: ${targetAgent}`);
          deliveryResults[targetAgent] = false;
          
          // Update recipient status for multi-recipient messages
          if (message.recipientStatus) {
            const recipientStatus = message.recipientStatus.get(targetAgent);
            if (recipientStatus) {
              recipientStatus.status = 'failed';
            }
          }
          continue;
        }

        // Try to deliver to the first available instance of this agent
        let deliveredToAgent = false;
        for (const instance of targetInstances) {
          if (await this.deliverToInstance(message, instance)) {
            deliveredToAgent = true;
            anyDelivered = true;
            
            // Update recipient status for multi-recipient messages  
            if (message.recipientStatus) {
              const recipientStatus = message.recipientStatus.get(targetAgent);
              if (recipientStatus) {
                recipientStatus.status = 'delivered';
                recipientStatus.deliveredAt = new Date().toISOString();
              }
            }
            break; // Successfully delivered to this agent
          }
        }

        deliveryResults[targetAgent] = deliveredToAgent;
        
        if (!deliveredToAgent && message.recipientStatus) {
          const recipientStatus = message.recipientStatus.get(targetAgent);
          if (recipientStatus) {
            recipientStatus.status = 'failed';
          }
        }
      }

      // Check delivery success based on mode
      if (!anyDelivered) {
        await this.handleDeliveryFailure(message, 'Failed to deliver to any target agent');
        return;
      }

      // For A2A: full success only if delivered to the single target
      // For A2MA/broadcast: partial success is acceptable, track individual recipients
      if (message.deliveryMode === 'A2A' && !deliveryResults[targetAgents[0]]) {
        await this.handleDeliveryFailure(message, 'Failed to deliver to target agent');
        return;
      }

      // Mark message as delivered
      message.status = 'delivered';
      message.deliveredAt = new Date().toISOString();

      // Emit delivery confirmation to sender
      this.emit('messageDelivered', {
        messageId: message.id,
        deliveryMode: message.deliveryMode,
        targetAgents,
        deliveryResults,
        timestamp: new Date().toISOString()
      });

      // Set up acknowledgment timeout if required
      if (message.requiresAck && message.messageType === 'content') {
        this.setupAckTimeout(message);
      } else {
        // Message complete if no ack required or it's a confirmation message
        this.pendingMessages.delete(message.id);
      }

      console.log(`✅ Message delivered: ${message.id} (${message.deliveryMode})`);

    } catch (error) {
      console.error(`❌ Delivery error for message ${message.id}:`, error);
      await this.handleDeliveryFailure(message, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Deliver message to specific agent instance
   */
  private async deliverToInstance(message: GuaranteedMessage, instance: AgentInstance): Promise<boolean> {
    try {
      console.log(`📨 Delivering to instance: ${instance.agentId}/${instance.instanceId}`);

      // Emit event for message hub to handle actual delivery
      this.emit('deliverMessage', {
        message,
        targetInstance: instance
      });

      // For now, assume delivery succeeds if instance is online
      // In real implementation, this would wait for confirmation from transport layer
      return instance.isOnline;

    } catch (error) {
      console.error(`❌ Failed to deliver to instance ${instance.instanceId}:`, error);
      return false;
    }
  }

  /**
   * Handle delivery failure with retry logic
   */
  private async handleDeliveryFailure(message: GuaranteedMessage, reason: string): Promise<void> {
    console.log(`⚠️ Delivery failed for ${message.id}: ${reason}`);

    if (message.deliveryAttempts < this.MAX_RETRY_ATTEMPTS) {
      // Schedule retry with exponential backoff
      const retryDelay = this.RETRY_BACKOFF_BASE * Math.pow(2, message.deliveryAttempts - 1);
      
      console.log(`🔄 Scheduling retry in ${retryDelay}ms (attempt ${message.deliveryAttempts + 1}/${this.MAX_RETRY_ATTEMPTS})`);
      
      setTimeout(() => {
        this.attemptDelivery(message);
      }, retryDelay);

    } else {
      // Max retries exceeded
      message.status = 'failed';
      message.timeoutAt = new Date().toISOString();
      
      this.emit('messageDeliveryFailed', {
        messageId: message.id,
        reason: `Max retries exceeded: ${reason}`,
        timestamp: new Date().toISOString()
      });

      console.log(`❌ Message delivery failed permanently: ${message.id}`);
      
      // Clean up
      this.pendingMessages.delete(message.id);
    }
  }

  /**
   * Set up acknowledgment timeout
   */
  private setupAckTimeout(message: GuaranteedMessage): void {
    const timeout = setTimeout(() => {
      console.log(`⏰ Acknowledgment timeout for message: ${message.id}`);
      
      message.status = 'timeout';
      message.timeoutAt = new Date().toISOString();
      
      this.emit('acknowledgmentTimeout', {
        messageId: message.id,
        timestamp: new Date().toISOString()
      });
      
      // Clean up
      this.pendingMessages.delete(message.id);
      this.ackTimeouts.delete(message.id);
      
    }, this.DEFAULT_ACK_TIMEOUT);

    this.ackTimeouts.set(message.id, timeout);
  }

  /**
   * Process incoming acknowledgment
   */
  async processAcknowledgment(ack: AckResponse): Promise<void> {
    const message = this.pendingMessages.get(ack.originalMessageId);
    
    if (!message) {
      console.log(`⚠️ Received ack for unknown message: ${ack.originalMessageId}`);
      return;
    }

    // Infinite loop prevention: Track who has processed this acknowledgment
    if (message.processedBy?.has(`${ack.receiverAgent}:${ack.ackType}`)) {
      console.log(`🔄 Duplicate ${ack.ackType} acknowledgment from ${ack.receiverAgent} for ${ack.originalMessageId} - ignored (loop prevention)`);
      return;
    }

    message.processedBy?.add(`${ack.receiverAgent}:${ack.ackType}`);

    console.log(`📬 Received ${ack.ackType} acknowledgment for message: ${ack.originalMessageId} from ${ack.receiverAgent}`);

    if (ack.ackType === 'delivery') {
      // Update recipient status for multi-recipient messages
      if (message.recipientStatus && message.recipientStatus.has(ack.receiverAgent)) {
        const recipientStatus = message.recipientStatus.get(ack.receiverAgent)!;
        recipientStatus.status = 'acknowledged';
        recipientStatus.acknowledgedAt = ack.timestamp;
      }

      // For single recipient (A2A), update main message status
      if (message.deliveryMode === 'A2A') {
        message.status = 'acknowledged';
        message.acknowledgedAt = ack.timestamp;
        
        // Clear ack timeout
        const timeout = this.ackTimeouts.get(message.id);
        if (timeout) {
          clearTimeout(timeout);
          this.ackTimeouts.delete(message.id);
        }
      }

      // Send confirmation back to sender - LOOP PREVENTION: confirmation messages don't generate confirmations
      if (message.messageType === 'content') {
        try {
          await this.sendMessage(
            ack.receiverAgent,
            message.from,
            `DELIVERY_CONFIRMED: Message ${message.id} delivered and acknowledged`,
            {
              messageType: 'confirmation',
              confirmationChainDepth: message.confirmationChainDepth + 1,
              requiresAck: false,
              requiresReadReceipt: false,
              priority: 'medium',
              metadata: {
                originalMessageId: message.id,
                confirmationType: 'delivery_confirmation'
              }
            }
          );
        } catch (error) {
          console.error(`❌ Failed to send delivery confirmation: ${error}`);
        }
      }

      this.emit('messageAcknowledged', {
        messageId: message.id,
        deliveryMode: message.deliveryMode,
        timestamp: ack.timestamp,
        receiverAgent: ack.receiverAgent,
        receiverInstance: ack.receiverInstance
      });

    } else if (ack.ackType === 'read') {
      // Update recipient status for multi-recipient messages
      if (message.recipientStatus && message.recipientStatus.has(ack.receiverAgent)) {
        const recipientStatus = message.recipientStatus.get(ack.receiverAgent)!;
        recipientStatus.status = 'read';
        recipientStatus.readAt = ack.timestamp;
      }

      // For single recipient (A2A), update main message status
      if (message.deliveryMode === 'A2A') {
        message.status = 'read';
        message.readAt = ack.timestamp;
      }

      // Send read confirmation back to sender - LOOP PREVENTION: confirmation messages don't generate confirmations
      if (message.messageType === 'content') {
        try {
          await this.sendMessage(
            ack.receiverAgent,
            message.from,
            `READ_CONFIRMED: Message ${message.id} read by ${ack.receiverAgent}`,
            {
              messageType: 'confirmation',
              confirmationChainDepth: message.confirmationChainDepth + 1,
              requiresAck: false,
              requiresReadReceipt: false,
              priority: 'medium',
              metadata: {
                originalMessageId: message.id,
                confirmationType: 'read_confirmation'
              }
            }
          );
        } catch (error) {
          console.error(`❌ Failed to send read confirmation: ${error}`);
        }
      }

      this.emit('messageRead', {
        messageId: message.id,
        deliveryMode: message.deliveryMode,
        timestamp: ack.timestamp,
        receiverAgent: ack.receiverAgent,
        receiverInstance: ack.receiverInstance
      });

      // Check if all recipients have read the message (for A2MA/broadcast)
      const allRead = this.areAllRecipientsRead(message);
      if (allRead || message.deliveryMode === 'A2A') {
        console.log(`✅ Message lifecycle complete: ${message.id}`);
        this.pendingMessages.delete(message.id);
      }
    }
  }

  /**
   * Check if all recipients have read the message (for multi-recipient scenarios)
   */
  private areAllRecipientsRead(message: GuaranteedMessage): boolean {
    if (!message.recipientStatus || message.deliveryMode === 'A2A') {
      return true;
    }

    for (const [agentId, status] of message.recipientStatus.entries()) {
      if (status.status !== 'read' && status.status !== 'failed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Register agent instance
   */
  registerAgentInstance(agentId: string, instanceId: string, capabilities: string[] = []): void {
    if (!this.agentInstances.has(agentId)) {
      this.agentInstances.set(agentId, []);
    }

    const instances = this.agentInstances.get(agentId)!;
    
    // Remove existing instance if exists
    const existingIndex = instances.findIndex(i => i.instanceId === instanceId);
    if (existingIndex >= 0) {
      instances.splice(existingIndex, 1);
    }

    // Add new instance
    instances.push({
      agentId,
      instanceId,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      capabilities
    });

    console.log(`✅ Registered agent instance: ${agentId}/${instanceId}`);
    
    this.emit('agentInstanceRegistered', { agentId, instanceId });
  }

  /**
   * Get all registered agent IDs for broadcast functionality
   */
  private getAllRegisteredAgents(): string[] {
    const agentIds: string[] = [];
    for (const [agentId, instances] of this.agentInstances.entries()) {
      // Only include agents that have at least one online instance
      if (instances.some(instance => instance.isOnline)) {
        agentIds.push(agentId);
      }
    }
    return agentIds;
  }

  /**
   * Mark agent instance as offline
   */
  markAgentOffline(agentId: string, instanceId: string): void {
    const instances = this.agentInstances.get(agentId);
    if (instances) {
      const instance = instances.find(i => i.instanceId === instanceId);
      if (instance) {
        instance.isOnline = false;
        console.log(`📴 Agent instance offline: ${agentId}/${instanceId}`);
        
        this.emit('agentInstanceOffline', { agentId, instanceId });
      }
    }
  }

  /**
   * Get online instances for agent
   */
  private getAgentInstances(agentId: string): AgentInstance[] {
    const instances = this.agentInstances.get(agentId) || [];
    return instances.filter(instance => instance.isOnline);
  }

  /**
   * Get message status
   */
  getMessageStatus(messageId: string): GuaranteedMessage | null {
    return this.pendingMessages.get(messageId) || null;
  }

  /**
   * Get all pending messages for debugging
   */
  getAllPendingMessages(): GuaranteedMessage[] {
    return Array.from(this.pendingMessages.values());
  }

  /**
   * Get agent instance status
   */
  getAgentStatus(agentId: string): AgentInstance[] {
    return this.agentInstances.get(agentId) || [];
  }

  /**
   * Cleanup routine for old messages and timeouts
   */
  private startCleanupRoutine(): void {
    setInterval(() => {
      const now = Date.now();
      const cleanupThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [messageId, message] of this.pendingMessages.entries()) {
        const messageTime = new Date(message.timestamp).getTime();
        
        if (now - messageTime > cleanupThreshold) {
          console.log(`🧹 Cleaning up old message: ${messageId}`);
          
          // Clear any timeouts
          const deliveryTimeout = this.deliveryTimeouts.get(messageId);
          const ackTimeout = this.ackTimeouts.get(messageId);
          
          if (deliveryTimeout) {
            clearTimeout(deliveryTimeout);
            this.deliveryTimeouts.delete(messageId);
          }
          
          if (ackTimeout) {
            clearTimeout(ackTimeout);
            this.ackTimeouts.delete(messageId);
          }
          
          this.pendingMessages.delete(messageId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Shutdown the delivery system
   */
  shutdown(): void {
    // Clear all timeouts
    for (const timeout of this.deliveryTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    for (const timeout of this.ackTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    this.deliveryTimeouts.clear();
    this.ackTimeouts.clear();
    this.pendingMessages.clear();
    this.agentInstances.clear();
    
    console.log('✅ Guaranteed delivery system shutdown');
  }
}