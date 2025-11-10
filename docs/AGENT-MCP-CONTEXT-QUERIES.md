# Agent MCP Config + Context Queries

Use this minimal MCP entry for every agent to connect to the Unified Neural MCP server on port `6174`.

MCP config entry (Claude/Cursor/any MCP client):

```
"neural-ai-collaboration": {
  "command": "npx",
  "args": [
    "mcp-remote",
    "http://localhost:6174/mcp"
  ]
}
```

Windows/WSL: if the MCP server runs in WSL/Docker and the client runs on Windows, use `http://host.docker.internal:6174/mcp`.

## Standard Context Retrieval

Run the five standard searches via `search_entities` (hybrid search) so every agent retrieves the same shared context:

Queries:
- Universal MCP Gateway
- infrastructure
- Windows-WSL
- event-driven sync
- test_results

JSON-RPC (HTTP) call shape:

```
POST http://localhost:6174/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_entities",
    "arguments": { "query": "<QUERY>", "searchType": "hybrid", "limit": 50 }
  }
}
```

Ready-to-run cURL loop:

```bash
ENDPOINT=${ENDPOINT:-http://localhost:6174/mcp}
for q in \
  "Universal MCP Gateway" \
  "infrastructure" \
  "Windows-WSL" \
  "event-driven sync" \
  "test_results" ; do
  echo "\n--- Query: $q" >&2
  curl -s -X POST "$ENDPOINT" -H "Content-Type: application/json" -d "$(jq -n \
    --arg q "$q" '{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"search_entities",arguments:{query:$q,searchType:"hybrid",limit:50}}}')"
  echo
done
```

Tip: On Windows PowerShell, replace `jq -n ...` with a literal JSON string or use `@modelcontextprotocol/server-fetch` in your MCP config.

