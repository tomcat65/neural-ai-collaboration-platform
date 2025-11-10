# Claude Desktop STDIO Bridge Fix - Windows WSL2 Integration

## Problem
Claude Desktop on Windows cannot directly connect to MCP servers running in WSL2 due to:
- Network isolation between Windows and WSL2
- STDIO communication limitations
- Dynamic IP addressing in WSL2

## Solution: Node.js STDIO Bridge

### 1. Create Bridge Script
Create `mcp-stdio-http-bridge.cjs` in your project directory:

```javascript
// Bridge script to connect Claude Desktop to WSL2 MCP server
const net = require('net');
const { spawn } = require('child_process');

// Configuration
const WSL_IP = process.env.WSL_IP || '172.20.1.55';
const MCP_PORT = process.env.MCP_PORT || 6174;

// Create stdio bridge implementation here
// (Full implementation details available in the bridge script)
```

### 2. Claude Desktop Configuration

Update your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp/fetch",
        "-e",
        "OPENAPI_MCP_HEADERS",
        "mcp/notion"
      ],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer YOUR_API_TOKEN_HERE\", \"Notion-Version\": \"2022-06-28\"}"
      }
    },
    "neural-ai-collaboration": {
      "command": "node",
      "args": [
        "\\\\wsl.localhost\\Ubuntu\\home\\tomcat65\\projects\\shared-memory-mcp\\mcp-stdio-http-bridge.cjs"
      ]
    }
  }
}
```

### 3. Important Notes

- Replace `YOUR_API_TOKEN_HERE` with your actual API tokens
- Store sensitive tokens in environment variables
- Never commit API tokens to version control
- The bridge script handles STDIO-to-HTTP translation
- Supports real-time bidirectional communication

### 4. Testing

Test the connection:
```bash
# In WSL2
curl http://localhost:6174/health

# From Windows
curl http://172.20.1.55:6174/health
```

## Security Best Practices

1. Use environment variables for sensitive data
2. Add `.env` files to `.gitignore`
3. Rotate tokens regularly
4. Use secure token storage solutions
5. Never hardcode tokens in documentation or code
