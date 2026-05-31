# Engram (shared-memory-mcp) — Usage Examples

> Personal, local-first agent memory + cross-agent messaging over MCP. All
> examples assume the server is running on `localhost:6174` with `API_KEY` set
> (see [README.md](README.md)). `${API_KEY}` is your key from `.env`.

Practical examples using the 18 MCP tools against the live server at `http://localhost:6174`.

All examples require `API_KEY` set in your environment.

## Knowledge Graph

### Store and Search Entities
```bash
# Create an entity with observations
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{"name":"create_entities","arguments":{
      "entities":[{
        "name":"Authentication System",
        "entityType":"architecture",
        "observations":["JWT with refresh tokens","bcrypt password hashing","Rate-limited login endpoint"]
      }]
    }}
  }' | jq

# Search for it
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{"name":"search_entities","arguments":{
      "query":"authentication","searchType":"exact","limit":10
    }}
  }' | jq
```

### Add Observations and Relations
```bash
# Add observations to an existing entity
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"add_observations","arguments":{
      "observations":[{
        "entityName":"Authentication System",
        "contents":["Added MFA support","OAuth2 provider integration"]
      }]
    }}
  }' | jq

# Create a relation between entities
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"create_relations","arguments":{
      "relations":[{
        "from":"Authentication System",
        "to":"User Database",
        "relationType":"depends_on"
      }]
    }}
  }' | jq

# Read the full graph
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_graph","arguments":{}}}' | jq
```

## AI-to-AI Messaging

### Send and Retrieve Messages
```bash
# Send a message from one agent to another
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":10,"method":"tools/call",
    "params":{"name":"send_ai_message","arguments":{
      "from":"claude-code",
      "to":"claude-sonnet",
      "content":"P5 complete. Redis and Neo4j removed. 14/14 tests passing.",
      "messageType":"status",
      "priority":"normal"
    }}
  }' | jq

# Get unread messages only
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":11,"method":"tools/call",
    "params":{"name":"get_ai_messages","arguments":{
      "agentId":"claude-sonnet",
      "unreadOnly":true,
      "markAsRead":true
    }}
  }' | jq

# Get all recent messages (no since filter)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":12,"method":"tools/call",
    "params":{"name":"get_ai_messages","arguments":{
      "agentId":"claude-code",
      "limit":10
    }}
  }' | jq

# Monitor a shared inbox (IMPORTANT: use unreadOnly:false)
# Other agents mark their own messages read during execution,
# so unreadOnly:true returns 0 for inboxes you don't own.
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":13,"method":"tools/call",
    "params":{"name":"get_ai_messages","arguments":{
      "agentId":"codex",
      "unreadOnly":false,
      "limit":5
    }}
  }' | jq
```

### HTTP Messaging Endpoints
```bash
# Send via HTTP (simpler for scripts)
curl -s -X POST http://localhost:6174/ai-message \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"from":"script","to":"claude-code","message":"Deployment complete","type":"info"}'

# Retrieve via HTTP (supports unreadOnly and markAsRead query params)
curl -s -H "X-API-Key: ${API_KEY}" \
  "http://localhost:6174/ai-messages/claude-code?unreadOnly=true&markAsRead=true&limit=5"
```

## Agent Management

### Register and Query Agents
```bash
# Register an agent
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":20,"method":"tools/call",
    "params":{"name":"register_agent","arguments":{
      "agentId":"codex-cli",
      "name":"Codex CLI Agent",
      "capabilities":["coding","review","architecture"]
    }}
  }' | jq

# Check agent status
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":21,"method":"tools/call",
    "params":{"name":"get_agent_status","arguments":{"agentId":"codex-cli"}}
  }' | jq
```

## Individual Memory

### Record Learnings and Preferences
```bash
# Record a learning
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":30,"method":"tools/call",
    "params":{"name":"record_learning","arguments":{
      "agentId":"claude-code",
      "context":"database migration",
      "lesson":"Always use INSERT OR IGNORE for idempotent migrations",
      "confidence":0.95
    }}
  }' | jq

# Set preferences
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":31,"method":"tools/call",
    "params":{"name":"set_preferences","arguments":{
      "agentId":"claude-code",
      "preferences":{"communicationStyle":"concise","codeStyle":"functional"}
    }}
  }' | jq

# Retrieve individual memory
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":32,"method":"tools/call",
    "params":{"name":"get_individual_memory","arguments":{"agentId":"claude-code"}}
  }' | jq
```

## Session Protocol

### Get Agent Context (tiered HOT/WARM/COLD)
```bash
# HOT context (identity + unread messages + guardrails)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"tools/call",
    "params":{"name":"get_agent_context","arguments":{
      "agentId":"claude-code"
    }}
  }' | jq

# WARM context (HOT + project summary + recent decisions)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":2,"method":"tools/call",
    "params":{"name":"get_agent_context","arguments":{
      "agentId":"claude-code",
      "projectId":"my-project",
      "depth":"warm"
    }}
  }' | jq

# COLD context (everything — full observations and entities)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"get_agent_context","arguments":{
      "agentId":"claude-code",
      "projectId":"my-project",
      "depth":"cold"
    }}
  }' | jq
```

### Begin Session (open project context + handoff)
```bash
# Opens a session, creates project skeleton if needed, returns handoff from prior session
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"begin_session","arguments":{
      "agentId":"claude-code",
      "projectId":"my-project"
    }}
  }' | jq
```

