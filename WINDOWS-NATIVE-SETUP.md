# 🪟 Windows Native Setup - Neural AI Collaboration MCP

## ✅ **Setup Complete!**

I've copied your project to `C:\neural-mcp` and created multiple setup options for Windows.

---

## 🚀 **Quick Start (Choose ONE Method)**

### **Method 1: PowerShell Script (Recommended)**

1. **Open PowerShell** and test:
   ```powershell
   cd C:\neural-mcp
   .\start-server.ps1
   ```

2. **If it works**, use this Claude Desktop config:
   - Copy content from `C:\neural-mcp\claude-desktop-config.json`
   - Paste into `%APPDATA%\Claude\claude_desktop_config.json`

### **Method 2: Batch File (Simpler)**

1. **Double-click** `C:\neural-mcp\start-server.bat`

2. **If it works**, use this Claude Desktop config:
   - Copy content from `C:\neural-mcp\claude-desktop-config-batch.json`
   - Paste into `%APPDATA%\Claude\claude_desktop_config.json`

### **Method 3: Direct Node.js (Simplest)**

1. **Open Command Prompt** and test:
   ```cmd
   cd C:\neural-mcp
   node dist\unified-neural-mcp-server.js
   ```

2. **If it works**, use this Claude Desktop config:
   - Copy content from `C:\neural-mcp\claude-desktop-config-simple.json`
   - Paste into `%APPDATA%\Claude\claude_desktop_config.json`

---

## 📁 **What's in C:\neural-mcp**

```
C:\neural-mcp\
├── dist\                    # Compiled JavaScript files
├── src\                     # Source TypeScript files
├── package.json            # Node.js dependencies
├── start-server.ps1        # PowerShell launcher
├── start-server.bat        # Batch file launcher
├── claude-desktop-config.json         # PowerShell config
├── claude-desktop-config-simple.json  # Direct Node config
└── claude-desktop-config-batch.json   # Batch file config
```

---

## 🔧 **Prerequisites**

### **Required: Node.js**
- Check if installed: `node --version`
- If not installed: Download from https://nodejs.org/ (v18 or later)

### **Optional: Git Bash**
- For better terminal experience on Windows
- Download from https://git-scm.com/

---

## 📝 **Step-by-Step Instructions**

### **1. Install Dependencies (First Time Only)**

Open **Command Prompt** or **PowerShell**:
```cmd
cd C:\neural-mcp
npm install
```

### **2. Test the Server**

**Option A - PowerShell:**
```powershell
.\start-server.ps1
```

**Option B - Batch File:**
```cmd
start-server.bat
```

**Option C - Direct:**
```cmd
node dist\unified-neural-mcp-server.js
```

### **3. Verify It's Working**

Open a **new** Command Prompt and test:
```cmd
curl http://localhost:6174/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "unified-neural-mcp-server"
}
```

### **4. Configure Claude Desktop**

1. **Close Claude Desktop completely**
2. **Open** `%APPDATA%\Claude\claude_desktop_config.json`
3. **Replace contents** with ONE of the provided configs
4. **Save** the file
5. **Restart Claude Desktop**

---

## 🎯 **Recommended Configuration**

For most users, I recommend the **PowerShell method**:

```json
{
  "mcpServers": {
    "neural-ai-collaboration": {
      "command": "powershell",
      "args": [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", "C:\\neural-mcp\\start-server.ps1"
      ]
    }
  }
}
```

**Why?**
- ✅ Handles environment setup automatically
- ✅ Shows helpful error messages
- ✅ Builds project if needed
- ✅ Runs hidden in background

---

## 🔍 **Troubleshooting**

### **"Scripts disabled" Error**
Run PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### **"Node not found" Error**
1. Install Node.js from https://nodejs.org/
2. Restart your computer
3. Try again

### **"Cannot find module" Error**
```cmd
cd C:\neural-mcp
npm install
npm run build
```

### **Port 6174 Already in Use**
Check what's using it:
```cmd
netstat -ano | findstr :6174
```

Kill the process or change the port in the scripts.

---

## 🧪 **Testing Commands**

**Health Check:**
```cmd
curl http://localhost:6174/health
```

**List Tools:**
```powershell
Invoke-WebRequest -Uri "http://localhost:6174/mcp" -Method POST -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## 🎉 **Success Checklist**

- [ ] Node.js installed (v18+)
- [ ] Server starts without errors
- [ ] Health check returns "healthy"
- [ ] Claude Desktop config updated
- [ ] Claude Desktop restarted
- [ ] Tools appear in Claude Desktop

---

## 💡 **Pro Tips**

1. **Run as a Windows Service** (Advanced):
   - Use `node-windows` package
   - Or Task Scheduler for auto-start

2. **Better Logging**:
   - Logs are saved to `C:\neural-mcp\logs\`
   - Check them if issues occur

3. **Performance**:
   - Native Windows execution is faster than WSL2
   - No Docker overhead

---

## 🆘 **Need Help?**

1. **Check server output** for error messages
2. **Verify Node.js version**: `node --version` (should be 18+)
3. **Try different config options** (PowerShell, Batch, or Direct)
4. **Check Windows Firewall** isn't blocking port 6174

**The native Windows setup is now ready! Choose your preferred method and get started.**