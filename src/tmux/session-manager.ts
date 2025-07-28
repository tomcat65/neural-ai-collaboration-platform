import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Tmux Session Manager for Persistent AI Agent Operations
 * Enables 24/7 autonomous operation with persistent session contexts
 */
export class TmuxSessionManager {
  private sessionName: string;
  private agentId: string;
  private workingDirectory: string;
  private sessionStateFile: string;
  private isActive: boolean = false;

  constructor(agentId: string, workingDirectory: string = process.cwd()) {
    this.agentId = agentId;
    this.sessionName = `ai-agent-${agentId}`;
    this.workingDirectory = workingDirectory;
    this.sessionStateFile = join(workingDirectory, 'data', `${agentId}-session.json`);
  }

  /**
   * Initialize and create a persistent tmux session for the agent
   */
  async initializeSession(): Promise<void> {
    try {
      console.log(`🚀 Initializing tmux session for agent: ${this.agentId}`);
      
      // Check if session already exists
      const sessionExists = await this.sessionExists();
      
      if (sessionExists) {
        console.log(`♻️ Resuming existing tmux session: ${this.sessionName}`);
        await this.attachToSession();
      } else {
        console.log(`🆕 Creating new tmux session: ${this.sessionName}`);
        await this.createNewSession();
      }

      // Load previous session state if available
      await this.loadSessionState();
      this.isActive = true;

      console.log(`✅ Tmux session ${this.sessionName} ready for agent ${this.agentId}`);
    } catch (error) {
      console.error(`❌ Failed to initialize tmux session for ${this.agentId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new tmux session with proper window layout
   */
  private async createNewSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create new detached session
      const createSession = spawn('tmux', [
        'new-session',
        '-d',
        '-s', this.sessionName,
        '-c', this.workingDirectory,
        '-x', '120',  // Width
        '-y', '40'    // Height
      ]);

      createSession.on('close', async (code) => {
        if (code === 0) {
          // Setup windows for different agent activities
          await this.setupSessionWindows();
          resolve();
        } else {
          reject(new Error(`Failed to create tmux session, exit code: ${code}`));
        }
      });

      createSession.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Setup tmux windows for different agent activities
   */
  private async setupSessionWindows(): Promise<void> {
    const windows = [
      { name: 'main', command: '' },           // Main agent work window
      { name: 'monitor', command: 'htop' },   // System monitoring
      { name: 'logs', command: 'tail -f /var/log/agent-activity.log || echo "No logs yet"' },
      { name: 'git', command: '' }            // Git operations window
    ];

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      
      if (i === 0) {
        // Rename first window
        await this.runTmuxCommand(['rename-window', '-t', this.sessionName, window.name]);
      } else {
        // Create additional windows
        await this.runTmuxCommand([
          'new-window', 
          '-t', this.sessionName, 
          '-n', window.name,
          '-c', this.workingDirectory
        ]);
      }

      // Run initial command if specified
      if (window.command) {
        await this.runTmuxCommand([
          'send-keys', 
          '-t', `${this.sessionName}:${window.name}`,
          window.command, 
          'Enter'
        ]);
      }
    }

    // Return to main window
    await this.runTmuxCommand(['select-window', '-t', `${this.sessionName}:main`]);
  }

  /**
   * Check if the tmux session exists
   */
  private async sessionExists(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkSession = spawn('tmux', ['has-session', '-t', this.sessionName]);
      
      checkSession.on('close', (code) => {
        resolve(code === 0);
      });

      checkSession.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Attach to existing tmux session
   */
  private async attachToSession(): Promise<void> {
    // For headless operation, we don't actually attach but verify session is accessible
    return new Promise((resolve, reject) => {
      const listSession = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
      let output = '';

      listSession.stdout.on('data', (data) => {
        output += data.toString();
      });

      listSession.on('close', (code) => {
        if (code === 0 && output.includes(this.sessionName)) {
          resolve();
        } else {
          reject(new Error(`Session ${this.sessionName} not accessible`));
        }
      });
    });
  }

  /**
   * Execute command in specific tmux window
   */
  async executeCommand(windowName: string, command: string): Promise<void> {
    await this.runTmuxCommand([
      'send-keys',
      '-t', `${this.sessionName}:${windowName}`,
      command,
      'Enter'
    ]);
  }

  /**
   * Send keys to tmux session without executing
   */
  async sendKeys(windowName: string, keys: string): Promise<void> {
    await this.runTmuxCommand([
      'send-keys',
      '-t', `${this.sessionName}:${windowName}`,
      keys
    ]);
  }

  /**
   * Get current session status and information
   */
  async getSessionStatus(): Promise<SessionStatus> {
    try {
      const sessionInfo = await this.getSessionInfo();
      const windows = await this.listWindows();
      
      return {
        sessionName: this.sessionName,
        agentId: this.agentId,
        isActive: this.isActive,
        uptime: sessionInfo.uptime,
        windows: windows,
        lastActivity: new Date(),
        workingDirectory: this.workingDirectory
      };
    } catch (error) {
      return {
        sessionName: this.sessionName,
        agentId: this.agentId,
        isActive: false,
        uptime: 0,
        windows: [],
        lastActivity: new Date(),
        workingDirectory: this.workingDirectory,
        error: error.message
      };
    }
  }

  /**
   * Save current session state to file
   */
  async saveSessionState(): Promise<void> {
    try {
      const status = await this.getSessionStatus();
      const stateData = {
        timestamp: new Date().toISOString(),
        sessionStatus: status,
        agentContext: {
          lastCommand: '',
          workingDirectory: this.workingDirectory,
          activeWindow: 'main'
        }
      };

      // Ensure data directory exists
      await fs.mkdir(join(this.workingDirectory, 'data'), { recursive: true });
      await fs.writeFile(this.sessionStateFile, JSON.stringify(stateData, null, 2));
      
      console.log(`💾 Session state saved for agent ${this.agentId}`);
    } catch (error) {
      console.warn(`⚠️ Failed to save session state for ${this.agentId}:`, error);
    }
  }

  /**
   * Load previous session state from file
   */
  private async loadSessionState(): Promise<void> {
    try {
      const stateData = await fs.readFile(this.sessionStateFile, 'utf-8');
      const sessionState = JSON.parse(stateData);
      
      console.log(`📂 Loaded session state for agent ${this.agentId} from ${sessionState.timestamp}`);
      
      // Restore session context if needed
      if (sessionState.agentContext.activeWindow !== 'main') {
        await this.runTmuxCommand([
          'select-window', 
          '-t', `${this.sessionName}:${sessionState.agentContext.activeWindow}`
        ]);
      }
    } catch (error) {
      console.log(`ℹ️ No previous session state found for ${this.agentId}, starting fresh`);
    }
  }

  /**
   * Terminate tmux session
   */
  async terminateSession(): Promise<void> {
    try {
      await this.saveSessionState();
      
      const killSession = spawn('tmux', ['kill-session', '-t', this.sessionName]);
      
      return new Promise((resolve, reject) => {
        killSession.on('close', (code) => {
          if (code === 0) {
            this.isActive = false;
            console.log(`🔚 Terminated tmux session ${this.sessionName}`);
            resolve();
          } else {
            reject(new Error(`Failed to terminate session, exit code: ${code}`));
          }
        });
      });
    } catch (error) {
      console.error(`❌ Error terminating session ${this.sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to run tmux commands
   */
  private async runTmuxCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const tmuxProcess = spawn('tmux', args);
      let output = '';
      let error = '';

      tmuxProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      tmuxProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      tmuxProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Tmux command failed: ${args.join(' ')}\nError: ${error}`));
        }
      });

      tmuxProcess.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get detailed session information
   */
  private async getSessionInfo(): Promise<{ uptime: number }> {
    try {
      const output = await this.runTmuxCommand([
        'display-message', 
        '-t', this.sessionName, 
        '-p', '#{session_created}'
      ]);
      
      const sessionCreated = parseInt(output) * 1000; // Convert to milliseconds
      const uptime = Date.now() - sessionCreated;
      
      return { uptime };
    } catch (error) {
      return { uptime: 0 };
    }
  }

  /**
   * List all windows in the session
   */
  private async listWindows(): Promise<WindowInfo[]> {
    try {
      const output = await this.runTmuxCommand([
        'list-windows',
        '-t', this.sessionName,
        '-F', '#{window_name}:#{window_active}:#{window_panes}'
      ]);

      return output.split('\n').map(line => {
        const [name, active, panes] = line.split(':');
        return {
          name,
          isActive: active === '1',
          paneCount: parseInt(panes) || 1
        };
      });
    } catch (error) {
      return [];
    }
  }
}

/**
 * Session status interface
 */
export interface SessionStatus {
  sessionName: string;
  agentId: string;
  isActive: boolean;
  uptime: number;
  windows: WindowInfo[];
  lastActivity: Date;
  workingDirectory: string;
  error?: string;
}

/**
 * Window information interface
 */
export interface WindowInfo {
  name: string;
  isActive: boolean;
  paneCount: number;
}

/**
 * Agent orchestration class for managing multiple agent sessions
 */
export class AgentOrchestrator {
  private agents: Map<string, TmuxSessionManager> = new Map();
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Register a new agent for orchestration
   */
  async registerAgent(agentId: string): Promise<void> {
    if (this.agents.has(agentId)) {
      console.log(`⚠️ Agent ${agentId} already registered`);
      return;
    }

    const sessionManager = new TmuxSessionManager(agentId, this.workingDirectory);
    await sessionManager.initializeSession();
    
    this.agents.set(agentId, sessionManager);
    console.log(`✅ Agent ${agentId} registered and session initialized`);
  }

  /**
   * Get session manager for specific agent
   */
  getAgent(agentId: string): TmuxSessionManager | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get status of all managed agents
   */
  async getAllAgentStatus(): Promise<SessionStatus[]> {
    const statusPromises = Array.from(this.agents.values()).map(agent => 
      agent.getSessionStatus()
    );
    
    return await Promise.all(statusPromises);
  }

  /**
   * Terminate all agent sessions
   */
  async terminateAllSessions(): Promise<void> {
    const terminationPromises = Array.from(this.agents.values()).map(agent =>
      agent.terminateSession()
    );

    await Promise.all(terminationPromises);
    this.agents.clear();
    console.log('🔚 All agent sessions terminated');
  }
}