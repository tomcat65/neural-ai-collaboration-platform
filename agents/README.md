# Agents Configs

This folder contains ready-to-use MCP server configurations for Claude Code agents.

Files
- `mcp-neural.json`: Uses the neutral STDIO→HTTP bridge (`node mcp-stdio-http-bridge.cjs`). Set `API_KEY` to your actual key.
- `mcp-neural-remote.json`: Uses `npx mcp-remote` to connect to the HTTP MCP endpoint directly. Set the header’s API key value.

Usage
- In TypeScript/Python SDK, reference with `mcpConfig: "agents/mcp-neural.json"` (or the remote variant) and add `"mcp__neural"` to `allowedTools`.
- Ensure your Unified MCP is running on `localhost:6174` and the key matches your server’s `.env`.

Example (TypeScript)
```ts
for await (const msg of query({
  prompt: "List tools and search memory",
  options: { mcpConfig: "agents/mcp-neural.json", allowedTools: ["mcp__neural"], maxTurns: 2 }
})) {
  if (msg.type === "result") console.log(msg.result);
}
```

