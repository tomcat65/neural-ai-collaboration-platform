# Claude Desktop Windows Fix - Complete WSL2 Integration Guide

## Overview
This guide provides solutions for connecting Claude Desktop on Windows to MCP servers running in WSL2.

## Solution 1: Direct IP Connection

### 1. Find WSL2 IP Address
```bash
# In WSL2
ip addr show eth0 | grep inet | awk '{print $2}' | cut -d/ -f1
```

### 2. Configure Claude Desktop
Update MCP configuration with WSL2 IP:

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
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://172.20.1.55:6174/mcp"
      ]
    }
  }
}
```

## Solution 2: STDIO Bridge (Recommended)

Use the Node.js bridge script for more reliable connection:
- See `CLAUDE_DESKTOP_STDIO_BRIDGE_FIX_SAFE.md` for implementation

## Common Issues and Solutions

### Issue 1: Connection Drops
- Use STDIO bridge for persistent connections
- Configure Windows Firewall to allow WSL2 traffic

### Issue 2: Dynamic IP Changes
- Use environment variables for IP configuration
- Consider using a hostname resolver

### Issue 3: Authentication Errors
- Ensure tokens are properly formatted
- Check token permissions and expiration

## Security Recommendations

1. **Environment Variables**: Store sensitive data in `.env` files
2. **Token Management**: Use secure token storage, never hardcode
3. **Access Control**: Limit MCP server access to localhost/specific IPs
4. **Regular Updates**: Keep all components updated
5. **Audit Logs**: Monitor access and usage

## Testing Your Setup

```bash
# Test from WSL2
curl http://localhost:6174/health

# Test from Windows
curl http://<WSL2_IP>:6174/health

# Test MCP tools
curl -X POST http://<WSL2_IP>:6174/api/tools
```

## Best Practices

- Always use placeholders for sensitive data in documentation
- Keep API tokens in secure storage
- Document your specific network configuration
- Test connections after system restarts
- Maintain backup connection methods