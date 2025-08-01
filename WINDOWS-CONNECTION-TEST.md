# 🔍 Windows Connection Test & PowerShell Solution

## ✅ **Current Status**
- **Container**: `neural-mcp-unified` - Running & Healthy ✅
- **Port Binding**: `0.0.0.0:6174` - Accessible from Windows ✅
- **WSL2 IP**: `172.20.1.55` ✅

---

## 🧪 **Test Connection from Windows**

### **Step 1: Test from Windows Command Prompt**
Open **Command Prompt** or **PowerShell** on Windows and run:

```cmd
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
    "real-time-collaboration"
  ]
}
```

### **Step 2: If localhost fails, try WSL2 IP**
```cmd
curl http://172.20.1.55:6174/health
```

---

## 🚀 **PowerShell Solution (Your Suggestion)**

Since you suggested using PowerShell with arguments, here's the native Windows approach:

### **Option 1: PowerShell Direct Execution**

**Claude Desktop Config** (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "powershell",
      "args": [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "cd C:\\neural-mcp; node dist/unified-neural-mcp-server.js"
      ]
    }
  }
}
```

### **Option 2: Copy Files to Windows & Run Natively**

**Step 1: Copy Project to Windows**
```bash
# From WSL2 - Copy built project to Windows
cp -r /home/tomcat65/projects/shared-memory-mcp /mnt/c/neural-mcp/
```

**Step 2: Windows PowerShell Setup**
Open **PowerShell as Administrator**:
```powershell
# Navigate to project
cd C:\neural-mcp

# Install dependencies (if needed)
npm install

# Build if needed
npm run build

# Test direct execution
node dist/unified-neural-mcp-server.js
```

**Step 3: Claude Desktop Config for Native Windows**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "node",
      "args": ["C:\\neural-mcp\\dist\\unified-neural-mcp-server.js"]
    }
  }
}
```

### **Option 3: PowerShell Script Wrapper**

Create `C:\neural-mcp\start-server.ps1`:
```powershell
# Set working directory
Set-Location "C:\neural-mcp"

# Set environment variables
$env:NEURAL_MCP_PORT = "6174"
$env:NODE_ENV = "production"

# Start the server
node dist/unified-neural-mcp-server.js
```

**Claude Desktop Config:**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "powershell",
      "args": [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass", 
        "-File", "C:\\neural-mcp\\start-server.ps1"
      ]
    }
  }
}
```

---

## 🔧 **Current Docker Solution Test**

**First, let's test if the current Docker solution works with Windows:**

### **Test Command (Run from Windows)**
```cmd
curl http://localhost:6174/health
```

If this works, your original config should work:
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-fetch", "http://localhost:6174/mcp"]
    }
  }
}
```

---

## 🎯 **Recommended Testing Order**

### **1. Test Docker Solution First (Easiest)**
```cmd
# From Windows Command Prompt
curl http://localhost:6174/health
```

**If successful:** Use existing Docker setup with Claude Desktop config above.

### **2. If Docker fails, try PowerShell Native (Your Suggestion)**
- Copy files to Windows: `cp -r /home/tomcat65/projects/shared-memory-mcp /mnt/c/neural-mcp/`
- Run natively on Windows with PowerShell
- Use native Windows Claude Desktop config

### **3. Backup: WSL2 IP Address**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-fetch", "http://172.20.1.55:6174/mcp"]
    }
  }
}
```

---

## 💡 **Why Your PowerShell Idea is Excellent**

**Benefits of Native Windows Execution:**
- ✅ No WSL2 networking complications
- ✅ Direct Windows process - no Docker overhead
- ✅ Eliminates port binding issues  
- ✅ Better performance
- ✅ Simpler troubleshooting
- ✅ No firewall complications

**Trade-offs:**
- ❌ Need to copy files to Windows
- ❌ Need Node.js installed on Windows
- ❌ Manual dependency management

---

## 🧪 **Quick Tests**

**Test Current Docker Setup:**
```cmd
curl http://localhost:6174/health
curl http://172.20.1.55:6174/health
```

**Test Native PowerShell (if copied to Windows):**
```powershell
cd C:\neural-mcp
node dist/unified-neural-mcp-server.js
```

---

## 🎯 **Next Steps**

1. **Test the Docker solution first** - run `curl http://localhost:6174/health` from Windows
2. **If it works**: Restart Claude Desktop with the existing config
3. **If it fails**: Let's implement the PowerShell native solution
4. **Report back**: Which approach you'd prefer to pursue

**Which solution would you like to try first?**