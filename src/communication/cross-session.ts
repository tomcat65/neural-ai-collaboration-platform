import { promises as fs } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { watch } from 'chokidar';

/**
 * Cross-Session Communication Manager
 * Enables persistent communication between AI agents across session restarts
 */
export class CrossSessionCommunicationManager extends EventEmitter {
  private agentId: string;
  private workingDirectory: string;
  private communicationDir: string;
  private inboxPath: string;
  private outboxPath: string;
  private statusPath: string;
  private isActive: boolean = false;
  private fileWatcher: any = null;
  private messageQueue: PendingMessage[] = [];

  constructor(agentId: string, workingDirectory: string = process.cwd()) {
    super();
    this.agentId = agentId;
    this.workingDirectory = workingDirectory;
    this.communicationDir = join(workingDirectory, 'data', 'cross-session');
    this.inboxPath = join(this.communicationDir, `${agentId}-inbox.json`);
    this.outboxPath = join(this.communicationDir, `${agentId}-outbox.json`);
    this.statusPath = join(this.communicationDir, `${agentId}-status.json`);
  }

  /**
   * Initialize cross-session communication
   */
  async initialize(): Promise<void> {
    try {
      console.log(`📡 Initializing cross-session communication for agent ${this.agentId}`);

      // Create communication directory
      await fs.mkdir(this.communicationDir, { recursive: true });

      // Initialize communication files
      await this.initializeCommunicationFiles();

      // Start file watching for incoming messages
      await this.startFileWatcher();

      // Load pending messages from previous session
      await this.loadPendingMessages();

      // Update agent status
      await this.updateAgentStatus('online');

      this.isActive = true;
      console.log(`✅ Cross-session communication active for agent ${this.agentId}`);

    } catch (error) {
      console.error(`❌ Failed to initialize cross-session communication:`, error);
      throw error;
    }
  }

  /**
   * Initialize communication files if they don't exist
   */
  private async initializeCommunicationFiles(): Promise<void> {
    const initialInbox: MessageBox = {
      agentId: this.agentId,
      messages: [],
      lastUpdated: new Date().toISOString()
    };

    const initialOutbox: MessageBox = {
      agentId: this.agentId,
      messages: [],
      lastUpdated: new Date().toISOString()
    };

    // Create inbox if it doesn't exist
    try {
      await fs.access(this.inboxPath);
    } catch (error) {
      await fs.writeFile(this.inboxPath, JSON.stringify(initialInbox, null, 2));
      console.log(`📥 Created inbox file for agent ${this.agentId}`);
    }

    // Create outbox if it doesn't exist
    try {
      await fs.access(this.outboxPath);
    } catch (error) {
      await fs.writeFile(this.outboxPath, JSON.stringify(initialOutbox, null, 2));
      console.log(`📤 Created outbox file for agent ${this.agentId}`);
    }
  }

  /**
   * Start file watcher for incoming messages
   */
  private async startFileWatcher(): Promise<void> {
    this.fileWatcher = watch(this.inboxPath, {
      persistent: true,
      ignoreInitial: false
    });

    this.fileWatcher.on('change', async () => {
      await this.processIncomingMessages();
    });

    console.log(`👁️ File watcher started for agent ${this.agentId} inbox`);
  }

