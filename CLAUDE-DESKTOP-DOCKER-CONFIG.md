# ✅ Docker is Working! Fix Claude Desktop Connection

## 🎯 **The Issue**
Docker is accessible at `http://localhost:6174` from Windows ✅
But Claude Desktop shows "server disconnected" ❌

This means we need to ensure the MCP server-fetch tool is properly installed.

---

## 🔧 **Step 1: Install MCP Server Fetch Globally**

Open **Windows PowerShell** and run:

```powershell
npm install -g @modelcontextprotocol/server-fetch
```

Verify installation:
```powershell
npm list -g @modelcontextprotocol/server-fetch
```

---

## 🧠 **Step 2: Claude Desktop Configuration**

Use this exact configuration:

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

---

## 🐞 **Step 3: Debug Claude Desktop**

### **Check Claude Desktop Logs**

1. Open Claude Desktop
2. Press `Ctrl + Shift + I` to open Developer Tools
3. Go to **Console** tab
4. Look for any MCP-related errors

### **Alternative: Direct Node Configuration**

If npx isn't working, try this configuration instead:

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": [
        "C:\\Users\\TOMAS\\AppData\\Roaming\\npm\\node_modules\\@modelcontextprotocol\\server-fetch\\dist\\index.js",
        "http://localhost:6174/mcp"
      ]
    }
  }
}
```

---

## 🧪 **Step 4: Test MCP Endpoint Directly**

Let's verify the MCP endpoint is responding correctly:

```powershell
# Test MCP endpoint
curl -X POST http://localhost:6174/mcp `
  -H "Content-Type: application/json" `
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0.0","capabilities":{}}}'
```

Expected response should include initialization confirmation.

---

## 💡 **Step 5: Windows Path Alternative**

Create a simple batch file at `C:\neural-mcp\mcp-connect.bat`:

```batch
@echo off
npx @modelcontextprotocol/server-fetch http://localhost:6174/mcp
```

Then use this Claude config:
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "cmd",
      "args": ["/c", "C:\\neural-mcp\\mcp-connect.bat"]
    }
  }
}
```

---

## 🚀 **Quick Actions:**

1. **Install globally:** `npm install -g @modelcontextprotocol/server-fetch`
2. **Update Claude config** with the standard configuration
3. **Completely exit Claude** (check system tray)
4. **Restart Claude Desktop**
5. **Check Developer Console** for errors

Since Docker is working perfectly at localhost:6174, the issue is likely with the npx command or path. Let me know what errors you see in Claude's developer console!