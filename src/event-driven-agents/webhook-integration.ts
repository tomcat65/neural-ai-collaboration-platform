/**
 * Webhook Integration for Event-Driven Agents
 * 
 * This module provides webhook endpoints and integrations for triggering agents
 * based on external events like git pushes, CI/CD, monitoring alerts, etc.
 */

import express from 'express';
import crypto from 'crypto';
import { EventDrivenAgentOrchestrator } from './webhook-agent-system';

export class WebhookIntegrationServer {
  private app: express.Application;
  private orchestrator: EventDrivenAgentOrchestrator;
  private webhookSecrets: Map<string, string> = new Map();
  
  constructor(orchestrator: EventDrivenAgentOrchestrator, port: number = 3006) {
    this.orchestrator = orchestrator;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    
    // Configure webhook secrets
    this.webhookSecrets.set('github', process.env.GITHUB_WEBHOOK_SECRET || 'default-secret');
    this.webhookSecrets.set('gitlab', process.env.GITLAB_WEBHOOK_SECRET || 'default-secret');
    this.webhookSecrets.set('jenkins', process.env.JENKINS_WEBHOOK_SECRET || 'default-secret');
    
    this.app.listen(port, () => {
      console.log(`🔗 Webhook integration server started on port ${port}`);
    });
    
    return this; // Fix missing return
  }
  
  private setupMiddleware(): void {
    // Raw body for signature verification
    this.app.use(express.raw({ type: 'application/json' }));
    
    // Parse JSON after verification
    this.app.use((req, res, next): void => {
      if (req.body && Buffer.isBuffer(req.body)) {
        try {
          req.body = JSON.parse(req.body.toString());
        } catch (e) {
          res.status(400).json({ error: 'Invalid JSON' });
          return;
        }
      }
      next();
    });
  }
  
  private setupRoutes() {
    // GitHub webhooks
    this.app.post('/webhooks/github', this.verifyGitHubSignature.bind(this), async (req, res) => {
      const event = req.headers['x-github-event'] as string;
      const payload = req.body;
      
      console.log(`📦 GitHub webhook: ${event}`);
      
      switch (event) {
        case 'push':
          await this.handleGitPush('github', payload);
          break;
          
        case 'pull_request':
          await this.handlePullRequest('github', payload);
          break;
          
        case 'issues':
          await this.handleIssue('github', payload);
          break;
          
        case 'workflow_run':
          await this.handleWorkflowRun('github', payload);
          break;
          
        case 'deployment':
          await this.handleDeployment('github', payload);
          break;
      }
      
      res.json({ status: 'processed' });
    });
    
    // GitLab webhooks
    this.app.post('/webhooks/gitlab', this.verifyGitLabToken.bind(this), async (req, res) => {
      const event = req.headers['x-gitlab-event'] as string;
      const payload = req.body;
      
      console.log(`🦊 GitLab webhook: ${event}`);
      
      switch (event) {
        case 'Push Hook':
          await this.handleGitPush('gitlab', payload);
          break;
          
        case 'Merge Request Hook':
          await this.handlePullRequest('gitlab', payload);
          break;
          
        case 'Pipeline Hook':
          await this.handlePipeline('gitlab', payload);
          break;
      }
      
      res.json({ status: 'processed' });
    });
    
    // CI/CD webhooks
    this.app.post('/webhooks/jenkins', async (req, res) => {
      const { name, build, phase, status } = req.body;
      
      console.log(`🔨 Jenkins webhook: ${name} - ${phase} (${status})`);
      
      await this.handleCIBuild('jenkins', {
        job: name,
        build,
        phase,
        status
      });
      
      res.json({ status: 'processed' });
    });
    
    // Monitoring webhooks
    this.app.post('/webhooks/prometheus', async (req, res) => {
      const alerts = req.body.alerts || [];
      
      for (const alert of alerts) {
        await this.handleMonitoringAlert('prometheus', alert);
      }
      
      res.json({ status: 'processed' });
    });
    
    // Generic webhook endpoint
    this.app.post('/webhooks/trigger/:agentId', async (req, res) => {
      const { agentId } = req.params;
      const { type = 'webhook', priority = 'medium', payload } = req.body;
      
      await this.orchestrator.notifyAgentActivity(agentId, {
        type,
        priority,
        source: 'webhook',
        payload
      });
      
      res.json({ status: 'triggered', agentId });
    });
  }
  
