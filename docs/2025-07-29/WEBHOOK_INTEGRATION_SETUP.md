# External Webhook Integration Guide

**Date**: July 29, 2025  
**Purpose**: Configure GitHub, GitLab, and CI/CD webhooks for automatic agent activation

## 🎯 Overview

The event-driven orchestrator (running on ports 3004/3005) can receive external webhooks to automatically trigger the appropriate agents based on code changes, issues, PRs, and deployment events.

## 🔗 Available Webhook Endpoints

### Base URL
```
http://your-server:3004
```

### Agent Trigger Endpoints
```bash
# Trigger specific agent
POST /webhook/trigger/{agent-id}
Content-Type: application/json

# Available agent IDs:
# - claude-code-cli (project leader)
# - cursor-ide-agent (development specialist)  
# - claude-desktop-agent (infrastructure specialist)
```

### Git Integration Endpoint
```bash
# Git webhook for automatic agent selection
POST /webhook/git
Content-Type: application/json

# Automatically analyzes commits and triggers relevant agents
```

### System Event Endpoint
```bash
# System events (deployment, monitoring, etc.)
POST /webhook/system/{event-type}
Content-Type: application/json
```

## 🐙 GitHub Integration

### 1. Repository Webhook Setup

**URL**: `http://your-server:3004/webhook/git`  
**Content Type**: `application/json`  
**Events to Subscribe**:
- ✅ Push events
- ✅ Pull request events  
- ✅ Issues events
- ✅ Workflow run events

### 2. Example GitHub Webhook Payload Processing

```javascript
// The orchestrator automatically processes GitHub webhooks
// and determines which agents to activate based on:

const agentMapping = {
  // Code changes in src/ → Development specialist
  'src/': 'cursor-ide-agent',
  
  // Docker/deployment changes → Infrastructure specialist  
  'docker/': 'claude-desktop-agent',
  'Dockerfile': 'claude-desktop-agent',
  '.github/workflows/': 'claude-desktop-agent',
  
  // Documentation/project changes → Project leader
  'README.md': 'claude-code-cli',
  'docs/': 'claude-code-cli',
  
  // Package changes → All agents for coordination
  'package.json': ['claude-code-cli', 'cursor-ide-agent']
};
```

### 3. GitHub Actions Integration

```yaml
# .github/workflows/notify-agents.yml
name: Notify AI Agents
on:
  push:
    branches: [ main, develop ]
  pull_request:
    types: [ opened, synchronize, closed ]

jobs:
  notify-agents:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Event Orchestrator
        run: |
          curl -X POST http://your-server:3004/webhook/system/workflow_complete \\
            -H "Content-Type: application/json" \\
            -d '{
              "event": "workflow_complete",
              "repository": "${{ github.repository }}",
              "branch": "${{ github.ref_name }}",
              "workflow": "${{ github.workflow }}",
              "status": "success"
            }'
```

## 🦊 GitLab Integration

### 1. Project Webhook Setup

**URL**: `http://your-server:3004/webhook/git`  
**Trigger Events**:
- ✅ Push events
- ✅ Merge request events
- ✅ Issues events  
- ✅ Pipeline events

### 2. GitLab CI Integration

```yaml
# .gitlab-ci.yml
stages:
  - notify

notify_agents:
  stage: notify
  script:
    - |
      curl -X POST http://your-server:3004/webhook/system/pipeline_complete \\
        -H "Content-Type: application/json" \\
        -d '{
          "event": "pipeline_complete",
          "project": "'$CI_PROJECT_PATH'",
          "branch": "'$CI_COMMIT_REF_NAME'",
          "pipeline_id": "'$CI_PIPELINE_ID'",
          "status": "'$CI_JOB_STATUS'"
        }'
  when: always
```

## 🔧 CI/CD System Integration

### Jenkins Webhook
```bash
# Add to Jenkins post-build script
curl -X POST http://your-server:3004/webhook/system/build_complete \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "build_complete",
    "job": "'$JOB_NAME'",
    "build": "'$BUILD_NUMBER'",
    "status": "'$BUILD_STATUS'",
    "url": "'$BUILD_URL'"
  }'
```

