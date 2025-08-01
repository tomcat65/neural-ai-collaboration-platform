# 🎯 Cursor IDE MCP Configuration Fix

Based on official Cursor documentation research.

---

## 🔧 **Cursor MCP Setup Method**

### **Step 1: Enable MCP Feature**
1. Open Cursor
2. Press `Ctrl + ,` (Settings)
3. Go to **Features** → **Model Context Protocol**
4. **Enable MCP servers** option

### **Step 2: Create MCP Configuration File**

**Option A: Project-specific (Recommended)**
Create file: `.cursor/mcp.json` in your project root

**Option B: Global**  
Create file: `~/.cursor/mcp.json` in your home directory

### **Step 3: Configuration Content**

Use this exact configuration in your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

### **Step 4: Verify Setup**
1. **Settings** → **MCP** 
2. Look for a **green active status** next to "neural-ai-collaboration"
3. Should show list of available tools

---

## 🚀 **Quick Setup Commands**

**From your project directory:**
```bash
# Create Cursor MCP config directory
mkdir -p .cursor

# Create the configuration file
echo '{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:6174/mcp"
      ]
    }
  }
}' > .cursor/mcp.json
```

---

## 🔍 **Key Differences from Claude Desktop**

| Aspect | Claude Desktop | Cursor |
|--------|----------------|---------|
| **Config File** | `claude_desktop_config.json` | `.cursor/mcp.json` |
| **Structure** | `mcpServers` | `mcpServers` |
| **Location** | `%APPDATA%\Claude\` | Project root or `~/.cursor/` |
| **Args Format** | Standard | Needs `-y` flag |

---

## 🎯 **Alternative Cursor Configurations**

### **Option 1: Global Home Directory**
Create: `~/.cursor/mcp.json`
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:6174/mcp"]
    }
  }
}
```

### **Option 2: Direct Docker Bridge**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "alpine/socat",
        "STDIO", "TCP:host.docker.internal:6174"
      ]
    }
  }
}
```

---

## ✅ **Verification Steps**

1. **Check MCP Status**: Settings → MCP → Look for green dot
2. **Agent Mode**: Switch to **Agent Mode** (not Ask Mode)
3. **Test Tools**: Ask "What MCP tools are available?"
4. **Toggle Tools**: Click tool names to enable/disable

---

## 🐞 **Troubleshooting**

### **"Server not found"**
- Ensure `mcp-remote` is installed: `npm install -g mcp-remote`
- Check Docker container: `docker ps | grep neural-mcp-unified`

### **"No green status"**
- Verify JSON syntax with validator
- Check file location: `.cursor/mcp.json` in project root
- Restart Cursor completely

### **"Tools not appearing"**
- Switch to **Agent Mode** (required for MCP)
- Enable auto-run in Agent settings if desired
- Check individual tool toggles in MCP settings

---

## 📁 **File Creation Script**

Run this in your project directory:

```bash
# Windows PowerShell
mkdir .cursor -Force
Set-Content -Path ".cursor/mcp.json" -Value '{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:6174/mcp"]
    }
  }
}'
```

The key difference is Cursor uses `.cursor/mcp.json` and needs the `-y` flag!