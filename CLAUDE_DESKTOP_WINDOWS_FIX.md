# Claude Desktop Windows - WSL2 Connectivity Fix

**Issue**: Claude Desktop on Windows can't maintain stable connection to Neural AI Collaboration Platform running in WSL2

**Root Cause**: Windows `localhost:6174` doesn't properly route to WSL2 container

**Solution**: Use WSL2 IP address directly in MCP configuration

---

## 🔧 **Immediate Fix for Claude Desktop**

### **Current WSL2 IP Address**: `172.20.1.55`

Replace this section in your Claude Desktop MCP configuration:

**❌ Current (Not Working):**
```json
"neural-ai-collaboration": {
  "command": "npx",
  "args": [
    "mcp-remote",
    "http://localhost:6174/mcp"
  ]
}
```

**✅ Fixed (Working):**
```json
"neural-ai-collaboration": {
  "command": "npx",
  "args": [
    "mcp-remote",
    "http://172.20.1.55:6174/mcp"
  ]
}
```

---

## 📋 **Complete Fixed Configuration**

Here's your complete working MCP configuration for Claude Desktop:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander"]
    },
    "memory": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "/home/tomcat65/mcp-memory/chroma_db:/app/chroma_db",
        "-v",
        "/home/tomcat65/mcp-memory/backups:/app/backups",
        "-e",
        "MCP_MEMORY_CHROMA_PATH=/app/chroma_db",
        "-e",
        "MCP_MEMORY_BACKUPS_PATH=/app/backups",
        "mcp/memory"
      ]
    },
    "playwright": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "mcp/playwright"
      ],
      "env": {}
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "BSAYjkkpdoIhizVEWCaLVree6p60nQ-"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/TOMAS/coding/projects",
        "/Users/TOMAS/coding/projects/ai_coding/",
        "/Users/TOMAS/coding/projects/ai_coding/mcp-servers",
        "/Users/TOMAS/coding/projects/ai_coding/mcp-servers/servers",
        "/Users/TOMAS/coding/projects/ai_coding/mcp-servers/firebase-mcp",
        "C:/Users/TOMAS/coding/projects/ai_coding/mcp-servers/flux-image-mcp",
        "/Users/TOMAS/Downloads",
        "/Users/TOMAS/AppData/Roaming/Claude",
        "/Users/TOMAS/coding/projects/resumes",
        "/Users/TOMAS/coding/projects/ai_coding/my_resume",
        "/Users/TOMAS/coding/projects/ai_coding/my_resume/project"
      ]
    },
    "fetch": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "mcp/fetch"
      ]
    },
    "flux-image": {
      "command": "node",
      "args": ["C:\\Users\\TOMAS\\coding\\projects\\ai_coding\\mcp-servers\\flux-image-mcp\\dist\\index.js"]
    },
    "notion-desktop": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "OPENAPI_MCP_HEADERS",
        "mcp/notion"
      ],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer YOUR_NOTION_API_TOKEN_HERE\", \"Notion-Version\": \"2022-06-28\"}"
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

---

## 🚀 **Testing the Fix**

### **1. Test from Windows PowerShell**
```powershell
# This should work now:
curl http://172.20.1.55:6174/health

# Expected response:
# {"status":"healthy","service":"unified-neural-mcp-server",...}
```

### **2. Restart Claude Desktop**
- Close Claude Desktop completely
- Apply the new MCP configuration  
- Restart Claude Desktop
- Connection should now be stable

### **3. Verify Connection**
In Claude Desktop, you should now see:
- ✅ neural-ai-collaboration MCP server connected
- ✅ All 27 tools available
- ✅ Stable connection without drops

---

## 🔄 **Alternative Solutions (If IP Changes)**

### **Option 1: Windows Port Forwarding**
```powershell
# Run as Administrator in PowerShell
netsh interface portproxy add v4tov4 listenport=6174 listenaddress=0.0.0.0 connectport=6174 connectaddress=172.20.1.55

# Then use localhost:6174 in Claude Desktop
```

### **Option 2: Dynamic IP Script**
Create a batch script to get current WSL2 IP:
```batch
@echo off
for /f %%i in ('wsl hostname -I') do set WSLIP=%%i
echo WSL2 IP: %WSLIP%
echo Use: http://%WSLIP%:6174/mcp
```

### **Option 3: WSL2 DNS Resolution**
Add to Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`):
```
172.20.1.55    wsl.local
```
Then use `http://wsl.local:6174/mcp`

---

## 🏆 **Why This Works**

### **Problem Explanation**
- **Windows localhost**: Routes to Windows network stack
- **WSL2 localhost**: Different network namespace  
- **Container localhost**: Inside Docker network
- **Result**: Windows can't reach WSL2 containers via localhost

### **Solution Explanation**
- **WSL2 IP**: `172.20.1.55` is accessible from Windows
- **Port Binding**: Container bound to `0.0.0.0:6174` (all interfaces)
- **Direct Access**: Windows → WSL2 IP → Container
- **Result**: Stable connection without network translation

---

## ✅ **Expected Results After Fix**

### **Claude Desktop Connection**
✅ **Stable Connection**: No more drops or timeouts  
✅ **Tool Availability**: All 27 neural-ai-collaboration tools  
✅ **Performance**: Sub-second response times  
✅ **Reliability**: Maintains connection during long sessions  

### **Neural AI Platform Access**
✅ **Agent Registration**: Claude Desktop can register as agent  
✅ **Message Communication**: Send/receive messages with team  
✅ **Knowledge Access**: Search and store in multi-database system  
✅ **Autonomous Mode**: Configure smart triggers and responses  

---

## 🎯 **Action Items**

1. **Update Claude Desktop MCP config** with `http://172.20.1.55:6174/mcp`
2. **Restart Claude Desktop** to apply new configuration
3. **Test connection** with health endpoint
4. **Verify tools** are available in Claude Desktop interface

**This should resolve the connection stability issues completely!** 🚀

---

*Note: If WSL2 IP changes after restart, check current IP with `wsl hostname -I` and update the configuration accordingly.*