  /**
   * Send message to another agent
   */
  async sendMessage(targetAgentId: string, message: CrossSessionMessage): Promise<void> {
    try {
      const fullMessage: CrossSessionMessage = {
        ...message,
        id: message.id || this.generateMessageId(),
        fromAgent: this.agentId,
        toAgent: targetAgentId,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      // Add to our outbox
      await this.addToOutbox(fullMessage);

      // Add to target agent's inbox
      await this.addToTargetInbox(targetAgentId, fullMessage);

      console.log(`📨 Message sent from ${this.agentId} to ${targetAgentId}: ${message.type}`);

      // Emit event for local handling
      this.emit('message_sent', fullMessage);

    } catch (error) {
      console.error(`❌ Failed to send message to ${targetAgentId}:`, error);
      throw error;
    }
  }

  /**
   * Get all unread messages for this agent
   */
  async getUnreadMessages(): Promise<CrossSessionMessage[]> {
    try {
      const inbox = await this.loadInbox();
      return inbox.messages.filter(msg => msg.status === 'unread');
    } catch (error) {
      console.error(`❌ Failed to get unread messages:`, error);
      return [];
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    try {
      const inbox = await this.loadInbox();
      const message = inbox.messages.find(msg => msg.id === messageId);
      
      if (message) {
        message.status = 'read';
        message.readAt = new Date().toISOString();
        
        await this.saveInbox(inbox);
        console.log(`✅ Message ${messageId} marked as read`);
        
        this.emit('message_read', message);
      }
    } catch (error) {
      console.error(`❌ Failed to mark message as read:`, error);
    }
  }

  /**
   * Reply to a message
   */
  async replyToMessage(originalMessageId: string, replyContent: string, replyType: string = 'reply'): Promise<void> {
    try {
      const inbox = await this.loadInbox();
      const originalMessage = inbox.messages.find(msg => msg.id === originalMessageId);
      
      if (!originalMessage) {
        throw new Error(`Original message ${originalMessageId} not found`);
      }

      const replyMessage: CrossSessionMessage = {
        id: this.generateMessageId(),
        fromAgent: this.agentId,
        toAgent: originalMessage.fromAgent,
        type: replyType,
        content: replyContent,
        timestamp: new Date().toISOString(),
        status: 'pending',
        replyTo: originalMessageId,
        priority: originalMessage.priority || 'normal'
      };

      await this.sendMessage(originalMessage.fromAgent, replyMessage);
      console.log(`↩️ Reply sent to message ${originalMessageId}`);

    } catch (error) {
      console.error(`❌ Failed to reply to message:`, error);
      throw error;
    }
  }

  /**
   * Process incoming messages
   */
  private async processIncomingMessages(): Promise<void> {
    try {
      const unreadMessages = await this.getUnreadMessages();
      
      for (const message of unreadMessages) {
        console.log(`📥 Processing incoming message: ${message.type} from ${message.fromAgent}`);
        
        // Emit event for message handling
        this.emit('message_received', message);
        
        // Auto-mark as read for now (can be customized)
        if (message.type !== 'urgent') {
          await this.markMessageAsRead(message.id);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing incoming messages:`, error);
    }
  }

  /**
   * Load pending messages from previous session
   */
  private async loadPendingMessages(): Promise<void> {
    try {
      const inbox = await this.loadInbox();
      const pendingMessages = inbox.messages.filter(msg => 
        msg.status === 'unread' || msg.status === 'pending'
      );

      this.messageQueue.push(...pendingMessages.map(msg => ({
        message: msg,
        attempts: 0,
        lastAttempt: new Date()
      })));

      if (pendingMessages.length > 0) {
        console.log(`📋 Loaded ${pendingMessages.length} pending messages from previous session`);
        
        // Process them after a short delay
        setTimeout(() => {
          this.processIncomingMessages();
        }, 1000);
      }
    } catch (error) {
      console.error(`❌ Failed to load pending messages:`, error);
    }
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(status: 'online' | 'offline' | 'busy' | 'away'): Promise<void> {
    try {
      const agentStatus: AgentStatus = {
        agentId: this.agentId,
        status,
        lastSeen: new Date().toISOString(),
        sessionId: this.generateSessionId(),
        capabilities: ['cross-session-communication', 'persistent-memory', 'automated-commits'],
        workingDirectory: this.workingDirectory
      };

      await fs.writeFile(this.statusPath, JSON.stringify(agentStatus, null, 2));
      console.log(`📊 Agent status updated: ${status}`);

    } catch (error) {
      console.error(`❌ Failed to update agent status:`, error);
    }
  }

  /**
   * Get status of all agents
   */
  async getAllAgentStatuses(): Promise<AgentStatus[]> {
    try {
      const statusFiles = await fs.readdir(this.communicationDir);
      const agentStatusFiles = statusFiles.filter(file => file.endsWith('-status.json'));
      
      const statuses: AgentStatus[] = [];
      
      for (const statusFile of agentStatusFiles) {
        try {
          const statusPath = join(this.communicationDir, statusFile);
          const statusData = await fs.readFile(statusPath, 'utf-8');
          const status = JSON.parse(statusData) as AgentStatus;
          statuses.push(status);
        } catch (error) {
          console.warn(`⚠️ Failed to read status file ${statusFile}:`, error);
        }
      }

      return statuses;
    } catch (error) {
      console.error(`❌ Failed to get agent statuses:`, error);
      return [];
    }
  }

  /**
   * Shutdown cross-session communication
   */
  async shutdown(): Promise<void> {
    try {
      // Update status to offline
      await this.updateAgentStatus('offline');

      // Stop file watcher
      if (this.fileWatcher) {
        await this.fileWatcher.close();
        this.fileWatcher = null;
      }

      // Save any pending messages
      if (this.messageQueue.length > 0) {
        console.log(`💾 Saving ${this.messageQueue.length} pending messages`);
        // Implementation would save queue state
      }

      this.isActive = false;
      console.log(`🔌 Cross-session communication shutdown for agent ${this.agentId}`);

    } catch (error) {
      console.error(`❌ Error during shutdown:`, error);
    }
  }

  /**
   * Add message to outbox
   */
  private async addToOutbox(message: CrossSessionMessage): Promise<void> {
    const outbox = await this.loadOutbox();
    outbox.messages.push(message);
    outbox.lastUpdated = new Date().toISOString();
    await this.saveOutbox(outbox);
  }

  /**
   * Add message to target agent's inbox
   */
  private async addToTargetInbox(targetAgentId: string, message: CrossSessionMessage): Promise<void> {
    const targetInboxPath = join(this.communicationDir, `${targetAgentId}-inbox.json`);
    
    let targetInbox: MessageBox;
    try {
      const inboxData = await fs.readFile(targetInboxPath, 'utf-8');
      targetInbox = JSON.parse(inboxData);
    } catch (error) {
      // Create new inbox if it doesn't exist
      targetInbox = {
        agentId: targetAgentId,
        messages: [],
        lastUpdated: new Date().toISOString()
      };
    }

    // Mark message as unread for target
    message.status = 'unread';
    targetInbox.messages.push(message);
    targetInbox.lastUpdated = new Date().toISOString();

    await fs.writeFile(targetInboxPath, JSON.stringify(targetInbox, null, 2));
  }

  /**
   * Load inbox
   */
  private async loadInbox(): Promise<MessageBox> {
    const inboxData = await fs.readFile(this.inboxPath, 'utf-8');
    return JSON.parse(inboxData);
  }

  /**
   * Save inbox
   */
  private async saveInbox(inbox: MessageBox): Promise<void> {
    inbox.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.inboxPath, JSON.stringify(inbox, null, 2));
  }

  /**
   * Load outbox
   */
  private async loadOutbox(): Promise<MessageBox> {
    const outboxData = await fs.readFile(this.outboxPath, 'utf-8');
    return JSON.parse(outboxData);
  }

  /**
   * Save outbox
   */
  private async saveOutbox(outbox: MessageBox): Promise<void> {
    outbox.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.outboxPath, JSON.stringify(outbox, null, 2));
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${this.agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${this.agentId}_${Date.now()}`;
  }
}

/**
 * Cross-session message interface
 */
export interface CrossSessionMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: string;
  content: string;
  timestamp: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'unread';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  replyTo?: string;
  readAt?: string;
  metadata?: Record<string, any>;
}

/**
 * Message box interface
 */
export interface MessageBox {
  agentId: string;
  messages: CrossSessionMessage[];
  lastUpdated: string;
}

/**
 * Agent status interface
 */
export interface AgentStatus {
  agentId: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  lastSeen: string;
  sessionId: string;
  capabilities: string[];
  workingDirectory: string;
  metadata?: Record<string, any>;
}

/**
 * Pending message interface
 */
interface PendingMessage {
  message: CrossSessionMessage;
  attempts: number;
  lastAttempt: Date;
}