### Generic CI/CD
```bash
# Generic webhook for any CI/CD system
curl -X POST http://your-server:3004/webhook/trigger/claude-desktop-agent \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "deployment",
    "priority": "high",
    "payload": {
      "environment": "production",
      "version": "v2.1.0",
      "status": "success"
    }
  }'
```

## 📊 Monitoring Integration

### Prometheus/AlertManager
```bash
# Alert webhook for infrastructure issues
curl -X POST http://your-server:3004/webhook/trigger/claude-desktop-agent \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "alert",
    "priority": "critical",
    "payload": {
      "alert": "HighCPUUsage",
      "instance": "prod-server-01",
      "value": "95%",
      "threshold": "80%"
    }
  }'
```

### Custom Monitoring
```bash
# Performance degradation alert
curl -X POST http://your-server:3004/webhook/trigger/claude-code-cli \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "performance_issue",
    "priority": "high", 
    "payload": {
      "metric": "response_time",
      "current": "2.5s",
      "threshold": "1s",
      "endpoint": "/api/users"
    }
  }'
```

## 🔐 Security Configuration

### Webhook Security (Recommended)
```bash
# Set webhook secrets in environment variables
export GITHUB_WEBHOOK_SECRET="your-github-secret"
export GITLAB_WEBHOOK_SECRET="your-gitlab-secret"
export JENKINS_WEBHOOK_SECRET="your-jenkins-secret"

# The orchestrator will validate signatures
```

### IP Whitelisting
```bash
# Configure firewall to only allow webhooks from:
# GitHub IPs: 192.30.252.0/22, 185.199.108.0/22, 140.82.112.0/20
# GitLab.com IPs: Check GitLab documentation
# Your CI/CD server IPs
```

## 🧪 Testing Webhooks

### Manual Testing
```bash
# Test agent activation
curl -X POST http://localhost:3004/webhook/trigger/claude-code-cli \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "test",
    "priority": "medium",
    "payload": {
      "message": "Manual webhook test",
      "source": "curl"
    }
  }'

# Test git webhook simulation
curl -X POST http://localhost:3004/webhook/git \\
  -H "Content-Type: application/json" \\
  -d '{
    "ref": "refs/heads/main",
    "commits": [{
      "added": ["src/new-feature.js"],
      "modified": ["package.json"],
      "removed": []
    }],
    "repository": {
      "name": "test-repo"
    }
  }'
```

### Validation
```bash
# Check orchestrator logs for webhook processing
docker logs event-orchestrator --tail 20

# Verify agent activation
curl http://localhost:3004/metrics
```

## 📈 Expected Efficiency Gains

### Immediate Agent Response
- **Traditional**: Manual agent triggering or 15-second polling delays
- **Webhook-Driven**: Instant activation within 100ms of external event

### Smart Context Awareness  
- **Code Changes**: Only development agents activate
- **Infrastructure Issues**: Only DevOps agents respond
- **Documentation Updates**: Project leader coordinates

### Cost Optimization
- **Before**: Agents poll regardless of activity = wasteful token usage
- **After**: Agents only activate when relevant events occur = maximum efficiency

## 🚀 Deployment Steps

1. **Configure Webhooks**
   ```bash
   # GitHub: Repository → Settings → Webhooks → Add webhook
   # GitLab: Project → Settings → Webhooks → Add webhook
   # Jenkins: Post-build Actions → HTTP Request
   ```

2. **Test Integration**
   ```bash
   # Make a test commit and verify agent activation
   git commit -m "Test webhook integration"
   git push origin main
   ```

3. **Monitor Results**
   ```bash
   # Check logs for automatic agent triggers
   docker logs event-orchestrator | grep "⚡ Triggering"
   ```

4. **Optimize Triggers**
   ```bash
   # Adjust agent mapping based on actual usage patterns
   # Fine-tune priority levels for different event types
   ```

## 🔄 Maintenance

### Regular Checks
- Verify webhook endpoints are accessible from external services
- Monitor orchestrator logs for failed webhook deliveries
- Check agent response times and token usage efficiency

### Troubleshooting
- **Webhooks not received**: Check firewall/network configuration
- **Agents not activating**: Verify orchestrator container health
- **Wrong agents triggered**: Review file path mapping rules

---

With external webhook integration, the event-driven system achieves **maximum automation** and **perfect efficiency** - agents activate instantly when needed and remain dormant when not, resulting in near-zero waste and optimal cost management.