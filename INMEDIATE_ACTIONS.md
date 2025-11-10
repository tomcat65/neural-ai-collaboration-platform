**Context**
- You started `neural-mcp-unified` from the Philly Wings project and ran Codex CLI and Claude Code CLI in separate terminals inside Cursor IDE.
- The CLIs could not “hear” each other’s messages.

**Symptoms Observed**
- No cross-CLI message retrieval: the target CLI returned no messages via `get_ai_messages`.
- `src/unified-neural-mcp-logs.md` was empty on host. Container logs showed activity.
- Repeating warning in container logs when calling MCP tools:
  - `⚠️ Failed to publish event to unified server: TypeError: fetch failed (ECONNREFUSED ::1:3000)`

**Root Causes**
- Message routing mismatch in `send_ai_message` (Unified MCP server):
  - File: `src/unified-neural-mcp-server.ts:560`
  - The tool schema used `agentId` (target) and the implementation also used the same field as sender. As a result, messages were stored as if sent from X → X, so the other CLI never matched `to/target` in `get_ai_messages`.
- Log path confusion:
  - Runtime logs are not written to `src/unified-neural-mcp-logs.md`. The compose mounts `./logs` to `/app/logs`, and service logs are available via `docker logs neural-mcp-unified`.
- Event publishing errors are benign:
  - The unified server event bridge posts to `http://localhost:3000` from inside the container. No service listens there, so `ECONNREFUSED` occurs. This does not affect messaging, only optional event publishing.

**Fixes Applied (Completed)**
1) Correct sender/recipient handling in Unified MCP server ✅
   - File: `src/unified-neural-mcp-server.ts:560`
   - Input schema for `send_ai_message` now accepts:
     - `to` (target), optional `from` (sender), legacy aliases kept: `agentId` → `to`, `message` → `content`.
     - Required: `content` only (we validate recipients at runtime).
   - File: `src/unified-neural-mcp-server.ts:1335`
     - Resolves `targetAgentId = args.to || args.agentId` and `senderAgentId = args.from || this.agentId`.
     - Stores messages as `from: sender → to: target` and publishes correct event metadata.

2) Default sender injection in STDIO→HTTP bridge ✅
   - File: `mcp-stdio-http-bridge.cjs`
   - Reads `FROM` or `MCP_FROM` env variable and injects `from` for `send_ai_message` when missing.
   - Logs usage to stderr for transparency.

3) Zero‑config agent identity + auto‑registration (new) ✅
   - File: `mcp-stdio-http-bridge.cjs:21, 87`
   - If `FROM`/`MCP_FROM` are not provided, the bridge generates a stable ephemeral ID: `agent-<host>-<pid>-<ts>`.
   - On MCP `initialize`, the bridge auto‑calls `register_agent` with this ID and `name: stdio-bridge-<host>`.
   - Result: Agents no longer need pre‑assigned names; discovery works via `get_agent_status`.

4) Capability‑based targeting and broadcast for `send_ai_message` (new) ✅
   - File: `src/unified-neural-mcp-server.ts:560, 1335`
   - Added fields: `toCapabilities` (alias `capabilities`), `broadcast`, `excludeSelf` (default true), and `to: "*"` shorthand.
   - Sends to all agents whose registered capabilities include ALL provided values, or to all agents (broadcast), or directly by `to`.
   - Returns recipients + messageIds; publishes one event per recipient.

**Verification Steps**
1) Rebuild and restart Unified MCP service
   - `docker compose -f docker-compose-unified.yml up -d --build neural-mcp-unified`
   - Health check: `curl -s http://localhost:6174/health`
   - Status: `curl -s http://localhost:6174/system/status | jq .`

2) Set a default sender per CLI session (optional but recommended)
   - In Codex CLI terminal: `export FROM=codex-cli`
   - In Claude Code CLI terminal: `export FROM=claude-code-cli`

