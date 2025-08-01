# 🐳 Docker to Windows Connection Setup

## ✅ **Docker Status: RUNNING**
Container `neural-mcp-unified` is healthy with ports exposed to `0.0.0.0:6174`

---

## 🔧 **Step 1: Test Docker Accessibility**

From **Windows PowerShell**, test these:

```powershell
# Test localhost
curl http://localhost:6174/health

# Test Docker Desktop's internal IP
curl http://host.docker.internal:6174/health

# Test WSL2 IP
curl http://172.20.1.55:6174/health
```

---

## 🎯 **Step 2: Claude Desktop Configuration Options**

### **Option A: Using localhost (if curl works)**
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

### **Option B: Using host.docker.internal**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "http://host.docker.internal:6174/mcp"
      ]
    }
  }
}
```

### **Option C: Using WSL2 IP directly**
```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "http://172.20.1.55:6174/mcp"
      ]
    }
  }
}
```

---

## 🐋 **Step 3: Docker Desktop Settings**

### **Ensure these are enabled in Docker Desktop:**

1. **Open Docker Desktop** → Settings
2. **General** tab:
   - ✅ "Expose daemon on tcp://localhost:2375 without TLS"
   - ✅ "Use the WSL 2 based engine"
3. **Resources** → **WSL Integration**:
   - ✅ Enable integration with your default WSL2 distro
4. **Apply & Restart**

---

## 🔌 **Step 4: Windows Firewall**

If still not working, allow the port through Windows Firewall:

**PowerShell (Run as Administrator):**
```powershell
New-NetFirewallRule -DisplayName "Docker MCP Port 6174" -Direction Inbound -Protocol TCP -LocalPort 6174 -Action Allow
```

---

## 🧪 **Step 5: Advanced Troubleshooting**

### **Check Docker port mapping:**
```bash
# From WSL2
docker port neural-mcp-unified
```

### **Restart container with explicit Windows binding:**
```bash
# Stop current container
docker stop neural-mcp-unified

# Start with explicit binding
docker run -d \
  --name neural-mcp-unified \
  -p 0.0.0.0:6174:6174 \
  -p 0.0.0.0:3003:3003 \
  --network docker_default \
  --network docker_neural-network \
  -e NEURAL_MCP_PORT=6174 \
  -e NODE_ENV=production \
  shared-memory-mcp-neural-mcp-unified
```

---

## 💡 **Quick Fix: Use WSL2 IP**

Since we know the WSL2 IP (172.20.1.55), try this config immediately:

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "http://172.20.1.55:6174/mcp"
      ]
    }
  }
}
```

**Note:** WSL2 IP changes on reboot, but this will work for now.

---

## 🎯 **Recommended Order:**

1. **First test** from Windows: `curl http://localhost:6174/health`
2. **If that fails**, try: `curl http://host.docker.internal:6174/health`
3. **If both fail**, use WSL2 IP: `curl http://172.20.1.55:6174/health`
4. **Update Claude config** with whichever URL works
5. **Restart Claude Desktop**

Which curl command works from Windows PowerShell?