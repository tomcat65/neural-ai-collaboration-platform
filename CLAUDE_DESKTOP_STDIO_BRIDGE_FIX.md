# Claude Desktop - STDIO Bridge Solution

**Problem**: Claude Desktop connection drops with HTTP `mcp-remote` approach  
**Solution**: Use STDIO bridge (like Cursor) that maintains stable connection  
**Key Insight**: STDIO bridge handles MCP protocol properly with message ID mapping

---

## 🎯 **Working Solution for Claude Desktop**

I've created a Windows-compatible STDIO bridge: `claude-desktop-mcp-bridge.cjs`

**Key Differences from Cursor bridge:**
- ✅ Uses WSL2 IP address (`172.20.1.55`) instead of `localhost`
- ✅ Windows-accessible paths
- ✅ Enhanced logging for debugging
- ✅ Same stable MCP protocol handling

---

## 🚀 **Option 1: WSL Path Access (Recommended)**

### **Claude Desktop MCP Configuration:**
```json
"neural-ai-collaboration": {
  "command": "node",
  "args": [
    "\\\\wsl.localhost\\Ubuntu\\home\\tomcat65\\projects\\shared-memory-mcp\\claude-desktop-mcp-bridge.cjs"
  ]
}
```

**Alternative WSL path format:**
```json
"neural-ai-collaboration": {
  "command": "node", 
  "args": [
    "\\\\wsl$\\Ubuntu\\home\\tomcat65\\projects\\shared-memory-mcp\\claude-desktop-mcp-bridge.cjs"
  ]
}
```

---

## 🚀 **Option 2: Copy Bridge to Windows**

### **Step 1: Copy the bridge file to Windows**
```bash
# From WSL2, copy to Windows location
cp /home/tomcat65/projects/shared-memory-mcp/claude-desktop-mcp-bridge.cjs /mnt/c/Users/TOMAS/claude-desktop-mcp-bridge.cjs
```

### **Step 2: Claude Desktop MCP Configuration:**
```json
"neural-ai-collaboration": {
  "command": "node",
  "args": [
    "C:\\Users\\TOMAS\\claude-desktop-mcp-bridge.cjs"
  ]
}
```

---

## 🚀 **Option 3: Shared Project Folder**

If your project is in a shared location accessible from both Windows and WSL:

```json
"neural-ai-collaboration": {
  "command": "node",
  "args": [
    "C:\\Users\\TOMAS\\coding\\projects\\ai_coding\\claude-desktop-mcp-bridge.cjs"
  ]
}
```

---

## 📋 **Complete Working Configuration**

Here's your complete Claude Desktop MCP configuration with the STDIO bridge:

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
      "command": "node",
      "args": [
        "\\\\wsl.localhost\\Ubuntu\\home\\tomcat65\\projects\\shared-memory-mcp\\claude-desktop-mcp-bridge.cjs"
      ]
    }
  }
}
```

---

## 🔧 **How the STDIO Bridge Works**

### **Key Features:**
1. **Message ID Mapping**: Handles async responses correctly
2. **MCP Protocol**: Proper initialization and method handling  
3. **WSL2 Connectivity**: Uses IP `172.20.1.55:6174` for stable connection
4. **Error Handling**: Graceful error responses to Claude Desktop
5. **Logging**: Enhanced debugging information

### **Why This Works (vs HTTP approach):**
- **STDIO Protocol**: Native MCP communication method
- **Local Process**: Bridge runs on Windows, communicates with WSL2
- **Stable Connection**: No HTTP connection drops or timeouts
- **Proper Initialization**: Handles MCP handshake correctly

---

## 🧪 **Testing the Bridge**

### **Test WSL2 Connection:**
```bash
# From WSL2, verify server is running
curl http://172.20.1.55:6174/health
```

### **Test Bridge File Access:**
```cmd
# From Windows Command Prompt
node "\\wsl.localhost\Ubuntu\home\tomcat65\projects\shared-memory-mcp\claude-desktop-mcp-bridge.cjs"
# Should show: [Claude Desktop Bridge] Ready - connecting to 172.20.1.55:6174
```

### **Verify Claude Desktop:**
1. Apply new MCP configuration
2. Restart Claude Desktop  
3. Check for `neural-ai-collaboration` in available tools
4. Connection should be stable without drops

---

## 🎯 **Expected Results**

### **After applying this fix:**
✅ **Stable Connection**: No more connection drops  
✅ **All 27 Tools**: Complete neural-ai-collaboration toolkit  
✅ **Fast Response**: Sub-second tool execution  
✅ **Proper Initialization**: MCP protocol handled correctly  
✅ **Error Recovery**: Graceful handling of network issues  

### **Tool Categories Available:**
- **Memory & Knowledge** (5 tools): create_entities, search_entities, etc.
- **AI Communication** (4 tools): send_ai_message, get_ai_messages, etc.
- **Multi-Provider AI** (4 tools): execute_ai_request, stream_ai_response, etc.
- **Autonomous Operations** (4 tools): start_autonomous_mode, set_token_budget, etc.
- **Cross-Platform** (4 tools): translate_path, sync_platforms, etc.
- **Consensus & Coordination** (4 tools): coordinate_agents, resolve_conflicts, etc.
- **System Control** (2 tools): get_system_status, configure_system

---

## 🚨 **Troubleshooting**

### **If WSL path doesn't work:**
1. Try the alternative WSL path format (`\\wsl$\\`)
2. Copy bridge to Windows location (Option 2)
3. Check Windows WSL installation: `wsl --list`

### **If connection still fails:**
1. Check WSL2 IP: `wsl hostname -I`
2. Update bridge file if IP changed
3. Verify Neural AI platform is running: `curl http://172.20.1.55:6174/health`

### **If tools don't appear:**
1. Check Claude Desktop logs for bridge errors
2. Verify bridge file has correct permissions
3. Test bridge manually from command line

---

## ✅ **Action Plan**

1. **Choose Option**: WSL path (Option 1) or Copy to Windows (Option 2)
2. **Update Configuration**: Apply new neural-ai-collaboration config
3. **Restart Claude Desktop**: Close completely and reopen
4. **Test Connection**: Verify tools are available and stable
5. **Send Cursor Onboarding**: Once stable, I can message Claude Desktop

**This STDIO bridge approach should give you the same stable connection that Cursor enjoys!** 🚀

---

*Files created:*
- `claude-desktop-mcp-bridge.cjs` - Windows-compatible STDIO bridge
- `CLAUDE_DESKTOP_STDIO_BRIDGE_FIX.md` - Complete setup guide