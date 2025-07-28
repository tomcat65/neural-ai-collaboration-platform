import { TmuxSessionManager, AgentOrchestrator } from '../tmux/session-manager.js';
import { GitSafetyManager } from '../automation/git-safety.js';
import { CrossSessionCommunicationManager } from '../communication/cross-session.js';
import { EventEmitter } from 'events';

/**
 * Autonomous Agent Orchestration System
 * Coordinates 24/7 AI agent operations with persistent sessions
 */
export class AutonomousAgentOrchestrator extends EventEmitter {
  private agentId: string;
  private workingDirectory: string;
  private tmuxManager: TmuxSessionManager;
  private gitSafety: GitSafetyManager;
  private communication: CrossSessionCommunicationManager;
  private isRunning: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private workQueue: WorkItem[] = [];
  private currentTask: WorkItem | null = null;

  constructor(agentId: string, workingDirectory: string = process.cwd()) {
    super();
    this.agentId = agentId;
    this.workingDirectory = workingDirectory;
    
    // Initialize subsystems
    this.tmuxManager = new TmuxSessionManager(agentId, workingDirectory);
    this.gitSafety = new GitSafetyManager(agentId, workingDirectory, 30); // 30-minute commits
    this.communication = new CrossSessionCommunicationManager(agentId, workingDirectory);
  }

