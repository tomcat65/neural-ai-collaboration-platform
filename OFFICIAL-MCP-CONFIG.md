# 🎯 Official MCP Configuration - Claude Desktop & Cursor

Based on official Anthropic MCP documentation and research.

---

## 📍 **Your Server Status**
✅ HTTP MCP Server running at: `http://localhost:6174/mcp`  
✅ Health check working: `http://localhost:6174/health`

---

## 🧠 **Claude Desktop Configuration**

### **File Location:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

### **Method 1: Using npx mcp-remote (Official)**

First install the MCP remote tool:
```bash
npm install -g mcp-remote
```

Then use this configuration:
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

### **Method 2: Docker Bridge (If mcp-remote fails)**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "alpine/socat",
        "STDIO",
        "TCP:host.docker.internal:6174"
      ]
    }
  }
}
```

### **Method 3: STDIO Bridge with curl**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "--data-binary", "@-",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

---

## ⚡ **Cursor IDE Configuration**

### **Method 1: Settings UI**
1. Open Cursor → Press `Ctrl + ,` (Settings)
2. Search for "MCP"
3. Add new server:
   - **Name**: `neural-ai-collaboration`
   - **Command**: `npx`
   - **Args**: `mcp-remote`, `http://localhost:6174/mcp`

### **Method 2: Settings JSON**
Press `Ctrl + Shift + P` → "Preferences: Open Settings (JSON)"
```json
{
  "mcp.servers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

---

## 🔧 **Setup Steps**

### **Step 1: Install MCP Remote**
```bash
npm install -g mcp-remote
```

### **Step 2: Test Installation**
```bash
npx mcp-remote --help
```

### **Step 3: Test Direct Connection**
```bash
npx mcp-remote http://localhost:6174/mcp
```

### **Step 4: Configure Claude Desktop**
1. **In Claude Desktop**: Settings → Developer → "Edit config"
2. **Use Method 1 configuration** (mcp-remote)
3. **Save** and **restart Claude Desktop**

### **Step 5: Configure Cursor**
1. **Use Settings UI** or **JSON method**
2. **Save** and **restart Cursor**

---

## 🧪 **Verification**

### **Claude Desktop**
1. Open Developer tab in Settings
2. Check MCP server status shows "running"
3. Ask Claude: "What MCP tools are available?"

### **Cursor** 
1. Open AI chat panel
2. Ask: "List available MCP capabilities"

---

## 🐞 **Troubleshooting**

### **"mcp-remote not found"**
```bash
# Install globally
npm install -g mcp-remote

# Or use full path
npx --yes mcp-remote http://localhost:6174/mcp
```

### **"Connection refused"**
- Ensure Docker container is running: `docker ps | grep neural-mcp-unified`
- Test health: `curl http://localhost:6174/health`

### **"Server disconnected"**
- Check Claude Desktop Developer Console (`Ctrl + Shift + I`)
- Verify JSON syntax with validator
- Try alternative configuration methods

---

## 💡 **Key Points**

1. **HTTP MCP servers** need a STDIO bridge (mcp-remote, docker, curl)
2. **Claude Desktop** uses `mcpServers` (camelCase)
3. **Cursor** uses `mcp.servers` (dot notation)
4. **Both clients** need the bridge tool to connect to HTTP servers
5. **Your server** is HTTP-based, not STDIO-based

---

## 🚀 **Quick Test Command**

```bash
# Install and test in one command
npm install -g mcp-remote && npx mcp-remote http://localhost:6174/mcp
```

If this works, your Claude Desktop config will work too!