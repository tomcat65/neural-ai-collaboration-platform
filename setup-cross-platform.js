#!/usr/bin/env node

/**
 * Cross-Platform Setup Script
 * Configures Windows/WSL hybrid environment for Neural AI Collaboration Platform
 */

import { WindowsWSLBridge } from './src/cross-platform/windows-wsl-bridge.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CrossPlatformSetup {
  constructor() {
    this.bridge = new WindowsWSLBridge({
      wslDistribution: 'Ubuntu',
      windowsWorkspaceRoot: 'C:\\Users\\%USERNAME%\\Projects',
      wslWorkspaceRoot: '/home/tomcat65/projects',
      serverPort: 3001,
      windowsServerHost: 'localhost'
    });
  }

  async run() {
    console.log('🌉 Neural AI Collaboration Platform - Cross-Platform Setup');
    console.log('='.repeat(70));

    try {
      // Initialize the bridge
      await this.bridge.initialize();

      // Test connectivity
      console.log('\n🧪 Testing Cross-Platform Connectivity...');
      const connectivityOk = await this.bridge.testCrossPlatformConnectivity();
      
      if (connectivityOk) {
        console.log('✅ Cross-platform connectivity test passed');
      } else {
        console.log('⚠️ Some connectivity tests failed - check configuration');
      }

      // Generate MCP configurations
      console.log('\n⚙️ Generating MCP Configurations...');
      await this.generateMCPConfigurations();

      // Create deployment scripts
      console.log('\n📜 Creating Deployment Scripts...');
      await this.createDeploymentScripts();

      // Show platform-specific instructions
      console.log('\n📋 Platform-Specific Instructions:');
      const instructions = this.bridge.getPlatformInstructions();
      instructions.forEach(instruction => console.log(instruction));

      console.log('\n✅ Cross-platform setup completed successfully!');
      console.log('\n🎯 Next Steps:');
      console.log('1. Run ./start-wsl-server.sh in WSL to start the MCP server');
      console.log('2. Configure Claude Desktop with the generated claude-desktop-config.json');
      console.log('3. Configure Cursor with the generated cursor-config.json');
      console.log('4. Test the connection using ./test-cross-platform.sh');

    } catch (error) {
      console.error('❌ Cross-platform setup failed:', error);
      process.exit(1);
    }
  }

  /**
   * Generate MCP configurations for different clients
   */
  async generateMCPConfigurations() {
    const configs = this.bridge.generateMCPConfigs();

    // Claude Desktop configuration
    const claudeDesktopConfig = {
      "mcpServers": {
        "neural-ai-collaboration": {
          "command": "node",
          "args": ["mcp-http-server.js"],
          "env": {
            "SERVER_URL": "http://localhost:3001",
            "CROSS_PLATFORM": "true",
            "CLIENT_TYPE": "claude-desktop"
          }
        }
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'claude-desktop-config.json'),
      JSON.stringify(claudeDesktopConfig, null, 2)
    );
    console.log('📄 Generated: claude-desktop-config.json');

    // Cursor configuration
    const cursorConfig = {
      "mcpServers": {
        "neural-ai-collaboration": {
          "command": "node",
          "args": ["mcp-http-server.js"],
          "env": {
            "SERVER_URL": "http://localhost:3001",
            "CROSS_PLATFORM": "true",
            "CLIENT_TYPE": "cursor"
          }
        }
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'cursor-config.json'),
      JSON.stringify(cursorConfig, null, 2)
    );
    console.log('📄 Generated: cursor-config.json');

    // Claude CLI configuration (for WSL)
    const claudeCLIConfig = {
      "mcpServers": {
        "neural-ai-collaboration": {
          "command": "node",
          "args": ["mcp-http-server.js"],
          "env": {
            "PORT": "3001",
            "HOST": "0.0.0.0",
            "CROSS_PLATFORM": "true",
            "CLIENT_TYPE": "claude-cli"
          }
        }
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'claude-cli-config.json'),
      JSON.stringify(claudeCLIConfig, null, 2)
    );
    console.log('📄 Generated: claude-cli-config.json');
  }

  /**
   * Create deployment scripts
   */
  async createDeploymentScripts() {
    // WSL server startup script
    const wslStartScript = `#!/bin/bash
# Start Neural AI MCP Server in WSL

echo "🐧 Starting Neural AI MCP Server in WSL..."

# Set environment variables
export NODE_ENV=production
export PORT=3001
export HOST=0.0.0.0
export CROSS_PLATFORM=true
export WSL_MODE=true

# Navigate to project directory
cd "/home/tomcat65/projects/shared-memory-mcp"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the server
echo "🚀 Starting MCP server on port 3001..."
node mcp-http-server.js

echo "✅ MCP server started successfully"
echo "🔗 Windows clients can connect to: http://localhost:3001"
`;

    await fs.writeFile(
      path.join(__dirname, 'start-wsl-server.sh'),
      wslStartScript
    );
    console.log('📜 Generated: start-wsl-server.sh');

    // Cross-platform test script
    const testScript = `#!/bin/bash
# Test Cross-Platform Connectivity

echo "🧪 Testing Neural AI Cross-Platform Connectivity..."

# Test WSL server
echo "🐧 Testing WSL server..."
curl -f http://localhost:3001/health || echo "❌ WSL server not accessible"

# Test file system access
echo "📁 Testing file system access..."
if [ -d "/home/tomcat65/projects/shared-memory-mcp" ]; then
    echo "✅ WSL project directory accessible"
else
    echo "❌ WSL project directory not found"
fi

# Test network connectivity from Windows
echo "🪟 Testing Windows network connectivity..."
# This would be run from Windows Command Prompt:
echo "Run from Windows CMD: curl http://localhost:3001/health"

echo "🎯 Cross-platform test completed"
`;

    await fs.writeFile(
      path.join(__dirname, 'test-cross-platform.sh'),
      testScript
    );
    console.log('📜 Generated: test-cross-platform.sh');

    // Make scripts executable
    try {
      await fs.chmod(path.join(__dirname, 'start-wsl-server.sh'), 0o755);
      await fs.chmod(path.join(__dirname, 'test-cross-platform.sh'), 0o755);
    } catch (error) {
      console.warn('⚠️ Could not set execute permissions on scripts');
    }

    // Windows batch file for easy testing
    const windowsTestBatch = `@echo off
REM Test Neural AI Cross-Platform Connectivity from Windows

echo 🧪 Testing Neural AI Cross-Platform Connectivity from Windows...

echo 🔗 Testing connection to WSL server...
curl -f http://localhost:3001/health
if %errorlevel% equ 0 (
    echo ✅ Successfully connected to WSL server
) else (
    echo ❌ Could not connect to WSL server
    echo Make sure the WSL server is running: ./start-wsl-server.sh
)

echo 🎯 Windows connectivity test completed
pause
`;

    await fs.writeFile(
      path.join(__dirname, 'test-windows-connectivity.bat'),
      windowsTestBatch
    );
    console.log('📜 Generated: test-windows-connectivity.bat');
  }

  /**
   * Create Windows-specific configuration guide
   */
  async createWindowsConfigurationGuide() {
    const guide = `# Windows Configuration Guide for Neural AI Collaboration Platform

## Overview
This guide helps you configure the Neural AI Collaboration Platform in a Windows/WSL hybrid environment.

## Architecture
- **WSL (Ubuntu)**: Runs Claude CLI and the main MCP server
- **Windows**: Runs Claude Desktop and Cursor
- **Communication**: HTTP-based MCP protocol over localhost

## Setup Steps

### 1. WSL Configuration
1. Start WSL and navigate to the project directory:
   \`\`\`bash
   cd /home/tomcat65/projects/shared-memory-mcp
   \`\`\`

2. Start the MCP server:
   \`\`\`bash
   ./start-wsl-server.sh
   \`\`\`

3. Verify the server is running:
   \`\`\`bash
   curl http://localhost:3001/health
   \`\`\`

### 2. Claude Desktop Configuration (Windows)
1. Open Claude Desktop settings
2. Navigate to MCP servers configuration
3. Add the configuration from \`claude-desktop-config.json\`:
   \`\`\`json
   {
     "mcpServers": {
       "neural-ai-collaboration": {
         "command": "node",
         "args": ["mcp-http-server.js"],
         "env": {
           "SERVER_URL": "http://localhost:3001",
           "CROSS_PLATFORM": "true",
           "CLIENT_TYPE": "claude-desktop"
         }
       }
     }
   }
   \`\`\`

### 3. Cursor Configuration (Windows)
1. Open Cursor settings
2. Navigate to MCP configuration
3. Add the configuration from \`cursor-config.json\`

### 4. Testing
1. From WSL: \`./test-cross-platform.sh\`
2. From Windows: Run \`test-windows-connectivity.bat\`

## Troubleshooting

### Connection Issues
- Ensure WSL server is running on port 3001
- Check Windows Firewall settings
- Verify localhost resolution

### File Path Issues
- Use Windows paths in Windows applications
- Use WSL paths in WSL environment
- The bridge handles automatic path translation

### Performance Issues
- Monitor network latency between WSL and Windows
- Consider using local caching for frequently accessed data

## Support
If you encounter issues, check the logs in:
- WSL: \`/home/tomcat65/projects/shared-memory-mcp/data/logs/\`
- Windows: Check application-specific log locations
`;

    await fs.writeFile(
      path.join(__dirname, 'WINDOWS_SETUP.md'),
      guide
    );
    console.log('📚 Generated: WINDOWS_SETUP.md');
  }
}

// Main execution
async function main() {
  const setup = new CrossPlatformSetup();
  await setup.run();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
}

export { CrossPlatformSetup };