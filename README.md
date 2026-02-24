# Neural AI Collaboration Platform

A **deterministic AI memory and messaging server** built on SQLite + Weaviate, exposing 18 MCP tools for knowledge graph management, AI-to-AI messaging, agent coordination, session protocol, and cross-platform support.

## Architecture

| Component | Purpose |
|-----------|---------|
| **SQLite** | Primary ACID storage — entities, relations, observations, messages, agent state |
| **Weaviate** | Optional vector database for semantic search (text2vec-transformers) |
| **Express + MCP** | HTTP server with JSON-RPC MCP protocol on port 6174 |
| **MessageHub** | WebSocket real-time messaging on port 3004 |

## Docker Deployment

### Quick Start
```bash
# Set your API key
export API_KEY="your-secret-key"

# Start the stack (3 services: neural-mcp + weaviate + t2v-transformers)
docker compose -p unified -f docker/docker-compose.unified-neural-mcp.yml up -d --build

# Verify health
curl http://localhost:6174/health
```

### Services
| Service | Port | Purpose |
|---------|------|---------|
| **unified-neural-mcp** | 6174, 3004 | MCP server + MessageHub WebSocket |
| **weaviate** | 8080 | Vector database for semantic search |
| **t2v-transformers** | (internal) | Sentence transformer model for Weaviate |

### Startup Scripts
Tommy's convenience scripts:
```bash
~/bin/neural-unified-up       # Start with API_KEY from .env
~/bin/neural-unified-down     # Stop
~/bin/neural-unified-status   # Show compose ps + health checks
```

## Security & Auth

- **API key required** for all non-health endpoints. Set `API_KEY` in `.env` or environment.
- Clients send `X-API-Key` header or `Authorization: Bearer` token.
- Public endpoints: `/health`, `/health.json`, `/ready`.
- Rate limiting with optional Redis backend (graceful fallback to in-memory).

## MCP Tools (18)

### Knowledge Graph (5)
| Tool | Description |
|------|-------------|
| `create_entities` | Create entities with observations in the knowledge graph |
| `add_observations` | Append observations to existing entities |
| `create_relations` | Create typed relationships between entities |
| `read_graph` | Read the full knowledge graph with statistics |
| `search_entities` | Federated search (exact, semantic, graph, hybrid) |

### AI Messaging (2)
| Tool | Description |
|------|-------------|
| `send_ai_message` | Send messages (direct, capability-based, or broadcast) |
| `get_ai_messages` | Retrieve messages with filtering, read tracking (`unreadOnly`, `markAsRead`) |

### Agent Management (3)
| Tool | Description |
|------|-------------|
| `register_agent` | Register an AI agent with capabilities |
| `set_agent_identity` | Update agent identity and re-register |
| `get_agent_status` | Get agent status and health info |

### Individual Memory (3)
| Tool | Description |
|------|-------------|
| `record_learning` | Record a learning entry for an agent |
| `set_preferences` | Update agent preferences |
| `get_individual_memory` | Retrieve preferences, learnings, and context |

### Session Protocol (3)
| Tool | Description |
|------|-------------|
| `get_agent_context` | Tiered context bundle (HOT/WARM/COLD) with identity, messages, guardrails, handoff |
| `begin_session` | Open a project session — loads context, returns handoff flag, creates project skeleton |
| `end_session` | Close a project session — writes handoff flag, records learnings, Slack notification |

### Utilities (2)
| Tool | Description |
|------|-------------|
| `translate_path` | Cross-platform path translation (Linux/Windows/WSL) |
| `search_nodes` | Deprecated alias for `search_entities` with `searchType: "graph"` |

### List Tools
```bash
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public) |
| GET | `/ready` | Readiness with system status |
| POST | `/mcp` | MCP JSON-RPC (tools/list, tools/call) |
| POST | `/ai-message` | Send AI message via HTTP |
| GET | `/ai-messages/:agentId` | Get messages (`?unreadOnly=true&markAsRead=true`) |
| GET | `/system/status` | Full system status |

## Client Integrations (MCP)

### Claude Desktop (Windows)
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "--header", "x-api-key:${API_KEY}", "http://localhost:6174/mcp"]
    }
  }
}
```

### Cursor IDE (WSL2)
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"],
      "env": { "MCP_HOST": "localhost", "MCP_PORT": "6174", "API_KEY": "${API_KEY}" }
    }
  }
}
```

### Claude Code CLI (WSL Ubuntu)
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"],
      "env": { "MCP_HOST": "localhost", "MCP_PORT": "6174", "API_KEY": "${API_KEY}" }
    }
  }
}
```

### Codex CLI (TOML)
```toml
[mcp_servers.neural_ai_collaboration]
command = "node"
args = ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"]
env = { MCP_HOST = "localhost", MCP_PORT = "6174", API_KEY = "${API_KEY}" }
```

## Cross-Agent Messaging

```bash
# Register an agent
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"register_agent","arguments":{"agentId":"my-agent","name":"My Agent","capabilities":["coding"]}}}'

# Send a message
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"from":"my-agent","to":"other-agent","content":"Hello!","messageType":"info"}}}'

# Get unread messages from your OWN inbox (and mark as read)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_ai_messages","arguments":{"agentId":"my-agent","unreadOnly":true,"markAsRead":true}}}'

# Monitor ANOTHER agent's inbox (use unreadOnly:false — they mark their own messages read)
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_ai_messages","arguments":{"agentId":"other-agent","unreadOnly":false,"limit":5}}}'
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | — | API key for authentication |
| `NEURAL_MCP_PORT` | No | 6174 | MCP server port |
| `MESSAGE_HUB_PORT` | No | 3004 | WebSocket hub port |
| `WEAVIATE_URL` | No | `http://weaviate:8080` | Weaviate connection URL |
| `ENABLE_ADVANCED_MEMORY` | No | true | Enable Weaviate integration |
| `SLACK_WEBHOOK_URL` | No | — | Slack Incoming Webhook URL for session notifications |
| `NODE_ENV` | No | development | Node environment |

## Documentation

- Tool schemas: `src/shared/toolSchemas.ts` (source of truth)
- Auto-generated docs: `npm run docs:tools` (outputs `docs/TOOLS_SCHEMA.md`)
- Examples: [EXAMPLES_OF_USE.md](EXAMPLES_OF_USE.md)

## Port Reference

| Port | Service |
|------|---------|
| 6174 | Unified MCP Server (JSON-RPC + HTTP API) |
| 3004 | MessageHub WebSocket |
| 8080 | Weaviate (internal to Docker network) |
