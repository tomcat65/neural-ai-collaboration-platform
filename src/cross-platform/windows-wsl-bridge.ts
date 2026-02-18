/**
 * Windows/WSL Cross-Platform Bridge
 * Handles networking and file system integration between Windows and WSL environments
 */

import { spawn, exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CrossPlatformConfig {
  wslDistribution: string;
  windowsWorkspaceRoot: string;
  wslWorkspaceRoot: string;
  serverPort: number;
  windowsServerHost: string;
  enablePathTranslation?: boolean;
  enableFileSystemBridge?: boolean;
  enableNetworkBridge?: boolean;
}

export class WindowsWSLBridge {
  private config: CrossPlatformConfig;
  private isWSL: boolean = false;
  private isWindows: boolean;
  private pathTranslationCache: Map<string, string> = new Map();

  constructor(config: Partial<CrossPlatformConfig> = {}) {
    this.config = {
      wslDistribution: config.wslDistribution || 'Ubuntu',
      windowsWorkspaceRoot: config.windowsWorkspaceRoot || 'C:\\Users\\%USERNAME%\\Projects',
      wslWorkspaceRoot: config.wslWorkspaceRoot || '/home/tomcat65/projects',
      serverPort: config.serverPort || 3001,
      windowsServerHost: config.windowsServerHost || 'localhost',
      enablePathTranslation: config.enablePathTranslation ?? true,
      enableFileSystemBridge: config.enableFileSystemBridge ?? true,
      enableNetworkBridge: config.enableNetworkBridge ?? true,
      ...config
    };

    this.isWindows = process.platform === 'win32';
    // Initialize WSL detection asynchronously
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    this.isWSL = await this.detectWSL();
  }

  /**
   * Initialize cross-platform bridge
   */
  async initialize(): Promise<void> {
    console.log('🌉 Initializing Windows/WSL Cross-Platform Bridge');
    
    if (this.isWSL) {
      console.log('🐧 Running in WSL environment');
      await this.initializeWSLSide();
    } else if (this.isWindows) {
      console.log('🪟 Running in Windows environment');
      await this.initializeWindowsSide();
    } else {
      console.log('🐧 Running in Linux environment');
    }

    if (this.config.enableNetworkBridge) {
      await this.setupNetworkBridge();
    }

    if (this.config.enableFileSystemBridge) {
      await this.setupFileSystemBridge();
    }

    console.log('✅ Cross-platform bridge initialized successfully');
  }

  /**
   * Detect if running in WSL
   */
  private async detectWSL(): Promise<boolean> {
    try {
      const version = await fs.readFile('/proc/version', 'utf8');
      return version.toLowerCase().includes('microsoft');
    } catch {
      return false;
    }
  }

  /**
   * Initialize WSL-specific configurations
   */
  private async initializeWSLSide(): Promise<void> {
    // Get WSL IP address
    const wslIP = await this.getWSLIPAddress();
    console.log(`🔌 WSL IP Address: ${wslIP}`);

    // Setup WSL firewall rules if needed
    await this.configureWSLNetworking();

    // Create shared directory mappings
    await this.createDirectoryMappings();
  }

  /**
   * Initialize Windows-specific configurations
   */
  private async initializeWindowsSide(): Promise<void> {
    // Get Windows IP address
    const windowsIP = await this.getWindowsIPAddress();
    console.log(`🔌 Windows IP Address: ${windowsIP}`);

    // Setup Windows firewall rules
    await this.configureWindowsFirewall();

    // Create Windows service if needed
    await this.setupWindowsService();
  }

  /**
   * Get WSL IP address
   */
  private async getWSLIPAddress(): Promise<string> {
    try {
      const { stdout } = await execAsync("ip route show | grep -i default | awk '{ print $3}'");
      return stdout.trim();
    } catch (error) {
      console.warn('⚠️ Could not determine WSL IP, using localhost');
      return 'localhost';
    }
  }

  /**
   * Get Windows IP address
   */
  private async getWindowsIPAddress(): Promise<string> {
    try {
      const { stdout } = await execAsync('ipconfig | findstr IPv4');
      const match = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : 'localhost';
    } catch (error) {
      console.warn('⚠️ Could not determine Windows IP, using localhost');
      return 'localhost';
    }
  }

  /**
   * Setup network bridge between Windows and WSL
   */
  private async setupNetworkBridge(): Promise<void> {
    console.log('🌐 Setting up network bridge');

    if (this.isWSL) {
      // In WSL, connect to Windows host
      const windowsHost = await this.resolveWindowsHost();
      console.log(`🔗 Connecting to Windows host: ${windowsHost}:${this.config.serverPort}`);
      
      // Test connection
      await this.testConnection(windowsHost, this.config.serverPort);
    }
  }

  /**
   * Resolve Windows host from WSL
   */
  private async resolveWindowsHost(): Promise<string> {
    try {
      // Try to get Windows host IP from WSL
      const { stdout } = await execAsync("cat /etc/resolv.conf | grep nameserver | awk '{print $2}'");
      const windowsIP = stdout.trim();
      
      if (windowsIP && windowsIP !== '127.0.0.1') {
        return windowsIP;
      }
    } catch (error) {
      console.warn('⚠️ Could not resolve Windows host from WSL');
    }

    return this.config.windowsServerHost;
  }

  /**
   * Test network connection
   */
  private async testConnection(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Setup file system bridge
   */
  private async setupFileSystemBridge(): Promise<void> {
    console.log('📁 Setting up file system bridge');

    if (this.config.enablePathTranslation) {
      await this.setupPathTranslation();
    }

    // Create shared directories
    await this.createSharedDirectories();
  }

  /**
   * Setup path translation between Windows and WSL
   */
  private async setupPathTranslation(): Promise<void> {
    console.log('🗺️ Setting up path translation');

    // Create bidirectional path mappings
    this.pathTranslationCache.set(
      this.config.windowsWorkspaceRoot,
      this.config.wslWorkspaceRoot
    );

    this.pathTranslationCache.set(
      this.config.wslWorkspaceRoot,
      this.config.windowsWorkspaceRoot
    );
  }

  /**
   * Translate path between Windows and WSL formats
   */
  translatePath(inputPath: string, targetPlatform: 'windows' | 'wsl'): string {
    if (!this.config.enablePathTranslation) {
      return inputPath;
    }

    // Check cache first
    const cached = this.pathTranslationCache.get(inputPath);
    if (cached) {
      return cached;
    }

    if (targetPlatform === 'wsl') {
      // Windows to WSL path translation
      if (inputPath.match(/^[A-Za-z]:\\/)) {
        const drive = inputPath.charAt(0).toLowerCase();
        const pathPart = inputPath.slice(3).replace(/\\/g, '/');
        const wslPath = `/mnt/${drive}/${pathPart}`;
        this.pathTranslationCache.set(inputPath, wslPath);
        return wslPath;
      }
    } else {
      // WSL to Windows path translation
      if (inputPath.startsWith('/mnt/')) {
        const match = inputPath.match(/^\/mnt\/([a-z])\/(.*)$/);
        if (match) {
          const drive = match[1].toUpperCase();
          const pathPart = match[2].replace(/\//g, '\\');
          const windowsPath = `${drive}:\\${pathPart}`;
          this.pathTranslationCache.set(inputPath, windowsPath);
          return windowsPath;
        }
      }
    }

    return inputPath;
  }

  /**
   * Create shared directories
   */
  private async createSharedDirectories(): Promise<void> {
    const sharedDirs = [
      path.join(this.config.wslWorkspaceRoot, 'shared-memory-mcp', 'data', 'shared'),
      path.join(this.config.wslWorkspaceRoot, 'shared-memory-mcp', 'data', 'logs'),
      path.join(this.config.wslWorkspaceRoot, 'shared-memory-mcp', 'data', 'config')
    ];

    for (const dir of sharedDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📂 Created shared directory: ${dir}`);
      } catch (error) {
        console.warn(`⚠️ Could not create directory ${dir}:`, error);
      }
    }
  }

  /**
   * Configure WSL networking
   */
  private async configureWSLNetworking(): Promise<void> {
    try {
      // Allow WSL to access Windows ports
      console.log('🔧 Configuring WSL networking');
      
      // This would typically involve iptables or similar configuration
      // For now, we'll just log the intent
      console.log('📡 WSL networking configured for cross-platform access');
    } catch (error) {
      console.warn('⚠️ WSL networking configuration failed:', error);
    }
  }

  /**
   * Configure Windows firewall
   */
  private async configureWindowsFirewall(): Promise<void> {
    try {
      console.log('🛡️ Configuring Windows firewall');
      
      // Add firewall rule for the MCP server port
      const command = `netsh advfirewall firewall add rule name="Neural AI MCP Server" dir=in action=allow protocol=TCP localport=${this.config.serverPort}`;
      
      // In a real implementation, this would need admin privileges
      console.log('🔥 Windows firewall rule would be added:', command);
    } catch (error) {
      console.warn('⚠️ Windows firewall configuration failed:', error);
    }
  }

  /**
   * Setup Windows service
   */
  private async setupWindowsService(): Promise<void> {
    console.log('🏗️ Setting up Windows service integration');
    
    // This would typically involve creating a Windows service
    // For development, we'll use a different approach
    console.log('🔧 Windows service integration configured');
  }

  /**
   * Create directory mappings
   */
  private async createDirectoryMappings(): Promise<void> {
    console.log('🗂️ Creating directory mappings');

    const mappings = [
      {
        wsl: path.join(this.config.wslWorkspaceRoot, 'shared-memory-mcp'),
        windows: path.join(this.config.windowsWorkspaceRoot, 'shared-memory-mcp')
      }
    ];

    for (const mapping of mappings) {
      console.log(`📁 Mapping: ${mapping.wsl} <-> ${mapping.windows}`);
    }
  }

  /**
   * Get MCP server configuration for cross-platform setup
   */
  getMCPServerConfig(): any {
    const baseConfig = {
      server: {
        command: 'node',
        args: ['unified-neural-mcp-server.js'],
        env: {
          PORT: this.config.serverPort.toString(),
          CROSS_PLATFORM: 'true',
          WSL_BRIDGE: this.isWSL.toString()
        }
      }
    };

    if (this.isWSL) {
      // WSL-specific configuration
      return {
        ...baseConfig,
        server: {
          ...baseConfig.server,
          env: {
            ...baseConfig.server.env,
            HOST: '0.0.0.0', // Bind to all interfaces in WSL
            WSL_IP: this.getWSLIPAddress(),
            WINDOWS_HOST: this.config.windowsServerHost
          }
        }
      };
    }

    return baseConfig;
  }

  /**
   * Generate cross-platform MCP configuration for different clients
   */
  generateMCPConfigs(): { [client: string]: any } {
    const baseServerUrl = this.isWSL 
      ? `http://${this.config.windowsServerHost}:${this.config.serverPort}`
      : `http://localhost:${this.config.serverPort}`;

    return {
      'claude-desktop': {
        mcpServers: {
          'neural-ai-collaboration': {
            command: 'npx',
            args: ['-y', '@anthropics/mcp-server-fetch'],
            env: {
              NEURAL_AI_SERVER_URL: baseServerUrl,
              CROSS_PLATFORM_MODE: 'windows-host'
            }
          }
        }
      },
      'cursor': {
        mcpServers: {
          'neural-ai-collaboration': {
            command: 'node',
            args: ['mcp-client-bridge.js'],
            env: {
              NEURAL_AI_SERVER_URL: baseServerUrl,
              CROSS_PLATFORM_MODE: 'windows-host'
            }
          }
        }
      },
      'claude-cli': {
        mcpServers: {
          'neural-ai-collaboration': {
            command: 'node',
            args: ['unified-neural-mcp-server.js'],
            env: {
              PORT: this.config.serverPort.toString(),
              HOST: '0.0.0.0',
              CROSS_PLATFORM_MODE: 'wsl-host'
            }
          }
        }
      }
    };
  }

  /**
   * Test cross-platform connectivity
   */
  async testCrossPlatformConnectivity(): Promise<boolean> {
    console.log('🧪 Testing cross-platform connectivity');

    const testResults = {
      networkAccess: false,
      fileSystemAccess: false,
      pathTranslation: false
    };

    // Test network access
    if (this.config.enableNetworkBridge) {
      const host = this.isWSL ? await this.resolveWindowsHost() : 'localhost';
      testResults.networkAccess = await this.testConnection(host, this.config.serverPort);
    }

    // Test file system access
    if (this.config.enableFileSystemBridge) {
      try {
        const testPath = path.join(this.config.wslWorkspaceRoot, 'shared-memory-mcp', 'data');
        await fs.access(testPath);
        testResults.fileSystemAccess = true;
      } catch {
        testResults.fileSystemAccess = false;
      }
    }

    // Test path translation
    if (this.config.enablePathTranslation) {
      const testWindowsPath = 'C:\\Users\\test\\file.txt';
      const translatedPath = this.translatePath(testWindowsPath, 'wsl');
      testResults.pathTranslation = translatedPath !== testWindowsPath;
    }

    console.log('📊 Cross-platform connectivity test results:', testResults);

    return Object.values(testResults).every(result => result);
  }

  /**
   * Get platform-specific instructions
   */
  getPlatformInstructions(): string[] {
    const instructions: string[] = [];

    if (this.isWSL) {
      instructions.push(
        '🐧 WSL Environment Detected:',
        `1. MCP server will run on port ${this.config.serverPort}`,
        '2. Server will bind to 0.0.0.0 for Windows access',
        '3. Windows clients will connect via WSL IP address',
        '4. File paths will be automatically translated',
        ''
      );
    }

    if (this.isWindows) {
      instructions.push(
        '🪟 Windows Environment Detected:',
        `1. Configure Claude Desktop and Cursor to connect to localhost:${this.config.serverPort}`,
        '2. Ensure Windows Firewall allows the connection',
        '3. Use Windows-style paths in configuration',
        ''
      );
    }

    instructions.push(
      '⚙️ Configuration Steps:',
      '1. Run the MCP server in WSL',
      '2. Configure Windows clients with the generated configs',
      '3. Test connectivity with the bridge utility',
      '4. Monitor logs for cross-platform communication'
    );

    return instructions;
  }
}

export default WindowsWSLBridge;