# How to Proceed with API Key (Neural MCP)

Follow these steps to secure your Neural MCP server and connect your IDE/agents.

Your API key example (replace with your own):

- `IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=`

---

## 1) Set the API key for the server

Use Docker Compose (recommended). The compose already references `API_KEY=${API_KEY}` for the unified server.

1. Create or update the project env file at repo root:

```bash
cd /home/tomcat65/projects/shared-memory-mcp
cp -n .env.example .env  # if not present
```

2. Edit `.env` and set:

```bash
API_KEY=IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=
MESSAGE_HUB_PORT=3004
WEAVIATE_VECTORIZER=text2vec-transformers
```

3. Start (or restart) the unified stack so it reads the new env:

```bash
docker compose -f docker/docker-compose.unified-neural-mcp.yml up -d --build
```

4. Check health (always public):

```bash
curl http://localhost:6174/health | jq
```

Note: All other endpoints now require `x-api-key`.

---

## 2) Configure your IDE/agent to send the key

You have two easy options. Use only one.

### Option A — Local STDIO bridge (auto‑adds header)

Add this to your TOML (e.g., `~/.mcp.toml` or your client’s config file). The bridge forwards STDIO → HTTP MCP and injects `x-api-key` automatically when `API_KEY` is set in its env.

```toml
[mcp_servers.neural_ai_collaboration]
command = "/home/tomcat65/.nvm/versions/node/v20.19.3/bin/node"
args = ["/home/tomcat65/projects/shared-memory-mcp/mcp-stdio-http-bridge.cjs"]
env = { MCP_HOST = "localhost", MCP_PORT = "6174", API_KEY = "IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=" }
```

### Option B — mcp-remote (explicit header)

```toml
[mcp_servers.neural_ai_secure]
command = "/home/tomcat65/.npm-global/bin/mcp-remote"
args = ["--header", "x-api-key:IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=", "http://localhost:6174/mcp"]
```

After saving, reconnect your MCP server in the IDE.

---

## 3) Sanity tests

- Without key (should be 401):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:6174/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

- With key (200 OK expected):

```bash
curl -s http://localhost:6174/mcp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: IzMklkUkoJv+Thkjp+4B9DVqYYkzHCKQCBJD5dzOW0g=' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq
```

---

## 4) Using from MCP tools in IDE

- The following tools are available once connected:
  - `create_entities`, `search_entities`, `add_observations`, `create_relations`, `read_graph`
  - `send_ai_message`, `get_ai_messages`
  - `record_learning`, `set_preferences`, `get_individual_memory`

Example (record a learning):

```json
{
  "name": "record_learning",
  "arguments": {
    "context": "repo onboarding",
    "lesson": "IDE linked to Neural MCP",
    "confidence": 0.95
  }
}
```

---

## 5) Troubleshooting

- 401 Unauthorized:
  - Ensure `API_KEY` is set in the server env (`.env`) and client side (TOML env or `--header`).
  - Recreate the containers after changing `.env`:
    - `docker compose -f docker/docker-compose.unified-neural-mcp.yml up -d --build`
- Health works but tools fail:
  - Health is intentionally public; all other routes require the key.
- Port already in use (6174 or 3004):
  - `ss -ltnp | rg ':6174|:3004'` and stop the conflicting process/container.
- Bridge not sending header:
  - Ensure the TOML has `env = { API_KEY = "..." }`.
  - Alternatively switch to `mcp-remote` with `--header`.

---

## 6) Rotating the key

1. Change `API_KEY` in `.env` (or export a new value) and recreate the stack.
2. Update your client TOML/env or `--header` to the new value.
3. Reconnect the MCP server in your IDE.

---

Keep this file as your quick reference when you return.