  // Signature verification middleware
  private verifyGitHubSignature(req: any, res: any, next: any) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    
    const secret = this.webhookSecrets.get('github')!;
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(req.body).digest('hex');
    
    if (signature !== digest) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    next();
  }
  
  private verifyGitLabToken(req: any, res: any, next: any) {
    const token = req.headers['x-gitlab-token'];
    const expectedToken = this.webhookSecrets.get('gitlab');
    
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    next();
  }
  
  // Event handlers
  private async handleGitPush(source: string, payload: any) {
    const branch = payload.ref?.split('/').pop() || 'unknown';
    const commits = payload.commits || [];
    const repository = payload.repository?.name || 'unknown';
    
    // Analyze changes to determine which agents to wake
    const fileTypes = new Set<string>();
    const changeSize = commits.reduce((total: number, commit: any) => {
      const files = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
      
      files.forEach((file: string) => {
        if (file.endsWith('.ts') || file.endsWith('.js')) fileTypes.add('code');
        if (file.includes('docker') || file.endsWith('.yml')) fileTypes.add('infra');
        if (file.includes('test')) fileTypes.add('test');
        if (file.includes('docs')) fileTypes.add('docs');
      });
      
      return total + files.length;
    }, 0);
    
    // Wake relevant agents based on changes
    if (fileTypes.has('code') || fileTypes.has('test')) {
      await this.orchestrator.notifyAgentActivity('cursor-ide-agent', {
        type: 'code_change',
        priority: changeSize > 10 ? 'high' : 'medium',
        source,
        payload: {
          branch,
          repository,
          commits,
          changeSize,
          fileTypes: Array.from(fileTypes)
        }
      });
    }
    
    if (fileTypes.has('infra')) {
      await this.orchestrator.notifyAgentActivity('claude-desktop-agent', {
        type: 'code_change',
        priority: 'medium',
        source,
        payload: {
          branch,
          repository,
          commits,
          changeSize,
          fileTypes: Array.from(fileTypes)
        }
      });
    }
    
    // Notify project leader for significant changes
    if (changeSize > 20 || branch === 'main' || branch === 'master') {
      await this.orchestrator.notifyAgentActivity('claude-code-cli', {
        type: 'code_change',
        priority: 'high',
        source,
        payload: {
          branch,
          repository,
          commits,
          changeSize,
          fileTypes: Array.from(fileTypes),
          significantChange: true
        }
      });
    }
  }
  
  private async handlePullRequest(source: string, payload: any) {
    const action = payload.action;
    const pr = payload.pull_request || payload.merge_request;
    
    if (!pr) return;
    
    // Handle different PR actions
    switch (action) {
      case 'opened':
      case 'reopened':
        // Development specialist reviews code
        await this.orchestrator.notifyAgentActivity('cursor-ide-agent', {
          type: 'task',
          priority: 'high',
          source,
          payload: {
            task: 'review_pr',
            pr: {
              number: pr.number || pr.iid,
              title: pr.title,
              author: pr.user?.login || pr.author?.username,
              url: pr.html_url || pr.web_url
            }
          }
        });
        break;
        
      case 'closed':
        if (pr.merged || pr.state === 'merged') {
          // Notify infrastructure for potential deployment
          await this.orchestrator.notifyAgentActivity('claude-desktop-agent', {
            type: 'task',
            priority: 'medium',
            source,
            payload: {
              task: 'pr_merged',
              pr: {
                number: pr.number || pr.iid,
                title: pr.title,
                targetBranch: pr.base?.ref || pr.target_branch
              }
            }
          });
        }
        break;
    }
  }
  
  private async handleIssue(source: string, payload: any) {
    const action = payload.action;
    const issue = payload.issue;
    
    if (!issue) return;
    
    // New issues wake the project leader
    if (action === 'opened') {
      const priority = issue.labels?.some((l: any) => 
        l.name?.toLowerCase().includes('bug') || 
        l.name?.toLowerCase().includes('critical')
      ) ? 'high' : 'medium';
      
      await this.orchestrator.notifyAgentActivity('claude-code-cli', {
        type: 'task',
        priority,
        source,
        payload: {
          task: 'triage_issue',
          issue: {
            number: issue.number,
            title: issue.title,
            author: issue.user?.login,
            labels: issue.labels?.map((l: any) => l.name),
            url: issue.html_url
          }
        }
      });
    }
  }
  
  private async handleWorkflowRun(source: string, payload: any) {
    const { action, workflow_run } = payload;
    
    if (action === 'completed') {
      const success = workflow_run.conclusion === 'success';
      
      if (!success) {
        // Wake relevant agent for failures
        const workflowName = workflow_run.name?.toLowerCase() || '';
        
        const agentId = workflowName.includes('deploy') ? 'claude-desktop-agent' : 'cursor-ide-agent';
        
        await this.orchestrator.notifyAgentActivity(agentId, {
          type: 'system_event',
          priority: 'high',
          source,
          payload: {
            event: 'workflow_failed',
            workflow: workflow_run.name,
            conclusion: workflow_run.conclusion,
            url: workflow_run.html_url
          }
        });
      }
    }
  }
  
  private async handleDeployment(source: string, payload: any) {
    const { deployment, action } = payload;
    
    await this.orchestrator.notifyAgentActivity('claude-desktop-agent', {
      type: 'system_event',
      priority: 'high',
      source,
      payload: {
        event: `deployment_${action}`,
        environment: deployment.environment,
        ref: deployment.ref,
        url: deployment.url
      }
    });
  }
  
  private async handlePipeline(source: string, payload: any) {
    const pipeline = payload.object_attributes;
    
    if (pipeline.status === 'failed') {
      await this.orchestrator.notifyAgentActivity('cursor-ide-agent', {
        type: 'system_event',
        priority: 'high',
        source,
        payload: {
          event: 'pipeline_failed',
          pipeline: pipeline.id,
          ref: pipeline.ref,
          stages: pipeline.stages
        }
      });
    }
  }
  
  private async handleCIBuild(source: string, payload: any) {
    const { job, phase, status } = payload;
    
    if (status === 'FAILURE' || status === 'UNSTABLE') {
      const agentId = job.includes('deploy') ? 'claude-desktop-agent' : 'cursor-ide-agent';
      
      await this.orchestrator.notifyAgentActivity(agentId, {
        type: 'system_event',
        priority: status === 'FAILURE' ? 'high' : 'medium',
        source,
        payload: {
          event: 'build_failed',
          job,
          phase,
          status
        }
      });
    }
  }
  
  private async handleMonitoringAlert(source: string, alert: any) {
    const severity = alert.labels?.severity || 'warning';
    const priority = severity === 'critical' ? 'critical' : 
                    severity === 'warning' ? 'high' : 'medium';
    
    // Infrastructure specialist handles monitoring alerts
    await this.orchestrator.notifyAgentActivity('claude-desktop-agent', {
      type: 'system_event',
      priority,
      source,
      payload: {
        event: 'monitoring_alert',
        alert: {
          name: alert.labels?.alertname,
          severity,
          status: alert.status,
          summary: alert.annotations?.summary,
          description: alert.annotations?.description
        }
      }
    });
  }
}

