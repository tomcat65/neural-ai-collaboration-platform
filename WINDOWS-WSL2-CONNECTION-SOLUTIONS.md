# 🔧 Windows WSL2 Connection Solutions for Claude Desktop

## 🎯 **Problem Identified**
Claude Desktop runs on **Windows**, but the Docker container runs in **WSL2 (Linux)**. The `localhost:6174` from Windows doesn't directly reach WSL2 containers.

---

## ✅ **SOLUTION 1: Fixed Docker Binding (RECOMMENDED)**

I've updated the Docker container to bind to all network interfaces, making it accessible from Windows.

**Container Status:**
```bash
# Check if running with Windows access
docker ps | grep neural-mcp-unified
```

**Claude Desktop Configuration** (should work now):
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

## ✅ **SOLUTION 2: PowerShell with Node.js (YOUR SUGGESTION)**

Great idea! We can run the MCP server directly in Windows using PowerShell/Node.js instead of Docker.

### **Step 1: Copy Files to Windows**

From WSL2, copy the built project to Windows:
```bash
# In WSL2
cp -r /home/tomcat65/projects/shared-memory-mcp /mnt/c/neural-mcp/
```

### **Step 2: Windows PowerShell Setup**

Open **PowerShell as Administrator** and run:
```powershell
# Navigate to the project
cd C:\neural-mcp

# Install dependencies (if not done)
npm install

# Build TypeScript (if not done)
npm run build

# Start the server directly on Windows
node dist/unified-neural-mcp-server.js
```

### **Step 3: Claude Desktop Configuration**

With the server running natively on Windows:
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

**OR using PowerShell explicitly:**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "powershell",
      "args": ["-Command", "cd C:\\neural-mcp; node dist/unified-neural-mcp-server.js"]
    }
  }
}
```

---

## ✅ **SOLUTION 3: WSL2 IP Address**

Use the WSL2 IP address directly:

**Current WSL2 IP:** `172.20.1.55`

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

**Note:** WSL2 IP can change on reboot.

---

## 🧪 **Let's Test Solution 1 First**

```bash
# Test from Windows Command Prompt or PowerShell
curl http://localhost:6174/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "unified-neural-mcp-server"
}
```

If this works, then your original Claude Desktop config should work now!

---

## 🔍 **Troubleshooting Windows Firewall**

If still having issues, Windows Firewall might be blocking the connection:

### **Allow Port Through Windows Firewall:**

**Option A: PowerShell (Run as Administrator)**
```powershell
New-NetFirewallRule -DisplayName "Neural MCP Server" -Direction Inbound -Protocol TCP -LocalPort 6174 -Action Allow
```

**Option B: GUI Method**
1. Windows Security → Firewall & network protection
2. Advanced settings → Inbound Rules → New Rule
3. Port → TCP → Specific Local Ports → 6174
4. Allow the connection → Apply to all profiles → Name: "Neural MCP Server"

---

## 🎯 **Recommended Testing Order**

### **1. Test Current Docker Solution**
```powershell
# From Windows PowerShell or Command Prompt
curl http://localhost:6174/health
```

### **2. If that works, restart Claude Desktop**
Your existing config should work now.

### **3. If still fails, try PowerShell solution**
Copy files to Windows and run natively.

### **4. As last resort, use WSL2 IP**
Update config to use `http://172.20.1.55:6174/mcp`

---

## 💡 **Why Your PowerShell Idea is Excellent**

Running natively on Windows eliminates:
- ❌ WSL2 networking complexities
- ❌ Docker port binding issues
- ❌ Firewall complications
- ❌ IP address changes

Benefits:
- ✅ Direct Windows process
- ✅ No network translation needed
- ✅ Simpler troubleshooting
- ✅ Better performance

---

## 🚀 **Quick Test Commands**

**Test Docker solution:**
```bash
# From WSL2
curl http://localhost:6174/health

# From Windows (Command Prompt)
curl http://localhost:6174/health
```

**Test PowerShell solution:**
```powershell
# From Windows PowerShell
cd C:\neural-mcp
node dist/unified-neural-mcp-server.js
```

**Which solution would you prefer to try first?**

1. **Fixed Docker binding** (easiest - should work now)
2. **Native PowerShell** (most reliable - your suggestion)
3. **WSL2 IP address** (backup option)