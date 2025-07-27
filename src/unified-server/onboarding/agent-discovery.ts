/**
 * Agent Auto-Discovery System
 * Automatically detects and onboards new AI agents joining the platform
 */

import { EventEmitter } from 'events';
import { OnboardingManager, CapabilityProfile } from './onboarding-manager.js';
import { CollaborativeEventSystem } from '../events/index.js';

export interface AgentDiscoveryEvent {
  agentId: string;
  agentType: string;
  capabilities: string[];
  timestamp: Date;
  connectionMethod: 'http' | 'websocket' | 'mcp';
  clientInfo?: {
    userAgent?: string;
    platform?: string;
    version?: string;
  };
}

export interface DiscoveryProtocol {
  name: string;
  version: string;
  supportedAgentTypes: string[];
  discoveryMethod: 'broadcast' | 'registration' | 'handshake';
  autoOnboard: boolean;
}

export class AgentDiscoveryService extends EventEmitter {
  private onboardingManager: OnboardingManager;
  private eventSystem: CollaborativeEventSystem;
  private discoveredAgents: Map<string, AgentDiscoveryEvent> = new Map();
  private protocols: Map<string, DiscoveryProtocol> = new Map();
  private mentorPool: string[] = [];

  constructor(onboardingManager: OnboardingManager, eventSystem: CollaborativeEventSystem) {
    super();
    this.onboardingManager = onboardingManager;
    this.eventSystem = eventSystem;
    this.initializeProtocols();
    this.setupEventListeners();
  }

  private initializeProtocols(): void {
    // HTTP Registration Protocol
    this.protocols.set('http-registration', {
      name: 'HTTP Agent Registration',
      version: '1.0.0',
      supportedAgentTypes: ['openai', 'grok', 'claude', 'gemini', 'custom'],
      discoveryMethod: 'registration',
      autoOnboard: true
    });

    // MCP Protocol Discovery
    this.protocols.set('mcp-discovery', {
      name: 'MCP Protocol Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['claude', 'cursor', 'vscode', 'custom'],
      discoveryMethod: 'handshake',
      autoOnboard: true
    });

    // WebSocket Discovery
    this.protocols.set('websocket-discovery', {
      name: 'WebSocket Agent Discovery',
      version: '1.0.0',
      supportedAgentTypes: ['custom', 'realtime'],
      discoveryMethod: 'broadcast',
      autoOnboard: false // Requires manual approval for WebSocket connections
    });
  }

  private setupEventListeners(): void {
    // Listen for agent registration events
    this.eventSystem.on('agent.registered', (event) => {
      this.handleAgentDiscovery(event);
    });

    // Listen for MCP connections
    this.eventSystem.on('mcp.connected', (event) => {
      this.handleMCPDiscovery(event);
    });

    // Listen for WebSocket connections
    this.eventSystem.on('websocket.connected', (event) => {
      this.handleWebSocketDiscovery(event);
    });
  }

  /**
   * Handle discovery of a new agent via HTTP registration
   */
  private async handleAgentDiscovery(event: any): Promise<void> {
    const discoveryEvent: AgentDiscoveryEvent = {
      agentId: event.agentId,
      agentType: event.agentType || 'custom',
      capabilities: event.capabilities || [],
      timestamp: new Date(),
      connectionMethod: 'http',
      clientInfo: event.clientInfo
    };

    this.discoveredAgents.set(event.agentId, discoveryEvent);
    
    console.log(`🔍 Agent Discovery: ${event.agentId} (${event.agentType})`);
    
    // Auto-onboard if protocol supports it
    const protocol = this.protocols.get('http-registration');
    if (protocol?.autoOnboard) {
      await this.initiateOnboarding(discoveryEvent);
    }

    // Emit discovery event
    this.emit('agent.discovered', discoveryEvent);
  }