// Activity detection for user interactions
export class ActivityDetector {
  private fileWatchers: Map<string, any> = new Map();
  private orchestrator: EventDrivenAgentOrchestrator;
  private lastActivity: Map<string, Date> = new Map();
  
  constructor(orchestrator: EventDrivenAgentOrchestrator) {
    this.orchestrator = orchestrator;
  }
  
  // Watch for file changes indicating user activity
  watchProject(projectPath: string) {
    const chokidar = require('chokidar');
    
    const watcher = chokidar.watch(projectPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });
    
    watcher.on('change', (path: string) => {
      this.handleFileChange(path);
    });
    
    watcher.on('add', (path: string) => {
      this.handleFileAdd(path);
    });
    
    this.fileWatchers.set(projectPath, watcher);
  }
  
  private async handleFileChange(filePath: string) {
    const now = new Date();
    const lastChange = this.lastActivity.get(filePath);
    
    // Debounce rapid changes
    if (lastChange && (now.getTime() - lastChange.getTime()) < 5000) {
      return;
    }
    
    this.lastActivity.set(filePath, now);
    
    // Determine which agent to notify based on file type
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      await this.orchestrator.notifyAgentActivity('cursor-ide-agent', {
        type: 'user_activity',
        priority: 'low',
        source: 'file_watcher',
        payload: {
          event: 'file_edited',
          file: filePath,
          timestamp: now
        }
      });
    }
  }
  
  private async handleFileAdd(filePath: string) {
    // New files might need more attention
    await this.orchestrator.notifyAgentActivity('claude-code-cli', {
      type: 'user_activity',
      priority: 'medium',
      source: 'file_watcher',
      payload: {
        event: 'file_created',
        file: filePath,
        timestamp: new Date()
      }
    });
  }
}