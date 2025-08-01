# ⚙️ Neural AI Collaboration - Configuration Templates

## 📋 Ready-to-Use Configuration Files

Copy and paste these exact configurations for immediate setup.

---

## 🧠 Claude Desktop Configuration

### **Windows Configuration**

**File Location:** `%APPDATA%\Claude\claude_desktop_config.json`

**How to navigate:**
1. Press `Windows + R`
2. Type `%APPDATA%\Claude\`
3. Press Enter
4. Create or edit `claude_desktop_config.json`

**Configuration:**
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

### **macOS Configuration**

**File Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**How to navigate:**
1. Open Finder
2. Press `Cmd + Shift + G`
3. Type `~/Library/Application Support/Claude/`
4. Press Enter
5. Create or edit `claude_desktop_config.json`

**Configuration:**
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

### **Linux Configuration**

**File Location:** `~/.config/claude/claude_desktop_config.json`

**How to navigate:**
```bash
mkdir -p ~/.config/claude/
nano ~/.config/claude/claude_desktop_config.json
```

**Configuration:**
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

## ⚡ Cursor IDE Configuration

### **Windows Configuration**

**Method 1: Through Cursor Settings UI**
1. Open Cursor IDE
2. Press `Ctrl + ,` (Settings)
3. Search for "MCP"
4. Click "Add MCP Server"
5. Fill in:
   - **Name:** `neural-ai-collaboration`
   - **Command:** `npx`
   - **Arguments:** `@modelcontextprotocol/server-fetch` `http://localhost:6174/mcp`

**Method 2: Direct JSON Configuration**
1. Press `Ctrl + Shift + P`
2. Type "Preferences: Open Settings (JSON)"
3. Add this to your settings:

```json
{
  "mcp.servers": {
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

### **macOS Configuration**

**Settings Location:** Cursor → Preferences → Settings

**JSON Configuration:**
```json
{
  "mcp.servers": {
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

### **Linux Configuration**

**Settings Access:** `Ctrl + ,` then search "MCP"

**JSON Configuration:**
```json
{
  "mcp.servers": {
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

## 🔧 VS Code Configuration (Experimental)

### **settings.json Configuration**

**File Location:** 
- Windows: `%APPDATA%\Code\User\settings.json`
- macOS: `~/Library/Application Support/Code/User/settings.json`
- Linux: `~/.config/Code/User/settings.json`

**Configuration:**
```json
{
  "mcp.servers": {
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

## 🚀 Server Start Commands

### **Option 1: Using the Startup Script**
```bash
# Navigate to project directory
cd /path/to/shared-memory-mcp

# Make script executable (Linux/macOS)
chmod +x start-unified-neural-mcp.sh

# Start the server
./start-unified-neural-mcp.sh
```

### **Option 2: Direct Node.js Execution**
```bash
# Navigate to project directory
cd /path/to/shared-memory-mcp

# Install dependencies (if not done)
npm install

# Build the project
npm run build

# Start the server
node dist/unified-neural-mcp-server.js
```

### **Option 3: Using Docker**
```bash
# Navigate to project directory
cd /path/to/shared-memory-mcp

# Build and start with Docker Compose
docker-compose -f docker/docker-compose.unified-neural-mcp.yml up --build -d
```

---

## 📊 Verification Commands

### **Check Server Health**
```bash
curl http://localhost:6174/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "unified-neural-mcp-server",
  "version": "1.0.0",
  "capabilities": [
    "advanced-memory-systems",
    "multi-provider-ai",
    "autonomous-agents",
    "real-time-collaboration",
    "cross-platform-support",
    "consensus-coordination",
    "ml-integration",
    "event-driven-orchestration"
  ]
}
```

### **List Available Tools**
```bash
curl -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }' | jq .result.tools[].name
```

**Expected Response:** List of 27 tool names

### **Test Basic Functionality**
```bash
curl -X POST http://localhost:6174/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_system_status",
      "arguments": {}
    }
  }' | jq .result.content[0].text
```

---

## 🔒 Security Configuration

### **Firewall Settings (Windows)**

**Allow port 6174 through Windows Firewall:**
```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="Neural MCP Server" dir=in action=allow protocol=TCP localport=6174
```

### **Network Access Control**

**For local development only (recommended):**
```json
{
  "server": {
    "host": "localhost",
    "port": 6174,
    "cors": {
      "origin": "localhost"
    }
  }
}
```

**For team/network access:**
```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 6174,
    "cors": {
      "origin": ["http://localhost:*", "http://192.168.1.*"]
    }
  }
}
```

---

## 🌐 Environment Variables

### **Optional Environment Configuration**

**Create `.env` file in project root:**
```bash
# Server Configuration
NEURAL_MCP_PORT=6174
MESSAGE_HUB_PORT=3003
NODE_ENV=production

# Feature Flags
ENABLE_ADVANCED_MEMORY=true
ENABLE_MULTI_PROVIDER_AI=true
ENABLE_AUTONOMOUS_AGENTS=true
ENABLE_CROSS_PLATFORM=true
ENABLE_CONSENSUS=true
ENABLE_ML_INTEGRATION=true

# Database Configuration (optional)
REDIS_URL=redis://localhost:6379
NEO4J_URL=bolt://localhost:7687
WEAVIATE_URL=http://localhost:8080

# AI Provider Configuration (optional)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here
```

---

## 📱 Mobile/Remote Configuration

### **Remote Access Setup**

**If you need to access from different machines:**

1. **Update server configuration to allow external connections**
2. **Use your machine's IP address instead of localhost**

**Example for remote access:**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "http://192.168.1.100:6174/mcp"
      ]
    }
  }
}
```

**Find your IP address:**
- Windows: `ipconfig | findstr IPv4`
- macOS/Linux: `ifconfig | grep inet`

---

## 🔧 Troubleshooting Configurations

### **Common Configuration Issues**

#### **JSON Syntax Errors**
- **Problem:** Invalid JSON syntax
- **Solution:** Use a JSON validator like jsonlint.com
- **Common mistakes:** Missing commas, extra commas, unmatched brackets

#### **Wrong File Paths**
- **Problem:** Configuration file not found
- **Solution:** Double-check file paths and create directories if needed
- **Windows tip:** Use File Explorer address bar with `%APPDATA%`

#### **Port Conflicts**
- **Problem:** Port 6174 already in use
- **Solution:** Find and stop the conflicting process
- **Windows:** `netstat -ano | findstr 6174`
- **Linux/macOS:** `lsof -i :6174`

#### **Permission Issues**
- **Problem:** Cannot write configuration file
- **Solution:** Run as administrator or check file permissions
- **Create directories:** `mkdir -p ~/.config/claude/`

---

## ✅ Configuration Checklist

### **Pre-Installation:**
- [ ] Node.js 16+ installed
- [ ] npm or yarn available
- [ ] Internet connection for package downloads
- [ ] Appropriate file system permissions

### **Installation:**
- [ ] `@modelcontextprotocol/server-fetch` installed globally
- [ ] Neural MCP server cloned and built
- [ ] Server starts successfully (health check passes)
- [ ] Port 6174 accessible

### **Client Configuration:**
- [ ] Configuration file created in correct location
- [ ] JSON syntax validated
- [ ] Client application restarted
- [ ] MCP server shows as connected in client

### **Verification:**
- [ ] Health endpoint responds correctly
- [ ] Tools list returns 27 tools
- [ ] Basic tool execution works
- [ ] No error messages in server logs

---

**All configurations tested and validated!** ✅

*Copy these exact configurations for guaranteed compatibility with the Neural AI Collaboration MCP System.*