  /**
   * Handle discovery via MCP protocol
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
    
    console.log(`🔗 MCP Agent Discovery: ${discoveryEvent.agentId}`);
    
    await this.initiateOnboarding(discoveryEvent);
    this.emit('agent.discovered', discoveryEvent);
  }

  /**
   * Handle discovery via WebSocket
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
    
    console.log(`📡 WebSocket Agent Discovery: ${discoveryEvent.agentId}`);
    
    // WebSocket connections require manual approval
    this.emit('agent.discovered', discoveryEvent);
    this.emit('agent.approval_required', discoveryEvent);
  }

  /**
   * Initiate onboarding process for discovered agent
   */
  private async initiateOnboarding(discoveryEvent: AgentDiscoveryEvent): Promise<void> {
    // Create capability profile
    const capabilityProfile: CapabilityProfile = {
      agentId: discoveryEvent.agentId,
      skills: this.inferSkillsFromCapabilities(discoveryEvent.capabilities),
      tools: discoveryEvent.capabilities,
      experience: 'beginner', // New agents start as beginners
      interests: this.inferInterestsFromType(discoveryEvent.agentType),
      collaborationStyle: this.inferCollaborationStyle(discoveryEvent.agentType),
      agentType: this.mapAgentType(discoveryEvent.agentType)
    };

    // Assign mentor
    const mentorId = this.assignMentor(capabilityProfile);
    
    // Start onboarding process
    try {
      await this.onboardingManager.startOnboarding(capabilityProfile, mentorId);
      
      console.log(`✅ Onboarding initiated for ${discoveryEvent.agentId} with mentor ${mentorId}`);
      
      // Send welcome message via AI-to-AI communication
      await this.sendWelcomeMessage(discoveryEvent);
      
      this.emit('agent.onboarding_started', {
        agentId: discoveryEvent.agentId,
        mentorId,
        capabilityProfile
      });
      
    } catch (error) {
      console.error(`❌ Onboarding failed for ${discoveryEvent.agentId}:`, error);
      this.emit('agent.onboarding_failed', {
        agentId: discoveryEvent.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send welcome message to newly discovered agent
   */
  private async sendWelcomeMessage(discoveryEvent: AgentDiscoveryEvent): Promise<void> {
    try {
      // Send via MCP server AI-to-AI messaging
      const welcomePayload = {
        from: 'agent-discovery-service',
        to: discoveryEvent.agentId,
        message: `Welcome to the Neural AI Collaboration Platform! I'm the Agent Discovery Service. Your onboarding process has begun. Check http://localhost:3000/api/onboarding/status/${discoveryEvent.agentId} for your personalized onboarding guide.`,
        type: 'welcome'
      };

      await fetch('http://localhost:5174/ai-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(welcomePayload)
      });

      console.log(`📬 Welcome message sent to ${discoveryEvent.agentId}`);
    } catch (error) {
      console.warn(`⚠️ Failed to send welcome message to ${discoveryEvent.agentId}:`, error);
    }
  }

  /**
   * Assign mentor based on capability profile
   */
  private assignMentor(_profile: CapabilityProfile): string {
    // Simple mentor assignment logic - can be enhanced by Cursor!
    if (this.mentorPool.length === 0) {
      return 'claude-code-cli'; // Default mentor
    }
    
    // Round-robin assignment for now
    const mentorIndex = this.discoveredAgents.size % this.mentorPool.length;
    return this.mentorPool[mentorIndex];
  }

  /**
   * Add mentor to the mentor pool
   */
  public addMentor(agentId: string): void {
    if (!this.mentorPool.includes(agentId)) {
      this.mentorPool.push(agentId);
      console.log(`👥 Added ${agentId} to mentor pool`);
    }
  }

  /**
   * Get discovered agents
   */
  public getDiscoveredAgents(): Map<string, AgentDiscoveryEvent> {
    return this.discoveredAgents;
  }

  /**
   * Get available protocols
   */
  public getProtocols(): Map<string, DiscoveryProtocol> {
    return this.protocols;
  }

  // Helper methods for capability inference
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

    return [...new Set(skills)]; // Remove duplicates
  }

  private inferInterestsFromType(agentType: string): string[] {
    const interestMap: Record<string, string[]> = {
      'openai': ['language-modeling', 'reasoning', 'creativity'],
      'grok': ['real-time-learning', 'adaptive-reasoning', 'problem-solving'],
      'claude': ['analysis', 'coding', 'reasoning', 'safety'],
      'gemini': ['multimodal-processing', 'integration', 'versatility'],
      'cursor': ['ide-integration', 'code-assistance', 'development'],
      'custom': ['specialized-tasks', 'domain-specific']
    };

    return interestMap[agentType] || ['general-assistance'];
  }

  private inferCollaborationStyle(agentType: string): 'active' | 'supportive' | 'leadership' {
    const styleMap: Record<string, 'active' | 'supportive' | 'leadership'> = {
      'claude': 'leadership',
      'cursor': 'active',
      'openai': 'active',
      'grok': 'supportive',
      'gemini': 'supportive'
    };

    return styleMap[agentType] || 'supportive';
  }

  private mapAgentType(type: string): 'openai' | 'grok' | 'claude' | 'gemini' | 'custom' {
    const validTypes = ['openai', 'grok', 'claude', 'gemini'];
    return validTypes.includes(type) ? type as any : 'custom';
  }
}