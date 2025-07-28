import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TmuxSessionManager } from '../tmux/session-manager.js';

/**
 * Git Safety Protocols for Autonomous AI Agents
 * Implements automated commit cycles every 30 minutes to prevent data loss
 */
export class GitSafetyManager {
  private workingDirectory: string;
  private agentId: string;
  private commitInterval: NodeJS.Timeout | null = null;
  private commitIntervalMs: number;
  private lastCommitTime: Date = new Date();
  private isActive: boolean = false;

  constructor(agentId: string, workingDirectory: string = process.cwd(), intervalMinutes: number = 30) {
    this.agentId = agentId;
    this.workingDirectory = workingDirectory;
    this.commitIntervalMs = intervalMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Initialize git safety protocols
   */
  async initialize(): Promise<void> {
    try {
      console.log(`🔒 Initializing Git Safety Protocols for agent ${this.agentId}`);
      
      // Ensure we're in a git repository
      await this.ensureGitRepository();
      
      // Configure git for automated commits
      await this.configureGitForAutomation();
      
      // Start automated commit cycle
      this.startAutomatedCommits();
      
      this.isActive = true;
      console.log(`✅ Git Safety Protocols active - commits every ${this.commitIntervalMs / 60000} minutes`);
    } catch (error) {
      console.error(`❌ Failed to initialize Git Safety Protocols:`, error);
      throw error;
    }
  }

  /**
   * Ensure we're in a valid git repository
   */
  private async ensureGitRepository(): Promise<void> {
    try {
      await this.runGitCommand(['rev-parse', '--git-dir']);
      console.log('📂 Git repository detected');
    } catch (error) {
      throw new Error('Not in a git repository. Git safety protocols require a git repository.');
    }
  }

  /**
   * Configure git settings for automated commits
   */
  private async configureGitForAutomation(): Promise<void> {
    try {
      // Set git user for automated commits if not already set
      const userName = await this.getGitConfig('user.name');
      const userEmail = await this.getGitConfig('user.email');

      if (!userName) {
        await this.runGitCommand(['config', 'user.name', `AI-Agent-${this.agentId}`]);
        console.log(`🤖 Set git user name: AI-Agent-${this.agentId}`);
      }

      if (!userEmail) {
        await this.runGitCommand(['config', 'user.email', `ai-agent-${this.agentId}@neural-collaboration.local`]);
        console.log(`📧 Set git user email: ai-agent-${this.agentId}@neural-collaboration.local`);
      }

      // Set up git hooks directory if needed
      const hooksDir = join(this.workingDirectory, '.git', 'hooks');
      await fs.mkdir(hooksDir, { recursive: true });

    } catch (error) {
      console.warn('⚠️ Warning: Could not configure git settings:', error);
    }
  }

  /**
   * Start the automated commit cycle
   */
  private startAutomatedCommits(): void {
    // Clear any existing interval
    if (this.commitInterval) {
      clearInterval(this.commitInterval);
    }

    // Set up new interval
    this.commitInterval = setInterval(async () => {
      await this.performSafetyCommit();
    }, this.commitIntervalMs);

    console.log(`⏰ Automated commit cycle started - interval: ${this.commitIntervalMs / 60000} minutes`);
  }

  /**
   * Perform a safety commit with current changes
   */
  async performSafetyCommit(): Promise<CommitResult> {
    try {
      console.log(`🔄 Performing safety commit for agent ${this.agentId}...`);

      // Check if there are any changes to commit
      const hasChanges = await this.hasUncommittedChanges();
      
      if (!hasChanges) {
        console.log(`✨ No changes to commit for agent ${this.agentId}`);
        return {
          success: true,
          commitHash: null,
          message: 'No changes to commit',
          timestamp: new Date()
        };
      }

      // Stage all changes
      await this.runGitCommand(['add', '.']);

      // Generate commit message
      const commitMessage = await this.generateCommitMessage();

      // Create commit
      const commitOutput = await this.runGitCommand(['commit', '-m', commitMessage]);
      const commitHash = await this.runGitCommand(['rev-parse', 'HEAD']);

      this.lastCommitTime = new Date();

      console.log(`✅ Safety commit completed: ${commitHash.substring(0, 8)}`);

      return {
        success: true,
        commitHash: commitHash.trim(),
        message: commitMessage,
        timestamp: this.lastCommitTime,
        output: commitOutput
      };

    } catch (error) {
      console.error(`❌ Safety commit failed for agent ${this.agentId}:`, error);
      
      return {
        success: false,
        commitHash: null,
        message: `Commit failed: ${error.message}`,
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  private async hasUncommittedChanges(): Promise<boolean> {
    try {
      const statusOutput = await this.runGitCommand(['status', '--porcelain']);
      return statusOutput.trim().length > 0;
    } catch (error) {
      console.warn('⚠️ Could not check git status:', error);
      return false;
    }
  }

  /**
   * Generate intelligent commit message based on changes
   */
  private async generateCommitMessage(): Promise<string> {
    try {
      // Get git status for intelligent message generation
      const statusOutput = await this.runGitCommand(['status', '--porcelain']);
      const diffOutput = await this.runGitCommand(['diff', '--cached', '--stat']).catch(() => '');

      const lines = statusOutput.trim().split('\n').filter(Boolean);
      const timestamp = new Date().toISOString();

      // Analyze changes
      const changes = this.analyzeChanges(lines);
      
      let message = `🤖 Automated safety commit by ${this.agentId}`;
      
      if (changes.added > 0) message += ` | Added: ${changes.added} files`;
      if (changes.modified > 0) message += ` | Modified: ${changes.modified} files`;
      if (changes.deleted > 0) message += ` | Deleted: ${changes.deleted} files`;
      
      message += `\n\nTimestamp: ${timestamp}`;
      message += `\nCommit interval: ${this.commitIntervalMs / 60000} minutes`;
      
      if (diffOutput) {
        message += `\n\nChange summary:\n${diffOutput}`;
      }

      message += `\n\n🔒 Automated commit for continuous development safety`;

      return message;
    } catch (error) {
      const timestamp = new Date().toISOString();
      return `🤖 Automated safety commit by ${this.agentId}\n\nTimestamp: ${timestamp}\nStatus: Emergency commit due to analysis failure\n\n🔒 Automated commit for continuous development safety`;
    }
  }

  /**
   * Analyze git status changes
   */
  private analyzeChanges(statusLines: string[]): ChangeAnalysis {
    const analysis: ChangeAnalysis = {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0
    };

    for (const line of statusLines) {
      const status = line.substring(0, 2);
      
      if (status.includes('A')) analysis.added++;
      if (status.includes('M')) analysis.modified++;
      if (status.includes('D')) analysis.deleted++;
      if (status.includes('R')) analysis.renamed++;
      if (status === '??') analysis.untracked++;
    }

    return analysis;
  }

  /**
   * Create an emergency commit (for critical situations)
   */
  async createEmergencyCommit(reason: string): Promise<CommitResult> {
    console.log(`🚨 Creating emergency commit: ${reason}`);
    
    const originalMessage = `🚨 EMERGENCY COMMIT by ${this.agentId}`;
    const fullMessage = `${originalMessage}\n\nReason: ${reason}\nTimestamp: ${new Date().toISOString()}\n\n⚠️ This is an emergency commit to preserve current state`;

    try {
      await this.runGitCommand(['add', '.']);
      const commitOutput = await this.runGitCommand(['commit', '-m', fullMessage]);
      const commitHash = await this.runGitCommand(['rev-parse', 'HEAD']);

      return {
        success: true,
        commitHash: commitHash.trim(),
        message: fullMessage,
        timestamp: new Date(),
        output: commitOutput,
        isEmergency: true
      };
    } catch (error) {
      return {
        success: false,
        commitHash: null,
        message: fullMessage,
        timestamp: new Date(),
        error: error.message,
        isEmergency: true
      };
    }
  }

  /**
   * Get current git safety status
   */
  async getStatus(): Promise<GitSafetyStatus> {
    try {
      const currentBranch = await this.runGitCommand(['branch', '--show-current']);
      const lastCommitHash = await this.runGitCommand(['rev-parse', 'HEAD']);
      const lastCommitMessage = await this.runGitCommand(['log', '-1', '--pretty=format:%s']);
      const hasUncommitted = await this.hasUncommittedChanges();
      
      const timeSinceLastCommit = Date.now() - this.lastCommitTime.getTime();
      const nextCommitIn = Math.max(0, this.commitIntervalMs - timeSinceLastCommit);

      return {
        agentId: this.agentId,
        isActive: this.isActive,
        currentBranch: currentBranch.trim(),
        lastCommitHash: lastCommitHash.trim(),
        lastCommitMessage: lastCommitMessage.trim(),
        lastCommitTime: this.lastCommitTime,
        hasUncommittedChanges: hasUncommitted,
        commitIntervalMs: this.commitIntervalMs,
        nextCommitIn: nextCommitIn,
        workingDirectory: this.workingDirectory
      };
    } catch (error) {
      return {
        agentId: this.agentId,
        isActive: this.isActive,
        currentBranch: 'unknown',
        lastCommitHash: 'unknown',
        lastCommitMessage: 'unknown',
        lastCommitTime: this.lastCommitTime,
        hasUncommittedChanges: false,
        commitIntervalMs: this.commitIntervalMs,
        nextCommitIn: 0,
        workingDirectory: this.workingDirectory,
        error: error.message
      };
    }
  }

  /**
   * Stop automated commits
   */
  stop(): void {
    if (this.commitInterval) {
      clearInterval(this.commitInterval);
      this.commitInterval = null;
    }
    this.isActive = false;
    console.log(`🛑 Git Safety Protocols stopped for agent ${this.agentId}`);
  }

  /**
   * Get git configuration value
   */
  private async getGitConfig(key: string): Promise<string | null> {
    try {
      const value = await this.runGitCommand(['config', key]);
      return value.trim() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Run git command and return output
   */
  private async runGitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const gitProcess = spawn('git', args, {
        cwd: this.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Git command failed: git ${args.join(' ')}\nExit code: ${code}\nError: ${stderr}`));
        }
      });

      gitProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}

/**
 * Result of a commit operation
 */
export interface CommitResult {
  success: boolean;
  commitHash: string | null;
  message: string;
  timestamp: Date;
  output?: string;
  error?: string;
  isEmergency?: boolean;
}

/**
 * Git safety status information
 */
export interface GitSafetyStatus {
  agentId: string;
  isActive: boolean;
  currentBranch: string;
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitTime: Date;
  hasUncommittedChanges: boolean;
  commitIntervalMs: number;
  nextCommitIn: number;
  workingDirectory: string;
  error?: string;
}

/**
 * Analysis of git changes
 */
interface ChangeAnalysis {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  untracked: number;
}