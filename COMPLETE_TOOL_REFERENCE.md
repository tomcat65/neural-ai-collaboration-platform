# Complete Neural AI Collaboration Platform - Tool Reference Guide

**Version**: 1.0.0  
**MCP Server**: Unified Neural MCP Server (Port 6174)  
**Total Tools**: 27 Advanced AI Collaboration Tools  
**Status**: ✅ Fully Operational and Tested

## 🎯 Quick Access

### **Current System Status**
```bash
# Verify system is running
curl http://localhost:6174/health

# Check MCP configuration
claude mcp list
# Should show: neural-ai-collaboration: npx @modelcontextprotocol/server-fetch http://localhost:6174/mcp

# Start system if needed
./interactive-startup.sh
```

### **Tool Categories Overview**
- **[Memory & Knowledge Management](#memory--knowledge-management-5-tools)** (5 tools)
- **[AI Agent Communication](#ai-agent-communication-4-tools)** (4 tools)  
- **[Multi-Provider AI Access](#multi-provider-ai-access-4-tools)** (4 tools)
- **[Autonomous Operations](#autonomous-operations-4-tools)** (4 tools)
- **[Cross-Platform Support](#cross-platform-support-4-tools)** (4 tools)
- **[Consensus & Coordination](#consensus--coordination-4-tools)** (4 tools)
- **[System Monitoring & Control](#system-monitoring--control-2-tools)** (2 tools)

---

## Memory & Knowledge Management (5 tools)

### 1. `create_entities`
**Store knowledge in advanced multi-database system (Neo4j, Weaviate, Redis, SQLite)**

#### Parameters
```typescript
{
  entities: Array<{
    name: string,           // Entity name (required)
    entityType: string,     // Entity type/category (required)
    observations: string[]  // Array of observation contents (required)
  }>
}
```

#### Usage Examples
```typescript
// Basic entity creation
await create_entities({
  entities: [{
    name: "Project Alpha Status",
    entityType: "project_update",
    observations: [
      "Backend API development completed",
      "Frontend integration in progress", 
      "Database migration scheduled for next week"
    ]
  }]
});

// Multiple entities with different types
await create_entities({
  entities: [
    {
      name: "API Security Review",
      entityType: "security_assessment", 
      observations: [
        "JWT authentication implemented",
        "Input validation added to all endpoints",
        "Rate limiting configured"
      ]
    },
    {
      name: "Performance Metrics Q3",
      entityType: "analytics",
      observations: [
        "Average response time: 145ms",
        "99th percentile: 380ms",
        "Error rate: 0.02%"
      ]
    }
  ]
});
```

#### Return Value
```json
{
  "created": 2,
  "entities": [
    {
      "id": "entity-12345",
      "name": "Project Alpha Status",
      "type": "project_update", 
      "observations": ["..."],
      "createdBy": "unified-neural-mcp-server",
      "timestamp": "2025-08-02T02:14:26.041Z",
      "metadata": {
        "vectorEmbedded": true,
        "graphIndexed": true,
        "cacheEnabled": true
      }
    }
  ],
  "advancedFeatures": {
    "vectorEmbeddings": "generated",
    "graphRelations": "indexed", 
    "cacheUpdated": "redis"
  }
}
```

---

### 2. `search_entities`
**Advanced federated search across all memory systems**

#### Parameters
```typescript
{
  query: string,                                    // Search query (required)
  searchType?: 'semantic' | 'exact' | 'graph' | 'hybrid',  // Default: 'hybrid'
  limit?: number                                    // Max results, default: 50
}
```

#### Usage Examples
```typescript
// Basic hybrid search
const results = await search_entities({
  query: "API security authentication",
  searchType: "hybrid",
  limit: 10
});

// Semantic search for related concepts  
const relatedConcepts = await search_entities({
  query: "performance optimization", 
  searchType: "semantic",
  limit: 20
});

// Exact search for specific terms
const exactMatches = await search_entities({
  query: "JWT token validation",
  searchType: "exact"
});

// Graph-based relationship search
const connections = await search_entities({
  query: "database migration dependencies",
  searchType: "graph",
  limit: 15
});
```

#### Return Value
```json
{
  "query": "API security authentication",
  "searchType": "hybrid",
  "totalResults": 5,
  "results": [
    {
      "id": "entity-12345",
      "content": {
        "name": "API Security Review",
        "type": "security_assessment",
        "observations": ["JWT authentication implemented", "..."]
      },
      "searchScore": 0.89,
      "searchType": "hybrid",
      "memorySource": "hybrid",
      "semanticSimilarity": 0.85,
      "timestamp": "2025-08-02T02:14:26.041Z"
    }
  ],
  "searchMetadata": {
    "executionTime": "45ms",
    "memorySources": ["sqlite", "neo4j", "weaviate", "redis"],
    "cacheHit": true
  }
}
```

---

### 3. `add_observations`
**Add new observations to existing entities with automatic vector embedding**

#### Parameters
```typescript
{
  observations: Array<{
    entityName: string,     // Name of existing entity (required)
    contents: string[]      // Array of new observations (required)
  }>
}
```

#### Usage Examples
```typescript
// Add observations to existing entity
await add_observations({
  observations: [{
    entityName: "Project Alpha Status",
    contents: [
      "Frontend integration completed successfully",
      "User acceptance testing initiated",
      "Performance benchmarks exceeded expectations"
    ]
  }]
});

// Add observations to multiple entities
await add_observations({
  observations: [
    {
      entityName: "API Security Review", 
      contents: [
        "Security audit completed by third party",
        "Zero critical vulnerabilities found"
      ]
    },
    {
      entityName: "Performance Metrics Q3",
      contents: [
        "New caching layer reduced response time by 40%",
        "Database query optimization implemented"
      ]
    }
  ]
});
```

#### Return Value
```json
{
  "added": 2,
  "observations": [
    {
      "id": "obs-67890",
      "entityName": "Project Alpha Status",
      "contents": ["Frontend integration completed successfully", "..."],
      "addedBy": "unified-neural-mcp-server",
      "timestamp": "2025-08-02T02:14:26.041Z",
      "metadata": {
        "vectorEmbedded": true,
        "relationshipsUpdated": true
      }
    }
  ],
  "advancedProcessing": {
    "vectorEmbeddings": "generated",
    "graphAnalysis": "completed",
    "cacheInvalidation": "smart"
  }
}
```

---

### 4. `create_relations`
**Create relationships between entities in Neo4j graph database**

#### Parameters
```typescript
{
  relations: Array<{
    from: string,                    // Source entity name (required)
    to: string,                      // Target entity name (required)  
    relationType: string,            // Relationship type (required)
    properties?: object              // Optional relation properties
  }>
}
```

#### Usage Examples
```typescript
// Create basic relationships
await create_relations({
  relations: [
    {
      from: "Project Alpha Status",
      to: "API Security Review", 
      relationType: "depends_on",
      properties: {
        priority: "high",
        blocksDeployment: true
      }
    },
    {
      from: "API Security Review",
      to: "Performance Metrics Q3",
      relationType: "influences",
      properties: {
        impactLevel: "medium"
      }
    }
  ]
});

// Create workflow relationships
await create_relations({
  relations: [
    {
      from: "Backend Development",
      to: "Frontend Integration", 
      relationType: "precedes"
    },
    {
      from: "Frontend Integration", 
      to: "User Testing",
      relationType: "enables"
    },
    {
      from: "User Testing",
      to: "Production Deployment",
      relationType: "gates"
    }
  ]
});
```

#### Return Value
```json
{
  "created": 2,
  "relations": [
    {
      "id": "rel-98765",
      "from": "Project Alpha Status",
      "to": "API Security Review",
      "relationType": "depends_on",
      "properties": {
        "priority": "high",
        "blocksDeployment": true
      },
      "createdBy": "unified-neural-mcp-server",
      "timestamp": "2025-08-02T02:14:26.041Z",
      "metadata": {
        "graphWeight": 0.75,
        "bidirectional": false,
        "strength": "medium"
      }
    }
  ],
  "graphAnalysis": {
    "networkDensity": "increased",
    "shortestPaths": "recalculated", 
    "communityDetection": "updated"
  }
}
```

---

### 5. `read_graph`
**Read entire knowledge graph with advanced filtering and analysis**

#### Parameters
```typescript
{
  includeVectors?: boolean,                          // Include embeddings, default: false
  includeCache?: boolean,                            // Include Redis data, default: false  
  analysisLevel?: 'basic' | 'detailed' | 'comprehensive'  // Default: 'basic'
}
```

#### Usage Examples
```typescript
// Basic graph overview
const basicGraph = await read_graph({
  analysisLevel: "basic"
});

// Detailed analysis with cache data
const detailedGraph = await read_graph({
  includeCache: true,
  analysisLevel: "detailed"
});

// Comprehensive analysis with all data
const fullGraph = await read_graph({
  includeVectors: true,
  includeCache: true, 
  analysisLevel: "comprehensive"
});
```

#### Return Value
```json
{
  "timestamp": "2025-08-02T02:14:26.041Z",
  "requestedBy": "unified-neural-mcp-server",
  "configuration": {
    "includeVectors": false,
    "includeCache": false,
    "analysisLevel": "basic"
  },
  "statistics": {
    "basic": {
      "nodeCount": 15,
      "edgeCount": 8,
      "observationCount": 45
    },
    "detailed": {
      "averageConnectivity": 3.2,
      "clustersDetected": 3,
      "centralNodes": ["Project Alpha Status", "API Security Review"],
      "graphDensity": 0.15
    }
  },
  "graph": {
    "entities": [/* entity objects */],
    "relations": [/* relation objects */],
    "observations": [/* observation objects */]
  },
  "advancedFeatures": {
    "vectorEmbeddings": "excluded",
    "cacheData": "excluded",
    "realTimeSync": "enabled",
    "distributedAccess": "multi_platform"
  }
}
```

---

## AI Agent Communication (4 tools)

### 6. `send_ai_message`
**Send messages to other AI agents with direct, capability-based, or broadcast targeting**

#### Parameters
```typescript
{
  // Recipients
  to?: string;                 // Direct target (alias: agentId). Use "*" for broadcast
  agentId?: string;            // DEPRECATED alias for `to`
  toCapabilities?: string[];   // Select agents whose registered capabilities include ALL provided
  capabilities?: string[];     // Alias for `toCapabilities`
  broadcast?: boolean;         // Send to all registered agents (except self by default)
  excludeSelf?: boolean;       // When broadcasting/cap-selecting, exclude sender (default: true)

  // Message
  from?: string;               // Sender agent ID (defaults to server/bridge identity)
  content: string;             // Message content (required)
  messageType?: 'info' | 'task' | 'query' | 'response' | 'collaboration'; // Default: 'info'
  priority?: 'low' | 'normal' | 'high' | 'urgent';      // Default: 'normal'
}
```

#### Usage Examples
```typescript
// Basic message
await send_ai_message({
  to: "claude-desktop-agent",
  content: "Project Alpha backend API is ready for frontend integration",
  messageType: "info"
});

// High-priority task assignment
await send_ai_message({
  to: "cursor-ide-agent", 
  content: "Critical bug found in authentication module. Please review /src/auth/jwt.ts immediately.",
  messageType: "task",
  priority: "urgent"
});

// Collaboration request
await send_ai_message({
  to: "devops-agent",
  content: "Ready for deployment. Need infrastructure team to review deployment config and approve production push.",
  messageType: "collaboration",
  priority: "high"
});

// Query for information
await send_ai_message({
  to: "qa-testing-agent",
  content: "What's the current status of user acceptance testing for the new authentication flow?",
  messageType: "query"
});

// Capability selector: matches agents with both capabilities
await send_ai_message({
  toCapabilities: ["bridge", "ai-to-ai-messaging"],
  content: "Sync latest architecture doc and confirm receipt.",
  messageType: "info"
});

// Broadcast (exclude self by default)
await send_ai_message({
  broadcast: true,
  content: "System will restart in 5 minutes. Save state.",
  messageType: "info"
});
```

#### Return Value
```json
{
  "status": "sent",
  "recipients": ["claude-code-agent", "cursor-ide-agent"],
  "sentCount": 2,
  "messageIds": [
    { "to": "claude-code-agent", "messageId": "msg-1" },
    { "to": "cursor-ide-agent", "messageId": "msg-2" }
  ],
  "deliveryTime": "<100ms",
  "selection": {
    "mode": "capabilities", // or "direct" | "broadcast"
    "capabilities": ["bridge", "ai-to-ai-messaging"],
    "excludeSelf": true
  },
  "features": {
    "realTimeDelivery": "websocket",
    "persistentStorage": "enabled",
    "crossPlatformSync": "active",
    "priorityQueue": "normal"
  }
}
```

---

### 7. `get_ai_messages`
**Retrieve messages for an AI agent with filtering and pagination**

#### Parameters
```typescript
{
  agentId: string,                                        // Agent ID to get messages for (required)
  limit?: number,                                         // Max messages (default: 5, server hard cap: 20)
  messageType?: 'info' | 'task' | 'query' | 'response' | 'collaboration', // Filter by type
  since?: string,                                         // ISO timestamp filter (ADVANCED ONLY)
  unreadOnly?: boolean,                                   // Default: true. Set false for shared inboxes
  compact?: boolean,                                      // Default: true. Summaries only; use get_message_detail for full
  markAsRead?: boolean,                                   // Default: false. Mark returned messages as read
  includeArchived?: boolean                               // Default: false. Include archived messages
}
```

> **Shared Inbox Warning:** When monitoring another agent's inbox (e.g. claude-desktop
> checking codex), always set `unreadOnly: false`. The target agent marks its own messages
> read during execution, so `unreadOnly: true` will return 0 results even when messages exist.

#### Usage Examples
```typescript
// Get all recent messages
const allMessages = await get_ai_messages({
  agentId: "claude-code-cli",
  limit: 20
});

// Get only task messages
const taskMessages = await get_ai_messages({
  agentId: "cursor-ide-agent",
  messageType: "task",
  limit: 10
});

// Get messages since yesterday
const recentMessages = await get_ai_messages({
  agentId: "devops-agent",
  since: "2025-08-01T00:00:00.000Z"
});

// Get collaboration messages only
const collabMessages = await get_ai_messages({
  agentId: "qa-testing-agent",
  messageType: "collaboration"
});
```

#### Return Value
```json
{
  "agentId": "claude-code-cli",
  "totalMessages": 15,
  "returnedMessages": 15,
  "filters": {
    "messageType": "all",
    "since": "beginning",
    "limit": 20
  },
  "messages": [
    {
      "id": "msg-abc123",
      "content": {
        "from": "cursor-ide-agent",
        "to": "claude-code-cli", 
        "message": "Critical bug found in authentication module...",
        "messageType": "task",
        "priority": "urgent",
        "timestamp": "2025-08-02T02:14:26.041Z"
      },
      "timestamp": "2025-08-02T02:14:26.041Z",
      "from": "cursor-ide-agent"
    }
  ],
  "metadata": {
    "realTimeSync": true,
    "crossPlatformAccess": true,
    "searchPerformance": "optimized"
  }
}
```

---

### 8. `register_agent`
**Register a new AI agent in the collaboration system**

#### Parameters
```typescript
{
  agentId: string,          // Unique agent identifier (required)
  name: string,             // Human-readable name (required)
  capabilities: string[],   // List of agent capabilities (required)
  endpoint?: string,        // Agent communication endpoint  
  metadata?: object         // Additional agent metadata
}
```

#### Usage Examples
```typescript
// Register a development agent
await register_agent({
  agentId: "frontend-specialist-agent",
  name: "Frontend Development Specialist",
  capabilities: [
    "react-development",
    "typescript-expertise", 
    "ui-ux-design",
    "responsive-design",
    "performance-optimization"
  ],
  endpoint: "http://localhost:4200/agent",
  metadata: {
    specialization: "React/TypeScript",
    experience: "senior",
    availability: "24/7"
  }
});

// Register a QA automation agent  
await register_agent({
  agentId: "qa-automation-agent",
  name: "QA Automation Specialist",
  capabilities: [
    "automated-testing",
    "cypress-testing",
    "jest-unit-tests",
    "performance-testing",
    "security-testing"
  ],
  metadata: {
    tools: ["cypress", "jest", "playwright", "k6"],
    testTypes: ["unit", "integration", "e2e", "performance"]
  }
});
```

#### Return Value
```json
{
  "registrationId": "reg-xyz789",
  "agentId": "frontend-specialist-agent",
  "status": "registered",
  "features": {
    "crossPlatformAccess": true,
    "realTimeMessaging": true,
    "autonomousCapability": false,
    "multiProviderAI": true
  }
}
```

---

### 9. `get_agent_status`
**Get comprehensive status and health information for AI agents**

#### Parameters
```typescript
{
  agentId?: string    // Specific agent ID, or omit for all agents
}
```

#### Usage Examples
```typescript
// Get status for specific agent
const agentStatus = await get_agent_status({
  agentId: "claude-code-cli"
});

// Get status for all agents
const allAgentsStatus = await get_agent_status();
```

#### Return Value
```json
{
  "agentId": "claude-code-cli",
  "status": "active",
  "lastSeen": "2025-08-02T02:14:26.041Z",
  "capabilities": ["project-leadership", "code-review", "architecture-design"],
  "messageQueue": 3,
  "performance": {
    "responseTime": "150ms",
    "availability": "99.5%",
    "tasksCompleted": 47
  }
}
```

---

### Agent Discovery (No Pre‑Named IDs)
Use `get_agent_status` without arguments to discover agents and their capabilities. Then target by `to` or select by `toCapabilities`.

```bash
# List all registered agents
curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" \
  http://localhost:6174/mcp \
  -d '{
    "jsonrpc":"2.0","id":301,
    "method":"tools/call",
    "params":{"name":"get_agent_status","arguments":{}}
  }' | jq
```

```typescript
// Example selection from a list result
const all = await get_agent_status();
const bridgePeer = all.agents?.find(a => (a.name||'').startsWith('stdio-bridge-'));
if (bridgePeer?.agentId) {
  await send_ai_message({ to: bridgePeer.agentId, content: 'Hello from discovery!' });
}

// Or route by capability, no IDs needed
await send_ai_message({ toCapabilities: ['bridge','ai-to-ai-messaging'], content: 'Sync latest doc.' });
```

## Multi-Provider AI Access (4 tools)

### 10. `execute_ai_request`
**Execute AI requests with intelligent provider routing and optimization**

#### Parameters
```typescript
{
  prompt: string,                                    // AI prompt to execute (required)
  provider?: 'openai' | 'anthropic' | 'google' | 'auto',  // Default: 'auto'
  model?: string,                                    // Specific model to use
  maxTokens?: number,                                // Maximum response tokens
  temperature?: number,                              // Response creativity (0-1)
  systemPrompt?: string                              // System/instruction prompt
}
```

#### Usage Examples
```typescript
// Auto-routed AI request
const response = await execute_ai_request({
  prompt: "Analyze the security implications of storing JWT tokens in localStorage vs httpOnly cookies",
  provider: "auto",
  maxTokens: 800
});

// Specific provider request
const codeReview = await execute_ai_request({
  prompt: "Review this TypeScript interface for best practices:\n\ninterface User {\n  id: string;\n  email: string;\n  preferences: any;\n}",
  provider: "anthropic",
  model: "claude-3-sonnet-20240229",
  systemPrompt: "You are a senior TypeScript developer focused on type safety and best practices."
});

// Creative writing with high temperature
const documentation = await execute_ai_request({
  prompt: "Write engaging user documentation for our new authentication system",
  provider: "openai",
  temperature: 0.8,
  maxTokens: 1200
});
```

#### Return Value
```json
{
  "request": {
    "prompt": "Analyze the security implications...",
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "maxTokens": 800,
    "temperature": 0.7,
    "executedBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z"
  },
  "response": {
    "content": "JWT tokens in localStorage vs httpOnly cookies have several key security differences...",
    "tokensUsed": 456,
    "cost": "0.00912",
    "executionTime": "1250ms",
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229"
  },
  "providerInfo": {
    "selected": "anthropic",
    "fallbackAvailable": true,
    "loadBalanced": true,
    "costOptimized": true
  }
}
```

---

### 11. `stream_ai_response`
**Stream AI responses in real-time with WebSocket delivery**

#### Parameters
```typescript
{
  prompt: string,                                    // AI prompt to execute (required)
  provider?: 'openai' | 'anthropic' | 'google' | 'auto',  // Default: 'auto'
  streamId?: string                                  // Unique stream identifier
}
```

#### Usage Examples
```typescript
// Start streaming response
const stream = await stream_ai_response({
  prompt: "Generate a comprehensive project plan for implementing microservices architecture",
  provider: "auto",
  streamId: "project-plan-stream-001"
});

// Stream with specific provider
const documentationStream = await stream_ai_response({
  prompt: "Write step-by-step API integration guide with code examples",
  provider: "openai"
});
```

#### Return Value
```json
{
  "streamId": "project-plan-stream-001",
  "status": "streaming",
  "websocketEndpoint": "ws://localhost:3003/stream/project-plan-stream-001",
  "provider": "anthropic",
  "features": {
    "realTimeDelivery": true,
    "tokenByToken": true,
    "cancellable": true,
    "reconnectable": true
  }
}
```

---

### 12. `get_provider_status`
**Get health, performance, and cost information for all AI providers**

#### Parameters
```typescript
{
  provider?: 'openai' | 'anthropic' | 'google'    // Specific provider, or omit for all
}
```

#### Usage Examples
```typescript
// Get status for all providers
const allProviders = await get_provider_status();

// Get status for specific provider
const openaiStatus = await get_provider_status({
  provider: "openai"
});
```

#### Return Value
```json
{
  "timestamp": "2025-08-02T02:14:26.041Z",
  "providers": [
    {
      "provider": "anthropic",
      "status": "healthy",
      "availability": "99.9%",
      "responseTime": "145ms",
      "rateLimit": {
        "remaining": 847,
        "resetTime": "2025-08-02T03:14:26.041Z"
      },
      "costs": {
        "thisHour": "$2.15",
        "today": "$18.40",
        "thisMonth": "$245.80"
      },
      "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"]
    }
  ],
  "systemStatus": {
    "loadBalancer": "active",
    "failover": "enabled", 
    "costOptimization": "enabled"
  }
}
```

---

### 13. `configure_providers`
**Dynamically configure AI provider settings, API keys, and routing rules**

#### Parameters
```typescript
{
  provider: 'openai' | 'anthropic' | 'google',    // Provider to configure (required)
  configuration: object                            // Provider-specific config (required)
}
```

#### Usage Examples
```typescript
// Configure OpenAI settings
await configure_providers({
  provider: "openai",
  configuration: {
    apiKey: "sk-new-api-key-here",
    defaultModel: "gpt-4",
    rateLimits: {
      requestsPerMinute: 100,
      tokensPerMinute: 50000
    },
    routingRules: ["cost_optimization", "availability_first"]
  }
});

// Configure Anthropic with custom settings
await configure_providers({
  provider: "anthropic",
  configuration: {
    defaultModel: "claude-3-sonnet-20240229",
    maxTokens: 4000,
    temperature: 0.3,
    costLimits: {
      dailyBudget: 50.00,
      monthlyBudget: 1000.00
    }
  }
});
```

#### Return Value
```json
{
  "provider": "openai",
  "previousConfig": {
    "apiKey": "***hidden***",
    "models": ["gpt-4", "gpt-3.5-turbo"],
    "rateLimits": {"requestsPerMinute": 60}
  },
  "newConfig": {
    "apiKey": "***hidden***",
    "defaultModel": "gpt-4",
    "rateLimits": {"requestsPerMinute": 100}
  },
  "applied": "2025-08-02T02:14:26.041Z",
  "effects": {
    "apiKeyUpdated": true,
    "modelsUpdated": false,
    "rateLimitsUpdated": true,
    "routingRulesUpdated": true
  }
}
```

---

## Autonomous Operations (4 tools)

### 14. `start_autonomous_mode`
**Enable autonomous operation mode for AI agents with intelligent task management**

#### Parameters
```typescript
{
  agentId: string,                                    // Agent to enable autonomous mode (required)
  mode?: 'reactive' | 'proactive' | 'collaborative', // Default: 'reactive' 
  tokenBudget?: number,                               // Token budget per hour, default: 10000
  tasks?: string[]                                    // Initial task list
}
```

#### Usage Examples
```typescript
// Start basic autonomous mode
await start_autonomous_mode({
  agentId: "claude-code-cli",
  mode: "reactive",
  tokenBudget: 15000
});

// Start proactive autonomous mode with tasks
await start_autonomous_mode({
  agentId: "devops-agent",
  mode: "proactive", 
  tokenBudget: 20000,
  tasks: [
    "monitor-deployment-pipeline",
    "check-system-health-metrics",
    "optimize-resource-usage",
    "update-security-patches"
  ]
});

// Start collaborative autonomous mode
await start_autonomous_mode({
  agentId: "qa-testing-agent",
  mode: "collaborative",
  tokenBudget: 12000,
  tasks: [
    "coordinate-with-development-team",
    "run-automated-test-suites",
    "report-test-results",
    "suggest-quality-improvements"
  ]
});
```

#### Return Value
```json
{
  "configId": "auto-config-abc123",
  "status": "autonomous_mode_active",
  "configuration": {
    "agentId": "claude-code-cli",
    "mode": "reactive",
    "tokenBudget": {
      "hourly": 15000,
      "remaining": 15000,
      "resetTime": "2025-08-02T03:14:26.041Z"
    },
    "tasks": [],
    "startTime": "2025-08-02T02:14:26.041Z",
    "configuredBy": "unified-neural-mcp-server",
    "status": "active"
  },
  "features": {
    "intelligentTaskManagement": true,
    "costOptimization": true,
    "collaborativeDecisionMaking": false,
    "proactiveExecution": false
  }
}
```

---

### 15. `configure_agent_behavior`
**Configure autonomous agent behavior patterns and decision-making rules**

#### Parameters
```typescript
{
  agentId: string,                    // Agent to configure (required)
  behaviorSettings: {                 // Behavior configuration (required)
    decisionThreshold?: number,       // Decision confidence threshold
    collaborationMode?: 'solo' | 'team' | 'leader',
    learningRate?: number,            // How quickly to adapt behavior
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive'
  }
}
```

#### Usage Examples
```typescript
// Configure conservative decision-making
await configure_agent_behavior({
  agentId: "production-deployment-agent",
  behaviorSettings: {
    decisionThreshold: 0.9,
    collaborationMode: "team",
    learningRate: 0.05,
    riskTolerance: "conservative"
  }
});

// Configure aggressive optimization agent
await configure_agent_behavior({
  agentId: "performance-optimization-agent", 
  behaviorSettings: {
    decisionThreshold: 0.7,
    collaborationMode: "leader",
    learningRate: 0.2,
    riskTolerance: "aggressive"
  }
});

// Configure collaborative team player
await configure_agent_behavior({
  agentId: "code-review-agent",
  behaviorSettings: {
    decisionThreshold: 0.8,
    collaborationMode: "team",
    learningRate: 0.1,
    riskTolerance: "moderate"
  }
});
```

#### Return Value
```json
{
  "behaviorId": "behavior-xyz789",
  "agentId": "production-deployment-agent",
  "configuration": {
    "agentId": "production-deployment-agent",
    "behaviorSettings": {
      "decisionThreshold": 0.9,
      "collaborationMode": "team", 
      "learningRate": 0.05,
      "riskTolerance": "conservative"
    },
    "configuredBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z",
    "version": "1.0.0"
  },
  "effects": {
    "decisionMaking": "updated",
    "collaborationPattern": "modified",
    "learningBehavior": "adjusted",
    "riskAssessment": "recalibrated"
  }
}
```

---

### 16. `set_token_budget`
**Set and manage token budgets for cost optimization across agents**

#### Parameters
```typescript
{
  agentId?: string,           // Agent to set budget for, or omit for global
  hourlyBudget?: number,      // Tokens per hour
  dailyBudget?: number,       // Tokens per day
  priorityTasks?: string[]    // Tasks that bypass budget restrictions
}
```

#### Usage Examples
```typescript
// Set budget for specific agent
await set_token_budget({
  agentId: "claude-code-cli",
  hourlyBudget: 15000,
  dailyBudget: 300000,
  priorityTasks: [
    "critical-bug-fixes",
    "security-vulnerabilities",
    "production-outages"
  ]
});

// Set global budget limits
await set_token_budget({
  hourlyBudget: 50000,
  dailyBudget: 1000000,
  priorityTasks: [
    "system-down-recovery",
    "data-breach-response"
  ]
});

// Set conservative budget for cost control
await set_token_budget({
  agentId: "research-agent",
  hourlyBudget: 5000,
  dailyBudget: 100000
});
```

#### Return Value
```json
{
  "budgetId": "budget-def456",
  "configuration": {
    "agentId": "claude-code-cli",
    "budgets": {
      "hourly": 15000,
      "daily": 300000,
      "remaining": {
        "hourly": 15000,
        "daily": 300000
      },
      "resetTimes": {
        "hourly": "2025-08-02T03:14:26.041Z",
        "daily": "2025-08-03T02:14:26.041Z"
      }
    },
    "priorityTasks": ["critical-bug-fixes", "security-vulnerabilities"],
    "configuredBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z"
  },
  "costManagement": {
    "automaticOptimization": true,
    "priorityTasksExempt": true,
    "crossProviderOptimization": true,
    "realTimeTracking": true
  }
}
```

---

### 17. `trigger_agent_action`
**Manually trigger specific agent actions or workflows**

#### Parameters
```typescript
{
  agentId: string,                                    // Agent to trigger action for (required)
  action: string,                                     // Action to trigger (required)
  parameters?: object,                                // Action parameters
  priority?: 'low' | 'normal' | 'high' | 'urgent'   // Default: 'normal'
}
```

#### Usage Examples
```typescript
// Trigger code review action
await trigger_agent_action({
  agentId: "code-review-agent",
  action: "review-pull-request",
  parameters: {
    pullRequestId: "PR-123",
    repository: "myapp-backend",
    branch: "feature/authentication-fix"
  },
  priority: "high"
});

// Trigger deployment action
await trigger_agent_action({
  agentId: "devops-agent", 
  action: "deploy-to-staging",
  parameters: {
    environment: "staging",
    version: "v2.1.3",
    rollbackEnabled: true
  },
  priority: "normal"
});

// Trigger urgent security scan
await trigger_agent_action({
  agentId: "security-agent",
  action: "security-vulnerability-scan",
  parameters: {
    target: "production-api",
    scanType: "comprehensive",
    includeThirdParty: true
  },
  priority: "urgent"
});
```

#### Return Value
```json
{
  "actionId": "action-ghi789",
  "status": "triggered",
  "request": {
    "id": "action-ghi789",
    "agentId": "code-review-agent",
    "action": "review-pull-request",
    "parameters": {
      "pullRequestId": "PR-123",
      "repository": "myapp-backend"
    },
    "priority": "high",
    "triggeredBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z",
    "status": "queued",
    "estimatedCompletion": "2025-08-02T02:19:26.041Z"
  },
  "execution": {
    "queuePosition": 2,
    "estimatedStart": "immediate",
    "priorityHandling": true,
    "autonomousExecution": true
  }
}
```

---

## Cross-Platform Support (4 tools)

### 18. `translate_path`
**Translate file paths between different operating systems**

#### Parameters
```typescript
{
  path: string,                                 // Path to translate (required)
  fromPlatform: 'windows' | 'wsl' | 'linux',  // Source platform (required)
  toPlatform: 'windows' | 'wsl' | 'linux'     // Target platform (required)
}
```

#### Usage Examples
```typescript
// Windows to WSL path translation
const wslPath = await translate_path({
  path: "C:\\Users\\developer\\projects\\myapp",
  fromPlatform: "windows",
  toPlatform: "wsl"
});

// WSL to Windows path translation
const windowsPath = await translate_path({
  path: "/mnt/c/projects/myapp/src/components",
  fromPlatform: "wsl", 
  toPlatform: "windows"
});

// Linux to Windows path translation
const crossPlatformPath = await translate_path({
  path: "/home/user/workspace/project",
  fromPlatform: "linux",
  toPlatform: "windows"
});
```

#### Return Value
```json
{
  "originalPath": "C:\\Users\\developer\\projects\\myapp",
  "fromPlatform": "windows",
  "toPlatform": "wsl",
  "translatedPath": "/mnt/c/users/developer/projects/myapp",
  "pathInfo": {
    "isAbsolute": true,
    "containsSpaces": false,
    "pathSeparator": "/",
    "isValid": true
  }
}
```

---

### 19. `test_connectivity`
**Test cross-platform connectivity and network accessibility**

#### Parameters
```typescript
{
  targetPlatform?: 'windows' | 'wsl' | 'linux',  // Platform to test connectivity to
  services?: string[]                             // Specific services to test
}
```

#### Usage Examples
```typescript
// Test general connectivity
const connectivityTest = await test_connectivity({
  targetPlatform: "wsl"
});

// Test specific services
const serviceTest = await test_connectivity({
  targetPlatform: "windows",
  services: ["mcp-server", "docker", "ssh"]
});

// Test all services on current platform
const fullTest = await test_connectivity();
```

#### Return Value
```json
{
  "targetPlatform": "wsl",
  "timestamp": "2025-08-02T02:14:26.041Z",
  "overallStatus": "healthy",
  "tests": [
    {
      "service": "network",
      "status": "pass",
      "responseTime": "25ms",
      "details": "All network interfaces accessible"
    },
    {
      "service": "mcp-server",
      "status": "pass", 
      "responseTime": "78ms",
      "endpoint": "http://localhost:6174/health"
    },
    {
      "service": "message-hub",
      "status": "pass",
      "responseTime": "32ms",
      "websocket": "ws://localhost:3003"
    }
  ]
}
```

---

### 20. `generate_configs`
**Generate platform-specific configuration files for different clients**

#### Parameters
```typescript
{
  platform: 'windows' | 'macos' | 'linux',          // Target platform (required)
  client: 'claude-desktop' | 'cursor' | 'vscode',   // Target client (required)
  serverEndpoint?: string                            // MCP server endpoint
}
```

#### Usage Examples
```typescript
// Generate Claude Desktop config for Windows
const claudeConfig = await generate_configs({
  platform: "windows",
  client: "claude-desktop",
  serverEndpoint: "http://localhost:6174/mcp"
});

// Generate Cursor IDE config for macOS
const cursorConfig = await generate_configs({
  platform: "macos",
  client: "cursor"
});

// Generate VS Code config for Linux
const vscodeConfig = await generate_configs({
  platform: "linux",
  client: "vscode",
  serverEndpoint: "http://localhost:6174/mcp"
});
```

#### Return Value
```json
{
  "platform": "windows",
  "client": "claude-desktop",
  "serverEndpoint": "http://localhost:6174/mcp",
  "configurations": {
    "configFile": "claude_desktop_config.json",
    "configPath": "%APPDATA%\\Claude\\claude_desktop_config.json",
    "content": {
      "mcpServers": {
        "neural-ai-collaboration": {
          "command": "npx",
          "args": ["@modelcontextprotocol/server-fetch", "http://localhost:6174/mcp"]
        }
      }
    },
    "setup": "Place this configuration at %APPDATA%\\Claude\\claude_desktop_config.json"
  },
  "instructions": {
    "installation": "Install the configuration in the appropriate location for claude-desktop on windows",
    "restart": "Restart claude-desktop after configuration",
    "testing": "Use the health endpoint to verify connectivity"
  }
}
```

---

### 21. `sync_platforms`
**Synchronize data and configurations across different platforms**

#### Parameters
```typescript
{
  sourcePlatform: string,    // Source platform identifier (required)
  targetPlatforms: string[], // Target platforms to sync to (required)
  syncType?: 'memory' | 'config' | 'agents' | 'all'  // Default: 'all'
}
```

#### Usage Examples
```typescript
// Sync all data from WSL to Windows
const fullSync = await sync_platforms({
  sourcePlatform: "wsl-development",
  targetPlatforms: ["windows-production", "linux-staging"],
  syncType: "all"
});

// Sync only memory data
const memorySync = await sync_platforms({
  sourcePlatform: "local-development",
  targetPlatforms: ["remote-backup"],
  syncType: "memory"
});

// Sync configurations only
const configSync = await sync_platforms({
  sourcePlatform: "primary-workstation", 
  targetPlatforms: ["backup-workstation", "mobile-setup"],
  syncType: "config"
});
```

#### Return Value
```json
{
  "sourcePlatform": "wsl-development",
  "targetPlatforms": ["windows-production", "linux-staging"],
  "syncType": "all",
  "timestamp": "2025-08-02T02:14:26.041Z",
  "results": [
    {
      "platform": "windows-production",
      "status": "success",
      "syncedItems": {
        "memory": 85,
        "config": 12,
        "agents": 6
      },
      "syncTime": "3200ms"
    },
    {
      "platform": "linux-staging",
      "status": "success", 
      "syncedItems": {
        "memory": 85,
        "config": 12,
        "agents": 6
      },
      "syncTime": "2800ms"
    }
  ]
}
```

---

## Consensus & Coordination (4 tools)

### 22. `submit_consensus_vote`
**Submit votes for distributed consensus decisions using RAFT protocol**

#### Parameters
```typescript
{
  proposalId: string,                          // Unique proposal identifier (required)
  vote: 'approve' | 'reject' | 'abstain',     // Vote decision (required)
  agentId: string,                             // Voting agent identifier (required)
  reasoning?: string                           // Optional reasoning for the vote
}
```

#### Usage Examples
```typescript
// Vote to approve deployment
await submit_consensus_vote({
  proposalId: "deploy-v2.1.3-production",
  vote: "approve",
  agentId: "devops-agent",
  reasoning: "All tests passed, security review completed, performance benchmarks met"
});

// Vote to reject risky change
await submit_consensus_vote({
  proposalId: "database-schema-migration-v3",
  vote: "reject", 
  agentId: "database-admin-agent",
  reasoning: "Migration would cause 6+ hour downtime, needs redesign for zero-downtime approach"
});

// Abstain from vote due to insufficient information
await submit_consensus_vote({
  proposalId: "new-api-rate-limits",
  vote: "abstain",
  agentId: "performance-agent",
  reasoning: "Need more performance testing data before making recommendation"
});
```

#### Return Value
```json
{
  "voteId": "vote-jkl012",
  "voteData": {
    "proposalId": "deploy-v2.1.3-production",
    "vote": "approve",
    "agentId": "devops-agent",
    "reasoning": "All tests passed, security review completed...",
    "timestamp": "2025-08-02T02:14:26.041Z",
    "submittedBy": "unified-neural-mcp-server"
  },
  "consensusStatus": {
    "proposalStatus": "active",
    "totalVotes": 3,
    "consensusReached": false,
    "raftTerm": 5
  },
  "raftProtocol": {
    "nodeId": "unified-neural-mcp-server",
    "term": 5,
    "distributedProcessing": true
  }
}
```

---

### 23. `get_consensus_status`
**Get current status of consensus votes and decisions**

#### Parameters
```typescript
{
  proposalId?: string    // Specific proposal, or omit for all active proposals
}
```

#### Usage Examples
```typescript
// Get status for specific proposal
const proposalStatus = await get_consensus_status({
  proposalId: "deploy-v2.1.3-production"
});

// Get status for all active proposals
const allProposalsStatus = await get_consensus_status();
```

#### Return Value
```json
{
  "proposalId": "deploy-v2.1.3-production",
  "totalVotes": 5,
  "voteBreakdown": {
    "approve": 4,
    "reject": 1,
    "abstain": 0
  },
  "status": "decided",
  "requiredVotes": 3,
  "timeRemaining": "completed",
  "decision": "approved",
  "votingAgents": [
    {
      "agentId": "devops-agent",
      "vote": "approve",
      "timestamp": "2025-08-02T02:14:26.041Z"
    },
    {
      "agentId": "security-agent",
      "vote": "approve", 
      "timestamp": "2025-08-02T02:15:12.041Z"
    }
  ]
}
```

---

### 24. `coordinate_agents`
**Coordinate complex multi-agent tasks with dependency management**

#### Parameters
```typescript
{
  taskId: string,         // Unique task identifier (required)
  agents: string[],       // List of agent IDs to coordinate (required)
  workflow: object,       // Task workflow definition with dependencies (required)
  deadline?: string       // ISO timestamp deadline
}
```

#### Usage Examples
```typescript
// Coordinate feature development workflow
await coordinate_agents({
  taskId: "feature-user-authentication",
  agents: ["backend-agent", "frontend-agent", "qa-agent", "devops-agent"],
  workflow: {
    phases: [
      {
        name: "backend-development",
        assignedTo: "backend-agent",
        dependencies: [],
        estimatedDuration: "3 days",
        deliverables: ["API endpoints", "database schema", "unit tests"]
      },
      {
        name: "frontend-integration",
        assignedTo: "frontend-agent", 
        dependencies: ["backend-development"],
        estimatedDuration: "2 days",
        deliverables: ["login component", "authentication flow", "error handling"]
      },
      {
        name: "quality-assurance",
        assignedTo: "qa-agent",
        dependencies: ["frontend-integration"],
        estimatedDuration: "1 day",
        deliverables: ["test plan", "automated tests", "integration tests"]
      },
      {
        name: "deployment",
        assignedTo: "devops-agent",
        dependencies: ["quality-assurance"],
        estimatedDuration: "0.5 days",
        deliverables: ["staging deployment", "production deployment"]
      }
    ]
  },
  deadline: "2025-08-09T17:00:00.000Z"
});

// Coordinate urgent bug fix
await coordinate_agents({
  taskId: "hotfix-security-vulnerability",
  agents: ["security-agent", "backend-agent", "qa-agent"],
  workflow: {
    phases: [
      {
        name: "vulnerability-analysis",
        assignedTo: "security-agent",
        dependencies: [],
        priority: "urgent"
      },
      {
        name: "fix-implementation", 
        assignedTo: "backend-agent",
        dependencies: ["vulnerability-analysis"],
        priority: "urgent"
      },
      {
        name: "emergency-testing",
        assignedTo: "qa-agent",
        dependencies: ["fix-implementation"],
        priority: "urgent"
      }
    ]
  },
  deadline: "2025-08-02T18:00:00.000Z"
});
```

#### Return Value
```json
{
  "coordinationId": "coord-mno345",
  "plan": {
    "taskId": "feature-user-authentication",
    "agents": ["backend-agent", "frontend-agent", "qa-agent", "devops-agent"],
    "workflow": {
      "phases": [/* workflow phases */]
    },
    "deadline": "2025-08-09T17:00:00.000Z",
    "coordinatedBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z",
    "status": "coordinating",
    "dependencies": [
      {
        "task": "backend-development",
        "dependsOn": [],
        "priority": "high"
      },
      {
        "task": "frontend-integration", 
        "dependsOn": ["backend-development"],
        "priority": "medium"
      }
    ],
    "estimatedCompletion": "2025-08-09T14:30:00.000Z"
  },
  "execution": {
    "parallelExecution": true,
    "dependencyManagement": true,
    "realTimeMonitoring": true,
    "automaticFailover": true
  }
}
```

---

### 25. `resolve_conflicts`
**Resolve conflicts between agents or competing decisions**

#### Parameters
```typescript
{
  conflictId: string,                                      // Conflict identifier (required)
  resolutionStrategy: 'voting' | 'priority' | 'merge' | 'escalate',  // Resolution strategy (required)
  involvedAgents?: string[]                                // Agents involved in the conflict
}
```

#### Usage Examples
```typescript
// Resolve architecture decision conflict via voting
await resolve_conflicts({
  conflictId: "database-choice-postgres-vs-mongodb",
  resolutionStrategy: "voting",
  involvedAgents: ["backend-architect", "database-admin", "performance-engineer"]
});

// Resolve deployment timing conflict by priority
await resolve_conflicts({
  conflictId: "deployment-window-conflict",
  resolutionStrategy: "priority",
  involvedAgents: ["devops-agent", "product-manager"]
});

// Merge conflicting code changes
await resolve_conflicts({
  conflictId: "merge-conflict-authentication-module",
  resolutionStrategy: "merge",
  involvedAgents: ["developer-alice", "developer-bob"]
});

// Escalate complex architectural decision
await resolve_conflicts({
  conflictId: "microservices-vs-monolith",
  resolutionStrategy: "escalate",
  involvedAgents: ["senior-architect", "cto", "tech-lead"]
});
```

#### Return Value
```json
{
  "resolutionId": "resolution-pqr678",
  "conflictResolution": {
    "conflictId": "database-choice-postgres-vs-mongodb",
    "resolutionStrategy": "voting",
    "involvedAgents": ["backend-architect", "database-admin", "performance-engineer"],
    "resolvedBy": "unified-neural-mcp-server",
    "timestamp": "2025-08-02T02:14:26.041Z",
    "resolution": {
      "method": "consensus_vote",
      "outcome": "majority_wins",
      "decision": "PostgreSQL selected",
      "votingResults": {
        "postgresql": 2,
        "mongodb": 1
      }
    },
    "status": "resolved"
  },
  "outcome": {
    "strategyEffective": true,
    "agentsNotified": true,
    "systemStabilized": true,
    "preventiveMeasures": "implemented"
  }
}
```

---

## System Monitoring & Control (2 tools)

### 26. `get_system_status`
**Get comprehensive system status including all subsystems and performance metrics**

#### Parameters
```typescript
{
  includeMetrics?: boolean,    // Include performance metrics, default: true
  includeHealth?: boolean      // Include health checks, default: true
}
```

#### Usage Examples
```typescript
// Get full system status
const fullStatus = await get_system_status({
  includeMetrics: true,
  includeHealth: true
});

// Get basic status without metrics
const basicStatus = await get_system_status({
  includeMetrics: false,
  includeHealth: true
});

// Get only health information
const healthOnly = await get_system_status({
  includeHealth: true,
  includeMetrics: false
});
```

#### Return Value
```json
{
  "timestamp": "2025-08-02T02:14:26.041Z",
  "service": "neural-ai-collaboration",
  "version": "1.0.0",
  "uptime": 7245.123,
  "overallHealth": "healthy",
  "health": {
    "memory": {
      "sqlite": {"connected": true, "type": "SQLite"},
      "redis": {"connected": true, "type": "Redis Cache"},
      "weaviate": {"connected": true, "type": "Vector Database"},
      "neo4j": {"connected": true, "type": "Graph Database"},
      "advancedSystemsEnabled": true
    },
    "messageHub": "active",
    "databases": {
      "sqlite": "connected",
      "neo4j": "simulated",
      "redis": "simulated", 
      "weaviate": "simulated"
    }
  },
  "metrics": {
    "requests": {
      "total": 1247,
      "perMinute": 23,
      "errors": 3
    },
    "agents": {
      "registered": 8,
      "active": 5,
      "autonomous": 2
    },
    "memory": {
      "entities": 342,
      "relations": 89,
      "messages": 567
    }
  }
}
```

---

### 27. `configure_system`
**Configure system-wide settings and parameters**

#### Parameters
```typescript
{
  configSection: 'memory' | 'networking' | 'security' | 'performance',  // Section to modify (required)
  settings: object                                                       // Configuration settings (required)
}
```

#### Usage Examples
```typescript
// Configure memory settings
await configure_system({
  configSection: "memory",
  settings: {
    cacheSize: "2GB",
    retentionDays: 45,
    indexing: "enabled",
    compressionLevel: "medium"
  }
});

// Configure networking settings
await configure_system({
  configSection: "networking",
  settings: {
    port: 6174,
    cors: "enabled",
    ssl: "enabled",
    maxConnections: 1000,
    timeout: "45s"
  }
});

// Configure security settings
await configure_system({
  configSection: "security",
  settings: {
    authentication: "token",
    encryption: "tls13",
    firewall: "enabled",
    auditLogging: "detailed",
    rateLimiting: {
      requestsPerMinute: 100,
      burstLimit: 150
    }
  }
});

// Configure performance settings
await configure_system({
  configSection: "performance",
  settings: {
    maxConcurrency: 150,
    timeout: "30s",
    optimization: "enabled", 
    caching: {
      enabled: true,
      ttl: 3600,
      maxSize: "1GB"
    }
  }
});
```

#### Return Value
```json
{
  "configSection": "performance",
  "previousSettings": {
    "maxConcurrency": 100,
    "timeout": "30s",
    "optimization": "enabled"
  },
  "newSettings": {
    "maxConcurrency": 150,
    "timeout": "30s",
    "optimization": "enabled",
    "caching": {
      "enabled": true,
      "ttl": 3600,
      "maxSize": "1GB"
    }
  },
  "appliedBy": "unified-neural-mcp-server",
  "timestamp": "2025-08-02T02:14:26.041Z",
  "effects": [
    "performance_optimized",
    "resource_usage_changed",
    "cache_settings_updated"
  ]
}
```

---

## 🔧 Tool Discovery & Testing

### **List All Available Tools**
```typescript
// This will show all 27 tools with descriptions
// Available automatically in Claude Code when MCP is configured
```

### **Test Tool Availability**
```bash
# Check if MCP server is running and tools are available
curl http://localhost:6174/health

# Check MCP configuration
claude mcp list
# Should show: neural-ai-collaboration: npx @modelcontextprotocol/server-fetch http://localhost:6174/mcp
```

### **Quick Tool Test**
```typescript
// Test basic functionality
await create_entities({
  entities: [{
    name: "Tool Test Entity",
    entityType: "test",
    observations: ["Testing tool functionality", "All systems operational"]
  }]
});

await search_entities({
  query: "tool test",
  limit: 5
});
```

---

## 🚨 Troubleshooting Guide

### **Common Issues & Solutions**

#### **1. MCP Tools Not Available in Claude Code**

**Symptoms**: No neural-ai-collaboration tools appear in Claude Code  
**Diagnosis**:
```bash
# Check MCP server status
curl http://localhost:6174/health
# Expected: {"status":"healthy","service":"unified-neural-mcp-server",...}

# Check Claude Code MCP configuration
claude mcp list
# Expected: neural-ai-collaboration: npx @modelcontextprotocol/server-fetch http://localhost:6174/mcp
```

**Solutions**:
```bash
# Option 1: Restart MCP server
./safe-shutdown.sh && ./interactive-startup.sh

# Option 2: Reconfigure MCP
claude mcp remove neural-ai-collaboration
claude mcp add neural-ai-collaboration "npx" "@modelcontextprotocol/server-fetch" "http://localhost:6174/mcp"

# Option 3: Check if ports are blocked
netstat -an | grep 6174
# Should show: 0.0.0.0:6174 LISTEN
```

#### **2. "Tool Not Found" or "Unknown Tool" Errors**

**Symptoms**: Error when calling tools like `create_entities` or `send_ai_message`  
**Diagnosis**:
```bash
# Verify all 27 tools are registered
curl http://localhost:6174/api/tools | python3 -m json.tool
# Expected: List of 27 tools with proper schemas
```

**Solutions**:
```bash
# Restart the unified server
docker restart neural-mcp-unified

# Verify tool registration
curl http://localhost:6174/api/tools | grep -c "name"
# Expected: 27 (one for each tool)

# Check server logs
docker logs neural-mcp-unified | tail -20
```

#### **3. Database Connection Failures**

**Symptoms**: Tools fail with database-related errors  
**Diagnosis**:
```bash
# Check system status
curl http://localhost:6174/system/status | python3 -c "
import sys,json
data = json.load(sys.stdin)
print('Database Status:')
for db, status in data.get('databases', {}).items():
    print(f'  {db}: {\"✅\" if status.get(\"connected\") else \"❌\"} {status}')
"
```

**Solutions**:
```bash
# Restart database containers
docker restart neural-ai-postgres-simple neural-ai-redis neural-ai-weaviate neural-ai-neo4j

# Wait for databases to initialize (30-60 seconds)
sleep 60

# Verify database connections
curl http://localhost:6174/health
```

#### **4. Performance Issues (Slow Tool Responses)**

**Symptoms**: Tools take >5 seconds to respond  
**Diagnosis**:
```bash
# Check system performance
curl http://localhost:6174/system/status | python3 -c "
import sys,json
data = json.load(sys.stdin)
perf = data.get('performance', {})
print(f'Storage Latency: {perf.get(\"storage_latency\", \"unknown\")}')
print(f'Retrieval Speed: {perf.get(\"retrieval_speed\", \"unknown\")}')
print(f'Memory Usage: {perf.get(\"memory_usage\", \"unknown\")}')
"
```

**Solutions**:
```bash
# Clear Redis cache
docker exec neural-ai-redis redis-cli FLUSHALL

# Restart system with fresh databases
./safe-shutdown.sh && ./interactive-startup.sh --fresh

# Check Docker resources
docker stats --no-stream | grep neural
```

#### **5. Cross-Platform Issues (Windows/WSL)**

**Symptoms**: Windows Claude Desktop can't reach WSL services  
**Diagnosis**:
```bash
# From Windows PowerShell, test connectivity
curl http://localhost:6174/health
# If this fails, WSL port forwarding isn't working

# Check WSL IP and port binding
ip addr show eth0 | grep inet
netstat -an | grep 6174
```

**Solutions**:
```bash
# Option 1: Fix WSL port forwarding
# From Windows PowerShell as Administrator:
netsh interface portproxy add v4tov4 listenport=6174 listenaddress=0.0.0.0 connectport=6174 connectaddress=172.x.x.x

# Option 2: Use WSL IP directly in MCP config
# Get WSL IP: hostname -I | awk '{print $1}'
# Update MCP config to use http://172.x.x.x:6174/mcp

# Option 3: Restart WSL networking
wsl --shutdown
# Then restart WSL and the platform
```

#### **6. Tool Parameter Validation Errors**

**Symptoms**: "Invalid parameter" or schema validation errors  
**Diagnosis**: Check tool schemas in this reference guide

**Solutions**:
```typescript
// Ensure all required parameters are provided
await create_entities({
  entities: [{
    name: "Required field",           // ✅ Required
    entityType: "Required field",     // ✅ Required  
    observations: ["At least one"]   // ✅ Required array
  }]
});

// Check parameter types match schema
await send_ai_message({
  to: "string",                     // ✅ Must be string
  message: "string",                // ✅ Must be string
  type: "optional string",          // ⚠️ Optional
  priority: "low" | "medium" | "high" // ⚠️ Specific values only
});
```

#### **7. Memory/Storage Issues**

**Symptoms**: "Storage failed" or "Database full" errors  
**Diagnosis**:
```bash
# Check disk space
df -h /var/lib/docker
df -h $(pwd)/data

# Check database sizes
docker exec neural-ai-postgres-simple psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'));"
```

**Solutions**:
```bash
# Clean up old Docker data
docker system prune -f

# Backup and clean databases if needed
./safe-shutdown.sh
# This creates backup and cleans up

# Restart with fresh databases if critical
./interactive-startup.sh --fresh
```

### **Advanced Diagnostics**

#### **Complete System Health Check**
```bash
#!/bin/bash
echo "=== Neural AI Platform Diagnostics ==="
echo ""

echo "1. Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep neural

echo -e "\n2. Network Connectivity:"
for port in 6174 5174 3004 6379 8080 7474; do
  if nc -z localhost $port; then
    echo "  ✅ Port $port: Open"
  else  
    echo "  ❌ Port $port: Closed"
  fi
done

echo -e "\n3. MCP Server Health:"
curl -s http://localhost:6174/health | python3 -m json.tool

echo -e "\n4. Database Connections:"
curl -s http://localhost:6174/system/status | python3 -c "
import sys,json
try:
    data = json.load(sys.stdin)
    for db, status in data.get('databases', {}).items():
        print(f'  {db}: {\"✅\" if status.get(\"connected\") else \"❌\"} Connected')
except: print('  ❌ Unable to get status')
"

echo -e "\n5. MCP Configuration:"
claude mcp list 2>/dev/null || echo "  ❌ Claude Code not configured or not installed"

echo -e "\n6. Available Tools:"
tool_count=$(curl -s http://localhost:6174/api/tools | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('tools', [])))" 2>/dev/null || echo "0")
echo "  Found: $tool_count/27 tools"
```

#### **Performance Benchmark**
```bash
# Test tool response times
echo "Testing tool performance..."
time curl -s http://localhost:6174/health > /dev/null
time curl -s http://localhost:6174/system/status > /dev/null
time curl -s http://localhost:6174/api/tools > /dev/null
```

### **Getting Help & Support**

#### **Self-Diagnosis Resources**
- **Health Endpoint**: http://localhost:6174/health
- **System Status**: http://localhost:6174/system/status  
- **Tool List**: http://localhost:6174/api/tools
- **Real-time Status**: http://localhost:5176 (Vue Dashboard)

#### **Log Locations**
```bash
# Container logs
docker logs neural-mcp-unified
docker logs neural-ai-postgres-simple
docker logs neural-ai-redis

# Application logs
ls -la /home/tomcat65/projects/shared-memory-mcp/data/logs/

# Autonomous agent logs
ls -la /home/tomcat65/projects/shared-memory-mcp/data/*-autonomous.log
```

#### **Reset Procedures**

**Soft Reset** (preserve data):
```bash
./safe-shutdown.sh && ./interactive-startup.sh --restore
```

**Hard Reset** (fresh start):
```bash
./safe-shutdown.sh && ./interactive-startup.sh --fresh
```

**Emergency Reset** (force clean):
```bash
docker stop $(docker ps -aq --filter "name=neural")
docker rm $(docker ps -aq --filter "name=neural")
docker volume rm $(docker volume ls -q | grep neural)
./interactive-startup.sh --fresh
```

---

## 📊 Summary

**Total Tools**: 27 Advanced AI Collaboration Tools  
**Categories**: 7 Functional Categories  
**Server**: Unified Neural MCP Server (Port 6174)  
**Status**: ✅ Fully Operational and Tested  
**Integration**: ✅ Working with Claude Code, Claude Desktop, Cursor IDE  

This complete reference provides detailed documentation for all 27 tools in the Neural AI Collaboration Platform, with real-world usage examples and comprehensive parameter documentation.