### End Session (write handoff + learnings)
```bash
# Close session with handoff flag and learnings for next agent
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"tools/call",
    "params":{"name":"end_session","arguments":{
      "agentId":"claude-code",
      "projectId":"my-project",
      "summary":"Implemented session protocol tools. 27/27 tests passing.",
      "openItems":["Add Slack webhook URL to production env","Write integration tests with real Slack"],
      "learnings":[
        {"context":"session handoffs","lesson":"Partial unique index ensures exactly one active handoff per project","confidence":1.0},
        {"context":"notifications","lesson":"NotificationPort pattern keeps Slack swappable without touching tool handlers","confidence":0.95}
      ]
    }}
  }' | jq
```

### Session Round-Trip Workflow
```typescript
// Agent 1 ends session with handoff
await end_session({
  agentId: "claude-code",
  projectId: "my-project",
  summary: "Completed auth module refactor. Tests passing.",
  openItems: ["Deploy to staging", "Update API docs"],
  learnings: [{ context: "auth", lesson: "JWT refresh needs 15min window", confidence: 0.9 }]
});

// Agent 2 begins next session — gets the handoff automatically
const session = await begin_session({
  agentId: "codex",
  projectId: "my-project"
});
// session.handoff._wrapped contains "Completed auth module refactor. Tests passing."
// session.handoff._openItemsWrapped contains wrapped versions of ["Deploy to staging", "Update API docs"]
```

## Cross-Platform Path Translation

```bash
# Translate a Linux path to Windows
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":40,"method":"tools/call",
    "params":{"name":"translate_path","arguments":{
      "path":"/home/tomcat65/projects/shared-memory-mcp",
      "fromPlatform":"linux",
      "toPlatform":"windows"
    }}
  }' | jq
```

## System Health

```bash
# Health check (public, no auth)
curl -s http://localhost:6174/health | jq

# Readiness (shows SQLite + vector status)
curl -s -H "X-API-Key: ${API_KEY}" http://localhost:6174/ready | jq

# Full system status
curl -s -H "X-API-Key: ${API_KEY}" http://localhost:6174/system/status | jq
```

## Semantic Search (sqlite-vec)

`search_entities` is **exact-first** (name/alias/graph matches anchor results);
the vector path runs only when exact finds nothing, is hard-timeout'd
(`SEARCH_SEMANTIC_TIMEOUT_MS`, default 4000) and degrades to exact rather than
hanging. Results carry `semanticSimilarity`; entities/observations are weighted
above chat messages (`RECALL_W_*`). Embeddings are local (`all-MiniLM-L6-v2`).
```bash
# Semantic search (vector similarity)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":50,"method":"tools/call",
    "params":{"name":"search_entities","arguments":{
      "query":"database performance optimization",
      "searchType":"semantic",
      "limit":10
    }}
  }' | jq

# Hybrid search (default — combines exact + semantic)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{
    "jsonrpc":"2.0","id":51,"method":"tools/call",
    "params":{"name":"search_entities","arguments":{
      "query":"authentication"
    }}
  }' | jq
```

## Cross-Agent Collaboration (the ledger pattern)

The durable way two agents collaborate: **messages are the turn-signal; a shared
knowledge-graph entity is the system of record.** Don't hold the work in the message
stream (it's transient) — append it as observations to a shared task entity.

```bash
# 1. Create a shared task entity (the "ledger") + bootstrap note for future agents
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"create_entities","arguments":{
    "entities":[{"name":"dashboard-refactor","entityType":"task",
      "agentBootstrap":["Read this entity first; converse via observations, not chat."],
      "observations":["TASK: refactor the dashboard agent roster. Collaborators: claude-code, codex-desktop."]}]}}}' | jq

# 2. Each substantive turn = ONE observation on the entity, attributed + typed.
#    kind ∈ proposal|decision|question|blocker|progress|done|correction
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":61,"method":"tools/call","params":{"name":"add_observations","arguments":{
    "agentId":"codex-desktop",
    "observations":[{"entityName":"dashboard-refactor","kind":"proposal",
      "contents":["PROPOSAL: move identity logic server-side; UI trusts the contract."]}]}}}' | jq

# 3. Disagree without overwriting — kind:correction + supersedes the prior observation id
#    Converge by recording ONE kind:decision that supersedes the open question(s).

# 4. Ping the peer ONLY as a turn-signal (the substance is already on the ledger)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":62,"method":"tools/call","params":{"name":"send_ai_message","arguments":{
    "from":"codex-desktop","to":"claude-code","messageType":"collaboration",
    "content":"Recorded a proposal on dashboard-refactor — your turn (read the ledger)."}}}' | jq

# 5. Read the LEDGER (authoritative), not just the inbox — filter to a peer's posts
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":63,"method":"tools/call","params":{"name":"search_entities","arguments":{
    "query":"dashboard-refactor","searchType":"exact","agentFilter":"codex-desktop"}}}' | jq
```

**Why it's durable:** observations are append-only with provenance, so both agents
write concurrently with no locking, threads merge cleanly, and the full decision
history survives restarts and inbox churn. `get_agent_context` also **inlines unread
message previews**, so an agent sees what's waiting on a single context load — no
polling required (polling, where available, just lowers latency).

In Claude Code, the `coordinate-agents` skill runs this whole loop:
*"coordinate with cowork and codex-desktop"*.
