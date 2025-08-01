# Working MCP Configurations (Windows + WSL Ubuntu)

**Date**: July 29, 2025  
**Environment**: Windows machine with WSL Ubuntu  
**Status**: ✅ Tested and Working

## 🖥️ Cursor IDE (Windows)

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "cmd",
      "args": [
        "wsl",
        "node",
        "/home/tomcat65/projects/shared-memory-mcp/simple-mcp-server.js"
      ],
      "cwd": "/home/tomcat65/projects/shared-memory-mcp",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## 🖥️ Claude Desktop (Windows)

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "wsl",
      "args": ["node", "/home/tomcat65/projects/shared-memory-mcp/simple-mcp-server.js"],
      "cwd": "/home/tomcat65/projects/shared-memory-mcp",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## 🖥️ Claude Code CLI (Inside WSL)

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": [
        "/home/tomcat65/projects/shared-memory-mcp/simple-mcp-server.js"
      ],
      "cwd": "/home/tomcat65/projects/shared-memory-mcp",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## 📋 Key Differences

### Cursor IDE:
- Uses `"command": "cmd"` with `"wsl"` as first argument
- This ensures proper Windows → WSL command execution

### Claude Desktop:
- Uses `"command": "wsl"` directly
- Simpler syntax that Claude Desktop handles correctly

### Claude Code CLI:
- Uses `"command": "node"` directly
- Because it's already running inside WSL Ubuntu

## 🧪 Available MCP Tools

Once configured, you'll have access to these tools:

1. **`create_entities`** - Store knowledge in the shared memory system
2. **`send_ai_message`** - Send messages to other AI agents
3. **`get_ai_messages`** - Retrieve messages from the collaboration platform

## ✅ Verification

To verify your MCP connection is working:
1. Look for the "neural-ai-collaboration" server in your tool's MCP section
2. Test the `create_entities` tool with a simple entity
3. If successful, you're connected to the shared memory system at localhost:5174

## 🔗 System Architecture

```
Windows Host
│
├─ Cursor IDE ─────cmd──► WSL ──► simple-mcp-server.js ──► localhost:5174
│
├─ Claude Desktop ──wsl─► WSL ──► simple-mcp-server.js ──► localhost:5174
│
└─ WSL Ubuntu
   └─ Claude CLI ────────► simple-mcp-server.js ──► localhost:5174
```

All three tools connect to the same neural-ai-server running in Docker on localhost:5174, enabling seamless AI-to-AI collaboration with shared memory access.