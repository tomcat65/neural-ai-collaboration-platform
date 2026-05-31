# Engram — Personal Agent Memory & Collaboration (shared-memory-mcp)

A **single-user, local-first agent-memory server**: a SQLite + sqlite-vec knowledge
graph plus AI-to-AI messaging, exposed over MCP, that lets your LLM coding tools
(Claude Code, Codex, Cursor, ChatGPT, Cowork, …) **read, store, and preserve context
across sessions and collaborate with each other**.

> **Scope note.** This started life as a "multi-tenant Neural AI Collaboration
> Platform." It has been deliberately re-scoped ("Engram") to a **personal** tool:
> one user, localhost, SQLite as the single source of truth. The multi-tenant /
> Auth0 / Pass-2 machinery still exists in the tree but is **dormant by default**
> (`MULTI_TENANT_ENABLED` unset) and not the maintained direction.

## Architecture

| Component | Purpose |
|-----------|---------|
| **SQLite** | Primary ACID store — entities, observations, relations, messages, agent registry, sessions |
| **sqlite-vec** | Native vector search (vec0 mode) over local `@xenova/transformers` embeddings (`all-MiniLM-L6-v2`, 384-dim); lexical fallback if the extension/model is absent |
| **Express + MCP** | HTTP server with JSON-RPC MCP on port 6174 |
| **MessageHub** | WebSocket real-time messaging on port 3004 |

Embeddings run locally — no cloud dependency for the vector layer. The embedding
model is **warmed at startup** so the first semantic query doesn't cold-start.

## Canonical Runtime

Production server: `src/unified-neural-mcp-server.ts` (`NeuralMCPServer`).