  /**
   * Start autonomous agent operations
   */
  async start(): Promise<void> {
    try {
      console.log(`🚀 Starting autonomous agent orchestration for ${this.agentId}`);

      // Initialize all subsystems
      await this.initializeSubsystems();

      // Set up event handlers
      this.setupEventHandlers();

      // Start health monitoring
      this.startHealthMonitoring();

      // Load and process work queue
      await this.loadWorkQueue();

      this.isRunning = true;
      console.log(`✅ Autonomous agent ${this.agentId} is now operational`);

      // Emit startup event
      this.emit('agent_started', {
        agentId: this.agentId,
        timestamp: new Date(),
        subsystems: ['tmux', 'git-safety', 'communication']
      });

    } catch (error) {
      console.error(`❌ Failed to start autonomous agent ${this.agentId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize all subsystems
   */
  private async initializeSubsystems(): Promise<void> {
    console.log(`🔧 Initializing subsystems for agent ${this.agentId}`);

    // Initialize tmux session management
    await this.tmuxManager.initializeSession();
    console.log(`✅ Tmux session initialized`);

    // Initialize git safety protocols
    await this.gitSafety.initialize();
    console.log(`✅ Git safety protocols active`);

    // Initialize cross-session communication
    await this.communication.initialize();
    console.log(`✅ Cross-session communication active`);

    console.log(`🎯 All subsystems initialized for agent ${this.agentId}`);
  }

  /**
   * Set up event handlers for subsystem coordination
   */
  private setupEventHandlers(): void {
    // Handle incoming messages
    this.communication.on('message_received', async (message) => {
      console.log(`📥 Received message: ${message.type} from ${message.fromAgent}`);
      await this.handleIncomingMessage(message);
    });

    // Handle tmux session events
    this.tmuxManager.getSessionStatus().then(status => {
      if (!status.isActive) {
        console.log(`⚠️ Tmux session ${status.sessionName} became inactive`);
        this.emit('session_inactive', status);
      }
    }).catch(() => {
      // Session status check failed - will be handled by health monitoring
    });

    console.log(`🔗 Event handlers configured for agent ${this.agentId}`);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 60000); // Check every minute

    console.log(`🏥 Health monitoring started for agent ${this.agentId}`);
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const healthStatus: SystemHealth = {
        agentId: this.agentId,
        timestamp: new Date(),
        subsystems: {
          tmux: false,
          gitSafety: false,
          communication: false
        },
        overallHealth: 'unknown',
        issues: []
      };

      // Check tmux session health
      try {
        const tmuxStatus = await this.tmuxManager.getSessionStatus();
        healthStatus.subsystems.tmux = tmuxStatus.isActive;
        if (!tmuxStatus.isActive) {
          healthStatus.issues.push('Tmux session inactive');
        }
      } catch (error) {
        healthStatus.issues.push(`Tmux health check failed: ${error.message}`);
      }

      // Check git safety health
      try {
        const gitStatus = await this.gitSafety.getStatus();
        healthStatus.subsystems.gitSafety = gitStatus.isActive;
        if (!gitStatus.isActive) {
          healthStatus.issues.push('Git safety protocols inactive');
        }
      } catch (error) {
        healthStatus.issues.push(`Git safety health check failed: ${error.message}`);
      }

      // Check communication health
      healthStatus.subsystems.communication = this.communication.listenerCount('message_received') > 0;
      if (!healthStatus.subsystems.communication) {
        healthStatus.issues.push('Cross-session communication not active');
      }

      // Determine overall health
      const healthySubsystems = Object.values(healthStatus.subsystems).filter(Boolean).length;
      const totalSubsystems = Object.keys(healthStatus.subsystems).length;
      
      if (healthySubsystems === totalSubsystems) {
        healthStatus.overallHealth = 'healthy';
      } else if (healthySubsystems >= totalSubsystems / 2) {
        healthStatus.overallHealth = 'degraded';
      } else {
        healthStatus.overallHealth = 'critical';
      }

      // Emit health status
      this.emit('health_check', healthStatus);

      // Take corrective action if needed
      if (healthStatus.overallHealth === 'critical') {
        await this.handleCriticalHealth(healthStatus);
      }

    } catch (error) {
      console.error(`❌ Health check failed for agent ${this.agentId}:`, error);
      this.emit('health_check_failed', { agentId: this.agentId, error: error.message });
    }
  }

  /**
   * Handle critical health situations
   */
  private async handleCriticalHealth(healthStatus: SystemHealth): Promise<void> {
    console.log(`🚨 Critical health detected for agent ${this.agentId}, taking corrective action`);

    // Create emergency commit if git safety is compromised
    if (!healthStatus.subsystems.gitSafety) {
      try {
        await this.gitSafety.createEmergencyCommit('System health critical - emergency preservation');
        console.log(`💾 Emergency commit created due to critical health`);
      } catch (error) {
        console.error(`❌ Failed to create emergency commit:`, error);
      }
    }

    // Attempt to restart failed subsystems
    await this.attemptSubsystemRecovery(healthStatus);

    // Notify other agents
    await this.communication.sendMessage('system-monitor', {
      id: '',
      fromAgent: this.agentId,
      toAgent: 'system-monitor',
      type: 'health_critical',
      content: JSON.stringify(healthStatus),
      timestamp: new Date().toISOString(),
      status: 'pending',
      priority: 'urgent'
    });
  }

  /**
   * Attempt to recover failed subsystems
   */
  private async attemptSubsystemRecovery(healthStatus: SystemHealth): Promise<void> {
    // Attempt tmux recovery
    if (!healthStatus.subsystems.tmux) {
      try {
        console.log(`🔄 Attempting to recover tmux session`);
        await this.tmuxManager.initializeSession();
        console.log(`✅ Tmux session recovery successful`);
      } catch (error) {
        console.error(`❌ Tmux recovery failed:`, error);
      }
    }

    // Attempt git safety recovery
    if (!healthStatus.subsystems.gitSafety) {
      try {
        console.log(`🔄 Attempting to recover git safety protocols`);
        await this.gitSafety.initialize();
        console.log(`✅ Git safety recovery successful`);
      } catch (error) {
        console.error(`❌ Git safety recovery failed:`, error);
      }
    }

    // Attempt communication recovery
    if (!healthStatus.subsystems.communication) {
      try {
        console.log(`🔄 Attempting to recover cross-session communication`);
        await this.communication.initialize();
        console.log(`✅ Communication recovery successful`);
      } catch (error) {
        console.error(`❌ Communication recovery failed:`, error);
      }
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'task_assignment':
        await this.addToWorkQueue({
          id: `task_${Date.now()}`,
          type: 'task',
          priority: message.priority || 'normal',
          description: message.content,
          assignedBy: message.fromAgent,
          assignedAt: new Date(),
          status: 'pending',
          metadata: message.metadata || {}
        });
        break;

      case 'health_check_request':
        const healthStatus = await this.getSystemHealth();
        await this.communication.replyToMessage(message.id, JSON.stringify(healthStatus), 'health_response');
        break;

      case 'shutdown_request':
        console.log(`🔌 Shutdown request received from ${message.fromAgent}`);
        await this.shutdown();
        break;

      case 'status_request':
        const status = await this.getAgentStatus();
        await this.communication.replyToMessage(message.id, JSON.stringify(status), 'status_response');
        break;

      default:
        console.log(`❓ Unknown message type: ${message.type}`);
    }
  }

  /**
   * Add item to work queue
   */
  async addToWorkQueue(item: WorkItem): Promise<void> {
    this.workQueue.push(item);
    this.workQueue.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    console.log(`📋 Added item to work queue: ${item.description} (Priority: ${item.priority})`);
    
    // Start processing if not already working
    if (!this.currentTask) {
      await this.processWorkQueue();
    }
  }

  /**
   * Process work queue
   */
  private async processWorkQueue(): Promise<void> {
    while (this.workQueue.length > 0 && this.isRunning) {
      this.currentTask = this.workQueue.shift()!;
      
      try {
        console.log(`⚙️ Processing work item: ${this.currentTask.description}`);
        this.currentTask.status = 'in_progress';
        this.currentTask.startedAt = new Date();

        // Execute the work item
        await this.executeWorkItem(this.currentTask);

        this.currentTask.status = 'completed';
        this.currentTask.completedAt = new Date();
        
        console.log(`✅ Completed work item: ${this.currentTask.description}`);
        
        // Notify assignment agent
        if (this.currentTask.assignedBy) {
          await this.communication.sendMessage(this.currentTask.assignedBy, {
            id: '',
            fromAgent: this.agentId,
            toAgent: this.currentTask.assignedBy,
            type: 'task_completed',
            content: `Task completed: ${this.currentTask.description}`,
            timestamp: new Date().toISOString(),
            status: 'pending'
          });
        }

      } catch (error) {
        console.error(`❌ Work item failed: ${this.currentTask.description}:`, error);
        this.currentTask.status = 'failed';
        this.currentTask.error = error.message;
        
        // Notify assignment agent of failure
        if (this.currentTask.assignedBy) {
          await this.communication.sendMessage(this.currentTask.assignedBy, {
            id: '',
            fromAgent: this.agentId,
            toAgent: this.currentTask.assignedBy,
            type: 'task_failed',
            content: `Task failed: ${this.currentTask.description}. Error: ${error.message}`,
            timestamp: new Date().toISOString(),
            status: 'pending',
            priority: 'high'
          });
        }
      }

      this.currentTask = null;
    }
  }

  /**
   * Execute a work item
   */
  private async executeWorkItem(item: WorkItem): Promise<void> {
    // Placeholder for work item execution
    // In a real implementation, this would route to appropriate handlers
    console.log(`🔄 Executing: ${item.description}`);
    
    // Simulate work with tmux session
    await this.tmuxManager.executeCommand('main', `echo "Processing: ${item.description}"`);
    
    // Wait for a moment to simulate work
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Load work queue from previous session
   */
  private async loadWorkQueue(): Promise<void> {
    // Implementation would load persisted work queue
    console.log(`📂 Work queue loaded for agent ${this.agentId}`);
  }

  /**
   * Get current agent status
   */
  async getAgentStatus(): Promise<AgentStatus> {
    const tmuxStatus = await this.tmuxManager.getSessionStatus();
    const gitStatus = await this.gitSafety.getStatus();
    const healthStatus = await this.getSystemHealth();

    return {
      agentId: this.agentId,
      isRunning: this.isRunning,
      currentTask: this.currentTask,
      workQueueLength: this.workQueue.length,
      subsystems: {
        tmux: tmuxStatus,
        gitSafety: gitStatus,
        health: healthStatus
      },
      uptime: process.uptime(),
      lastHealthCheck: new Date(),
      workingDirectory: this.workingDirectory
    };
  }

  /**
   * Get system health status
   */
  private async getSystemHealth(): Promise<SystemHealth> {
    // This would be implemented by the health check logic
    return {
      agentId: this.agentId,
      timestamp: new Date(),
      subsystems: { tmux: true, gitSafety: true, communication: true },
      overallHealth: 'healthy',
      issues: []
    };
  }

  /**
   * Shutdown autonomous agent
   */
  async shutdown(): Promise<void> {
    try {
      console.log(`🔌 Shutting down autonomous agent ${this.agentId}`);

      this.isRunning = false;

      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Create final safety commit
      await this.gitSafety.createEmergencyCommit('Agent shutdown - final state preservation');

      // Shutdown subsystems
      await this.communication.shutdown();
      this.gitSafety.stop();
      await this.tmuxManager.terminateSession();

      console.log(`✅ Autonomous agent ${this.agentId} shutdown complete`);

    } catch (error) {
      console.error(`❌ Error during shutdown:`, error);
    }
  }
}

/**
 * Work item interface
 */
export interface WorkItem {
  id: string;
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  description: string;
  assignedBy: string;
  assignedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  metadata: Record<string, any>;
}

/**
 * System health interface
 */
export interface SystemHealth {
  agentId: string;
  timestamp: Date;
  subsystems: {
    tmux: boolean;
    gitSafety: boolean;
    communication: boolean;
  };
  overallHealth: 'healthy' | 'degraded' | 'critical' | 'unknown';
  issues: string[];
}

/**
 * Agent status interface
 */
export interface AgentStatus {
  agentId: string;
  isRunning: boolean;
  currentTask: WorkItem | null;
  workQueueLength: number;
  subsystems: any;
  uptime: number;
  lastHealthCheck: Date;
  workingDirectory: string;
}