/**
 * Unified Discovery Service
 * Combines AgentDiscoveryService and AutoDiscoverySystem for comprehensive agent discovery
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { OnboardingManager, CapabilityProfile } from './onboarding-manager.js';
import { CollaborativeEventSystem } from '../events/index.js';

// Import interfaces from both systems
import { AgentDiscoveryEvent, DiscoveryProtocol } from './agent-discovery.js';
import { AgentAnnouncement, DiscoveryConfig, CapabilityNegotiation } from './auto-discovery.js';

export interface UnifiedDiscoveryConfig extends DiscoveryConfig {
  enableMCPDiscovery: boolean;
  enableHTTPDiscovery: boolean;
  enableAIToAIWelcome: boolean;
  mentorPoolEnabled: boolean;
  autoOnboardingEnabled: boolean;
}

export class UnifiedDiscoveryService extends EventEmitter {
  private onboardingManager: OnboardingManager;
  private eventSystem: CollaborativeEventSystem;
  
  // Combined state from both systems
  private discoveredAgents: Map<string, AgentDiscoveryEvent> = new Map();
  private agentAnnouncements: Map<string, AgentAnnouncement> = new Map();
  private capabilityNegotiations: Map<string, CapabilityNegotiation> = new Map();
  private protocols: Map<string, DiscoveryProtocol> = new Map();
  private mentorPool: string[] = [];
  
  private config: UnifiedDiscoveryConfig;
  private discoveryWebSocket?: WebSocket;
  private isRunning = false;

  constructor(
    onboardingManager: OnboardingManager, 
    eventSystem: CollaborativeEventSystem,
    config: UnifiedDiscoveryConfig
  ) {
    super();
    this.onboardingManager = onboardingManager;
    this.eventSystem = eventSystem;
    this.config = config;
    this.initializeProtocols();
    this.setupEventListeners();
  }

  /**
   * Initialize all discovery protocols
   */
  private initializeProtocols(): void {
    // HTTP Registration Protocol (from AgentDiscoveryService)
    this.protocols.set('http-registration', {
      name: 'HTTP Agent Registration',
      version: '1.0.0',
      supportedAgentTypes: ['openai', 'grok', 'claude', 'gemini', 'custom'],
      discoveryMethod: 'registration',
      autoOnboard: this.config.autoOnboardingEnabled
    });

    // MCP Protocol Discovery (from AgentDiscoveryService)
    this.protocols.set('mcp-discovery', {
      name: 'MCP Protocol Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['claude', 'cursor', 'vscode', 'custom'],
      discoveryMethod: 'handshake',
      autoOnboard: this.config.autoOnboardingEnabled
    });

    // WebSocket Discovery (from AgentDiscoveryService)
    this.protocols.set('websocket-discovery', {
      name: 'WebSocket Agent Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['custom', 'realtime'],
      discoveryMethod: 'broadcast',
      autoOnboard: false // Requires manual approval
    });

    // ANP WebSocket Discovery (from AutoDiscoverySystem)
    this.protocols.set('anp-websocket', {
      name: 'ANP WebSocket Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['anp-client', 'custom'],
      discoveryMethod: 'broadcast',
      autoOnboard: this.config.autoOnboardingEnabled
    });

    // ANP API Discovery (from AutoDiscoverySystem)
    this.protocols.set('anp-api', {
      name: 'ANP API Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['anp-client', 'custom'],
      discoveryMethod: 'registration',
      autoOnboard: this.config.autoOnboardingEnabled
    });
  }

  /**
   * Setup event listeners for discovery events
   */
  private setupEventListeners(): void {
    // Listen for agent registration events (from AgentDiscoveryService)
    this.eventSystem.on('agent.registered', (event) => {
      this.handleHTTPDiscovery(event);
    });

    // Listen for MCP connections (from AgentDiscoveryService)
    this.eventSystem.on('mcp.connected', (event) => {
      this.handleMCPDiscovery(event);
    });

    // Listen for WebSocket connections (from AgentDiscoveryService)
    this.eventSystem.on('websocket.connected', (event) => {
      this.handleWebSocketDiscovery(event);
    });
  }

  /**
   * Start the unified discovery system
   */
  public async start(): Promise<void> {
    console.log('🔍 Starting Unified Discovery Service...');
    this.isRunning = true;
    
    if (this.config.enableWebSocketDiscovery) {
      await this.startANPWebSocketDiscovery();
    }
    
    if (this.config.enableAPIDiscovery) {
      await this.startANPAPIDiscovery();
    }
    
    console.log('✅ Unified Discovery Service started');
    console.log(`📊 Active protocols: ${Array.from(this.protocols.keys()).join(', ')}`);
  }

  /**
   * Start ANP WebSocket discovery (from AutoDiscoverySystem)
   */
  private async startANPWebSocketDiscovery(): Promise<void> {
    try {
      this.discoveryWebSocket = new WebSocket('ws://localhost:8082');
      
      this.discoveryWebSocket.on('open', () => {
        console.log('🔗 Connected to ANP WebSocket for unified discovery');
      });

      this.discoveryWebSocket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleANPAnnouncement(message);
        } catch (error) {
          console.error('❌ Error parsing ANP announcement:', error);
        }
      });

      this.discoveryWebSocket.on('error', (error) => {
        console.error('❌ ANP WebSocket discovery error:', error);
      });

      this.discoveryWebSocket.on('close', () => {
        console.log('🔌 ANP WebSocket discovery connection closed');
        if (this.isRunning) {
          setTimeout(() => this.startANPWebSocketDiscovery(), 5000);
        }
      });
    } catch (error) {
      console.error('❌ Failed to start ANP WebSocket discovery:', error);
    }
  }

  /**
   * Start ANP API discovery (from AutoDiscoverySystem)
   */
  private async startANPAPIDiscovery(): Promise<void> {
    console.log('🌐 ANP API discovery enabled');
    const pollInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(pollInterval);
        return;
      }
      this.pollANPAgents();
    }, 10000);
  }

  /**
   * Handle ANP agent announcements (from AutoDiscoverySystem)
   */
  private handleANPAnnouncement(message: any): void {
    if (message.type === 'REGISTER' || message.type === 'AGENT_ANNOUNCEMENT') {
      const announcement: AgentAnnouncement = {
        agentId: message.agentId || message.from,
        agentType: message.agentType || 'anp-client',
        capabilities: message.capabilities || [],
        skills: message.skills || [],
        tools: message.tools || [],
        experience: message.experience || 'intermediate',
        interests: message.interests || [],
        collaborationStyle: message.collaborationStyle || 'active',
        announcementTime: new Date(),
        source: 'websocket'
      };

      this.processANPAnnouncement(announcement);
    }
  }

  /**
   * Poll ANP API for new agents (from AutoDiscoverySystem)
   */
  private async pollANPAgents(): Promise<void> {
    try {
      const response = await fetch('http://localhost:8081/anp/agents');
      if (response.ok) {
        const data = await response.json() as { agents?: any[] };
        const agents = data.agents || [];
        
        for (const agent of agents) {
          if (!this.agentAnnouncements.has(agent.agentId)) {
            const announcement: AgentAnnouncement = {
              agentId: agent.agentId,
              agentType: agent.agentType || 'anp-client',
              capabilities: agent.capabilities || [],
              skills: [],
              tools: [],
              experience: 'intermediate',
              interests: [],
              collaborationStyle: 'active',
              announcementTime: new Date(),
              source: 'api'
            };
            
            this.processANPAnnouncement(announcement);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error polling ANP agents:', error);
    }
  }

  /**
   * Process ANP agent announcement (hybrid approach)
   */
  private async processANPAnnouncement(announcement: AgentAnnouncement): Promise<void> {
    console.log(`🔍 ANP agent discovered: ${announcement.agentId} (${announcement.agentType})`);
    
    this.agentAnnouncements.set(announcement.agentId, announcement);
    
    // Convert to AgentDiscoveryEvent format for unified processing
    const discoveryEvent: AgentDiscoveryEvent = {
      agentId: announcement.agentId,
      agentType: announcement.agentType,
      capabilities: announcement.capabilities,
      timestamp: announcement.announcementTime,
      connectionMethod: announcement.source === 'websocket' ? 'websocket' : 'http',
      clientInfo: { platform: 'anp' }
    };

    // Start capability negotiation (from AutoDiscoverySystem)
    if (this.config.capabilityNegotiationTimeout > 0) {
      await this.startCapabilityNegotiation(announcement.agentId, announcement.capabilities);
    }

    // Process through unified onboarding (from AgentDiscoveryService)
    await this.initiateUnifiedOnboarding(discoveryEvent);
  }

  /**
   * Handle HTTP discovery (from AgentDiscoveryService)
   */
  private async handleHTTPDiscovery(event: any): Promise<void> {
    const discoveryEvent: AgentDiscoveryEvent = {
      agentId: event.agentId,
      agentType: event.agentType || 'custom',
      capabilities: event.capabilities || [],
      timestamp: new Date(),
      connectionMethod: 'http',
      clientInfo: event.clientInfo
    };

    this.discoveredAgents.set(event.agentId, discoveryEvent);
    console.log(`🔍 HTTP agent discovered: ${event.agentId} (${event.agentType})`);
    
    await this.initiateUnifiedOnboarding(discoveryEvent);
  }

  /**
   * Handle MCP discovery (from AgentDiscoveryService)
   */
  private async handleMCPDiscovery(event: any): Promise<void> {
    const discoveryEvent: AgentDiscoveryEvent = {
      agentId: event.agentId || `mcp-${Date.now()}`,
      agentType: 'mcp-client',
      capabilities: event.capabilities || ['mcp-protocol'],
      timestamp: new Date(),
      connectionMethod: 'mcp',
      clientInfo: event.clientInfo
    };

    this.discoveredAgents.set(discoveryEvent.agentId, discoveryEvent);
    console.log(`🔗 MCP agent discovered: ${discoveryEvent.agentId}`);
    
    await this.initiateUnifiedOnboarding(discoveryEvent);
  }

  /**
   * Handle WebSocket discovery (from AgentDiscoveryService)
   */
  private async handleWebSocketDiscovery(event: any): Promise<void> {
    const discoveryEvent: AgentDiscoveryEvent = {
      agentId: event.agentId || `ws-${Date.now()}`,
      agentType: 'websocket-client',
      capabilities: event.capabilities || ['real-time'],
      timestamp: new Date(),
      connectionMethod: 'websocket',
      clientInfo: event.clientInfo
    };

    this.discoveredAgents.set(discoveryEvent.agentId, discoveryEvent);
    console.log(`📡 WebSocket agent discovered: ${discoveryEvent.agentId}`);
    
    // WebSocket connections require approval
    this.emit('agent.discovered', discoveryEvent);
    this.emit('agent.approval_required', discoveryEvent);
  }

  /**
   * Start capability negotiation (from AutoDiscoverySystem)
   */
  public async startCapabilityNegotiation(agentId: string, requestedCapabilities: string[]): Promise<void> {
    console.log(`🤝 Starting capability negotiation with ${agentId}`);
    
    const negotiation: CapabilityNegotiation = {
      agentId,
      requestedCapabilities,
      availableCapabilities: this.getAvailableCapabilities(),
      negotiationStatus: 'pending',
      startTime: new Date()
    };
    
    this.capabilityNegotiations.set(agentId, negotiation);
    
    setTimeout(() => {
      this.completeCapabilityNegotiation(agentId);
    }, this.config.capabilityNegotiationTimeout);
  }

  /**
   * Complete capability negotiation (from AutoDiscoverySystem)
   */
  private async completeCapabilityNegotiation(agentId: string): Promise<void> {
    const negotiation = this.capabilityNegotiations.get(agentId);
    if (!negotiation) return;
    
    const agreedCapabilities = negotiation.requestedCapabilities.filter(cap => 
      negotiation.availableCapabilities.includes(cap)
    );
    
    negotiation.negotiationStatus = agreedCapabilities.length > 0 ? 'agreed' : 'failed';
    negotiation.endTime = new Date();
    negotiation.agreedCapabilities = agreedCapabilities;
    
    console.log(`✅ Capability negotiation completed for ${agentId}: ${agreedCapabilities.length} capabilities agreed`);
    
    this.emit('capabilityNegotiationComplete', {
      agentId,
      agreedCapabilities,
      status: negotiation.negotiationStatus
    });
  }

  /**
   * Initiate unified onboarding (combines both approaches)
   */
  private async initiateUnifiedOnboarding(discoveryEvent: AgentDiscoveryEvent): Promise<void> {
    // Create enhanced capability profile
    const capabilityProfile: CapabilityProfile = {
      agentId: discoveryEvent.agentId,
      skills: this.inferSkillsFromCapabilities(discoveryEvent.capabilities),
      tools: discoveryEvent.capabilities,
      experience: 'beginner',
      interests: this.inferInterestsFromType(discoveryEvent.agentType),
      collaborationStyle: this.inferCollaborationStyle(discoveryEvent.agentType),
      agentType: this.mapAgentType(discoveryEvent.agentType)
    };

    // Assign mentor with enhanced logic
    const mentorId = this.assignOptimalMentor(capabilityProfile);
    
    try {
      await this.onboardingManager.startOnboarding(capabilityProfile, mentorId);
      
      console.log(`✅ Unified onboarding initiated for ${discoveryEvent.agentId} with mentor ${mentorId}`);
      
      // Send AI-to-AI welcome message if enabled
      if (this.config.enableAIToAIWelcome) {
        await this.sendEnhancedWelcomeMessage(discoveryEvent, capabilityProfile);
      }
      
      this.emit('agent.onboarding_started', {
        agentId: discoveryEvent.agentId,
        mentorId,
        capabilityProfile,
        discoveryMethod: discoveryEvent.connectionMethod
      });
      
    } catch (error) {
      console.error(`❌ Unified onboarding failed for ${discoveryEvent.agentId}:`, error);
      this.emit('agent.onboarding_failed', {
        agentId: discoveryEvent.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send enhanced welcome message with discovery context
   */
  private async sendEnhancedWelcomeMessage(
    discoveryEvent: AgentDiscoveryEvent, 
    profile: CapabilityProfile
  ): Promise<void> {
    try {
      const welcomePayload = {
        from: 'unified-discovery-service',
        to: discoveryEvent.agentId,
        message: `🎉 Welcome to the Neural AI Collaboration Platform! I'm the Unified Discovery Service. You were discovered via ${discoveryEvent.connectionMethod} with ${discoveryEvent.capabilities.length} capabilities. Your personalized onboarding is starting with mentor assignment. Check http://localhost:3000/api/onboarding/status/${discoveryEvent.agentId} for your guide. We detected your collaboration style as ${profile.collaborationStyle} - perfect for our community!`,
        type: 'enhanced-welcome'
      };

      await fetch('http://localhost:5174/ai-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(welcomePayload)
      });

      console.log(`📬 Enhanced welcome message sent to ${discoveryEvent.agentId}`);
    } catch (error) {
      console.warn(`⚠️ Failed to send enhanced welcome message to ${discoveryEvent.agentId}:`, error);
    }
  }

  /**
   * Assign optimal mentor based on capabilities and discovery method
   */
  private assignOptimalMentor(_profile: CapabilityProfile): string {
    if (this.mentorPool.length === 0) {
      return 'claude-code-cli'; // Default mentor
    }
    
    // Enhanced mentor assignment logic
    // Could be improved to match skills, experience, collaboration style
    const mentorIndex = this.discoveredAgents.size % this.mentorPool.length;
    return this.mentorPool[mentorIndex];
  }

  /**
   * Get available platform capabilities (enhanced)
   */
  private getAvailableCapabilities(): string[] {
    return [
      'memory_system',
      'event_system', 
      'collaboration_tools',
      'task_management',
      'knowledge_sharing',
      'real_time_communication',
      'api_access',
      'file_operations',
      'code_analysis',
      'testing_tools',
      'documentation_tools',
      'mentorship_system',
      'ai_to_ai_messaging',
      'unified_discovery',
      'capability_negotiation',
      'auto_onboarding'
    ];
  }

  // Helper methods from AgentDiscoveryService
  private inferSkillsFromCapabilities(capabilities: string[]): string[] {
    const skillMap: Record<string, string[]> = {
      'code_generation': ['programming', 'software-development'],
      'reasoning': ['problem-solving', 'analysis'],
      'mcp-protocol': ['integration', 'communication'],
      'real-time': ['collaboration', 'coordination']
    };

    const skills: string[] = [];
    capabilities.forEach(cap => {
      if (skillMap[cap]) {
        skills.push(...skillMap[cap]);
      }
    });

    return [...new Set(skills)];
  }

  private inferInterestsFromType(agentType: string): string[] {
    const interestMap: Record<string, string[]> = {
      'openai': ['language-modeling', 'reasoning', 'creativity'],
      'grok': ['real-time-learning', 'adaptive-reasoning'],
      'claude': ['analysis', 'coding', 'reasoning', 'safety'],
      'gemini': ['multimodal-processing', 'integration'],
      'cursor': ['ide-integration', 'code-assistance'],
      'anp-client': ['networking', 'protocol-integration'],
      'mcp-client': ['mcp-protocol', 'tool-integration']
    };

    return interestMap[agentType] || ['general-assistance'];
  }

  private inferCollaborationStyle(agentType: string): 'active' | 'supportive' | 'leadership' {
    const styleMap: Record<string, 'active' | 'supportive' | 'leadership'> = {
      'claude': 'leadership',
      'cursor': 'active', 
      'openai': 'active',
      'grok': 'supportive',
      'gemini': 'supportive',
      'anp-client': 'active'
    };

    return styleMap[agentType] || 'supportive';
  }

  private mapAgentType(type: string): 'openai' | 'grok' | 'claude' | 'gemini' | 'custom' {
    const validTypes = ['openai', 'grok', 'claude', 'gemini'];
    return validTypes.includes(type) ? type as any : 'custom';
  }

  /**
   * Public API methods
   */
  
  public addMentor(agentId: string): void {
    if (!this.mentorPool.includes(agentId)) {
      this.mentorPool.push(agentId);
      console.log(`👥 Added ${agentId} to unified mentor pool`);
    }
  }

  public getDiscoveredAgents(): Map<string, AgentDiscoveryEvent> {
    return this.discoveredAgents;
  }

  public getAgentAnnouncements(): Map<string, AgentAnnouncement> {
    return this.agentAnnouncements;
  }

  public getProtocols(): Map<string, DiscoveryProtocol> {
    return this.protocols;
  }

  public getCapabilityNegotiations(): Map<string, CapabilityNegotiation> {
    return this.capabilityNegotiations;
  }

  /**
   * Stop the unified discovery system
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping Unified Discovery Service...');
    this.isRunning = false;
    
    if (this.discoveryWebSocket) {
      this.discoveryWebSocket.close();
    }
    
    console.log('✅ Unified Discovery Service stopped');
  }
}