- **Deploy/start (canonical):** `~/bin/neural-unified-up` — exports `API_KEY` from
  `.env`, rebuilds, and brings up the MCP server + Vue dashboard. **Always use this**
  rather than a bare `docker compose up` (which won't export the key → keyless boot).
- **Dev:** `npm run dev` (tsx) · **Prod (direct):** `npm start`
- **Build / typecheck / test:** `npm run build` · `npm run typecheck` · `npm run test:run`
  (the test suite is **hermetic** — it boots its own isolated server on a throwaway DB).

## Docker Deployment

```bash
# Canonical (recommended) — reads API_KEY from .env, rebuilds both services:
~/bin/neural-unified-up
~/bin/neural-unified-down     # stop
~/bin/neural-unified-status   # compose ps + health

# Manual equivalent (compose loads API_KEY from project-root .env via env_file):
docker compose -p unified \
  -f docker/docker-compose.unified-neural-mcp.yml \
  -f docker/docker-compose.unified-neural-mcp.dev.yml up -d --build

curl http://localhost:6174/health
```

### Services
| Service | Port | Purpose |
|---------|------|---------|
| **unified-neural-mcp** | 6174, 3004 | MCP server (JSON-RPC + HTTP API) + MessageHub WebSocket |
| **vue-dashboard** (dev overlay) | 5176 | Command-center UI (agents, messages, knowledge graph) |

Data lives in the Docker **named volume `unified_unified_neural_data`** (`/app/data`),
so rebuilds never touch your DB. Back up before migrations (consistent online
`.backup`, e.g. to `D:/neural-backups/`).

## Security & Auth

- **API key required** for all non-public endpoints. The server **fails fast at
  startup** if no `API_KEY`/`NEURAL_API_KEY` is set (single-key mode) — no
  silent keyless boot. Constant-time key comparison; format-validated.
- Clients send `X-API-Key` header (or `Authorization: Bearer`).
- Public endpoints: `/health`, `/health.json`, `/ready`.
- CORS is open by default; set `CORS_ORIGINS` (comma-separated) to restrict.
- Rate limiting with optional Redis backend, graceful in-memory fallback (limits
  are env-tunable).
- Data-management HTTP API (`/api/data/*`) is **disabled** unless
  `ENABLE_DATA_MANAGEMENT=1`, and then gated by `data:read`/`data:write` scope.

## MCP Tools

`tools/list` advertises **25 tools**. The authoritative, always-current reference is
**[docs/TOOLS_SCHEMA.md](docs/TOOLS_SCHEMA.md)** (regenerate with `npm run docs:tools`
from `src/shared/toolSchemas.ts`). Summary:

- **Knowledge graph:** `create_entities`, `add_observations`, `create_relations`,
  `read_graph`, `search_entities`, `get_entity_detail`, `delete_entity`,
  `remove_observations`, `update_observation`, `delete_observations_by_entity`
- **AI messaging:** `send_ai_message`, `get_ai_messages`, `get_message_detail`,
  `mark_messages_read`, `archive_messages`
- **Agent management:** `register_agent`, `set_agent_identity`, `get_agent_status`
- **Session / context:** `get_agent_context`, `begin_session`, `end_session`
- **Identity (Pass-2, optional):** `inspect_identity_candidates`, `get_entity_context`
- **User profile:** `get_user_profile`, `update_user_profile`
- **Also callable via case-handler (not in `tools/list`):** `record_learning`,
  `set_preferences`, `get_individual_memory`, `translate_path`, `search_nodes`
  (deprecated alias for `search_entities` graph mode)

### List tools
```bash
curl -s -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

## Recall behavior (search_entities)

- **Exact-first:** name/alias/graph matches anchor results; the broad semantic
  path only runs when exact finds nothing.
- **Bounded semantic:** the vector fallback is hard-timeout'd (`SEARCH_SEMANTIC_TIMEOUT_MS`,
  default 4000) and degrades to exact rather than hanging; results carry
  `semanticSimilarity` and set `semanticDegraded` on timeout.
- **Type-weighted ranking:** curated entities/observations outrank chat-message
  chatter (env-tunable `RECALL_W_*`).

## Cross-agent collaboration

The durable pattern: **messages are the turn-signal; a shared knowledge-graph
entity is the system of record.** Agents converse by appending observations
(`add_observations` with `kind: proposal|decision|question|blocker|progress|done|correction`)
to a shared task entity, disagree via `correction` + `supersedes`, and ping each
other only to say "your turn." `get_agent_context` inlines unread message previews
so an agent sees waiting messages on a single context load (no polling required).

A `coordinate-agents` skill (`.claude/skills/`) wraps this into one command, e.g.
*"coordinate with cowork and codex-desktop"*.

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health`, `/ready` | Liveness / readiness (public; `/ready`: 200 healthy, 207 degraded, 503 down) |
| POST | `/mcp` | MCP JSON-RPC (`tools/list`, `tools/call`) |
| POST | `/ai-message` · GET `/ai-messages/:agentId` | HTTP messaging |
| GET | `/api/agent-status` | Canonical agent roster (`?raw=true` for per-registration); `isEphemeral`, `canonicalAgentId` |
| GET | `/api/analytics` | Dashboard analytics incl. real `actualDbBytes` (SQLite PRAGMA) |
| GET | `/api/graph-export`, `/api/recent-events` | Dashboard graph + message feeds |
| GET/POST | `/api/data/*` | Export/import/snapshot/restore (disabled unless `ENABLE_DATA_MANAGEMENT=1`) |
| GET | `/system/status`, `/metrics`, `/slo/status` | Status, Prometheus metrics, SLO |

## Client Integrations (MCP)

Each tool runs the thin stdio↔HTTP bridge and points at the one local server. Set a
**stable `FROM` id** so the agent keeps one identity across reconnects (otherwise the
bridge mints a stable per-host `agent-<host>` id and persists it under
`~/.neural-mcp/`).

```jsonc
// Claude Code CLI / Cursor (WSL) — mcpServers entry
{
  "neural-ai-collaboration": {
    "command": "node",
    "args": ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"],
    "env": { "MCP_HOST": "localhost", "MCP_PORT": "6174", "API_KEY": "${API_KEY}", "FROM": "claude-code" }
  }
}
```
```jsonc
// Claude Desktop (Windows) — via mcp-remote
{ "neural-ai-collaboration": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "--header", "x-api-key:${API_KEY}", "http://localhost:6174/mcp"] } }
```
```toml
# Codex CLI (TOML)
[mcp_servers.neural_ai_collaboration]
command = "node"
args = ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"]
env = { MCP_HOST = "localhost", MCP_PORT = "6174", API_KEY = "${API_KEY}", FROM = "codex-desktop" }
```

See **[EXAMPLES_OF_USE.md](EXAMPLES_OF_USE.md)** for messaging, search, sessions, and
the collaboration-ledger workflow.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` (or `NEURAL_API_KEY`) | — | **Required** (single-key mode). Server fails fast if unset. |
| `NEURAL_MCP_PORT` | 6174 | MCP server port |
| `MESSAGE_HUB_PORT` | 3004 | WebSocket hub port |
| `NEURAL_DB_PATH` | `./data/unified-platform.db` | DB path override (isolated/test DBs) |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist to restrict CORS |
| `SEARCH_SEMANTIC_TIMEOUT_MS` | 4000 | Hard cap on the broad/semantic search path |
| `RECALL_W_ENTITY` / `_OBSERVATION` / `_RELATION` / `_LEARNING` / `_MESSAGE` / `_PLUMBING` | 1.0 / 0.95 / 0.9 / 0.85 / 0.8 / 0.3 | Semantic ranking weights by source type |
| `GENERAL_RATE_LIMIT_POINTS` / `MESSAGE_RATE_LIMIT_POINTS` | 100 / 20 | Per-minute rate limits |
| `REDIS_URL` / `RATE_LIMIT_REDIS_URL` | — | Optional Redis backend for rate limiting |
| `ENABLE_DATA_MANAGEMENT` | `0` | Enable `/api/data/*` (then needs `data:*` scope) |
| `ENABLE_ADMIN_ENDPOINTS` | `0` | Enable `/admin/*` debug surfaces |
| `MCP_BRIDGE_STATE_DIR` | `~/.neural-mcp` | Where the bridge persists its stable per-host id |
| `SLACK_WEBHOOK_URL` | — | Slack webhook for session notifications |
| `NODE_ENV` | development | Node environment |

## Migrations & maintenance

Standalone, dry-run-by-default migrations live in `src/migrations/` (run from `/app`
so native modules resolve). Examples shipped this cycle:
- `003-reclaim-embedding-json.mjs` — drops the redundant JSON embedding copy when
  vec0 is active + dedup indexes + VACUUM (reclaimed ~93MB on the live DB).
- `004-gc-ephemeral-registrations.mjs` — GCs throwaway bridge registrations
  (`agent-<host>-<pid>-<ts>`), preserving stable/named agents.

Always take a verified backup before applying a migration to the live DB.

## Port Reference

| Port | Service |
|------|---------|
| 6174 | MCP server (JSON-RPC + HTTP API) |
| 3004 | MessageHub WebSocket |
| 5176 | Vue dashboard (dev overlay) |