3) Cross-CLI message test (HTTP quick test)
   - Send: `curl -sX POST http://localhost:6174/ai-message -H 'Content-Type: application/json' -d '{"from":"codex-cli","to":"claude-code-cli","message":"Hello from Codex"}'`
   - Read: `curl -s http://localhost:6174/ai-messages/claude-code-cli | jq .`

4) Cross-CLI message test (via MCP tool)
   - From Codex CLI (bridge injects `from`): call `send_ai_message` with
     - `{ "to": "claude-code-cli", "content": "Hello from Codex" }`
   - From Claude Code CLI, fetch via `get_ai_messages` with
     - `{ "agentId": "claude-code-cli", "limit": 10 }`

5) Discover agents without pre‑naming (new)
   - List registered agents:
     - `curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_agent_status","arguments":{}}}' | jq`
   - Pick a target by name or capabilities from the `agents[]` list.

6) Capability‑based message routing (new)
   - Send to agents matching both capabilities:
     - `curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"toCapabilities":["bridge","ai-to-ai-messaging"],"content":"Hello capability match!"}}}' | jq`

7) Broadcast message (new)
   - Send to all registered agents (except self):
     - `curl -s -H 'Content-Type: application/json' -H "x-api-key: ${API_KEY}" http://localhost:6174/mcp -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"broadcast":true,"content":"Heads up: maintenance window starts in 5m."}}}' | jq`

**About the Event Publishing Error (Port 3000)**
- Error text: `Failed to publish event to unified server: ... ECONNREFUSED ::1:3000`
- Why it happens:
  - File: `src/unified-neural-mcp-server.ts` (method `publishEventToUnified`)
  - Inside the container, `http://localhost:3000` refers to the container itself. There is no server listening on port 3000 inside this container, so the TCP connect fails.
- Impact:
  - Non-blocking. Only affects optional event publishing to a separate “unified server”. Messaging and memory APIs are unaffected.

**Unified Server Setup (Recommended)**
- We added first-class unified server support and compose wiring.
- Start both services together and route events/registration properly.

Actions:
- `docker compose -f docker-compose-unified.yml up -d --build unified-server neural-mcp-unified`
- Verify health:
  - `curl -s http://localhost:3000/health | jq .`  # unified server
  - `curl -s http://localhost:6174/health | jq .`  # unified MCP
- Ensure env: `UNIFIED_SERVER_URL=http://unified-server:3000` (already set for MCP in compose)
- Check events after sending a message:
  - `curl -s 'http://localhost:3000/api/events?type=ai.message.sent&limit=20' | jq .`

Notes:
- If you choose not to run the unified server, event publishing is now optional and silently skipped when `UNIFIED_SERVER_URL` is unset.

**Notes on Logs**
- Container logs: `docker logs -f neural-mcp-unified`
- Mounted path: host `./logs` ↔ container `/app/logs`
- The file `src/unified-neural-mcp-logs.md` is not used for live logging and may remain empty.

**Current Status**
- Unified server now records messages with correct `from` and `to`.
- Bridge injects a stable `from` per CLI session when desired.
- You can send and retrieve cross-CLI messages successfully after rebuild.
- Agents can be discovered dynamically; no pre‑assigned IDs required.
- `send_ai_message` supports direct, capability‑based, and broadcast routing.

**Remaining Work / Next Steps**
- Unify schemas across servers (pending):
  - Extend `src/mcp-http-server.ts` to add `from`, `toCapabilities`/`capabilities`, `broadcast`, and `excludeSelf` to `send_ai_message`.
  - Update its docs and examples to match the unified server.
- Documentation follow‑ups (pending):
  - Update README and examples to show capability selector and broadcast usage patterns, and the zero‑config auto‑registration flow.
  - Add a short “Agent Discovery” snippet using `get_agent_status {}`.
- Optional UX improvements (future):
  - Add a `/agents` HTTP endpoint to list discovered agents (mirror of `get_agent_status {}` without JSON‑RPC).
  - Provide a `/logs` HTTP view for easier host‑side debugging.
