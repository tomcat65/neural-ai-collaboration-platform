/**
 * Auto-Discovery System for Agent Onboarding
 * Enhanced agent detection and capability negotiation
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { CapabilityProfile } from './onboarding-manager.js';

export interface AgentAnnouncement {
  agentId: string;
  agentType: string;
  capabilities: string[];
  skills: string[];
  tools: string[];
  experience: 'beginner' | 'intermediate' | 'advanced';
  interests: string[];
  collaborationStyle: 'active' | 'supportive' | 'leadership';
  announcementTime: Date;
  source: 'websocket' | 'api' | 'manual';
}

export interface DiscoveryConfig {
  enableWebSocketDiscovery: boolean;
  enableAPIDiscovery: boolean;
  discoveryTimeout: number; // milliseconds
  capabilityNegotiationTimeout: number; // milliseconds
  maxDiscoveryAttempts: number;
}

export interface CapabilityNegotiation {
  agentId: string;
  requestedCapabilities: string[];
  availableCapabilities: string[];
  negotiationStatus: 'pending' | 'negotiating' | 'agreed' | 'failed';
  startTime: Date;
  endTime?: Date;
  agreedCapabilities?: string[];
}

export class AutoDiscoverySystem extends EventEmitter {
  private discoveredAgents: Map<string, AgentAnnouncement> = new Map();
  private capabilityNegotiations: Map<string, CapabilityNegotiation> = new Map();
  private config: DiscoveryConfig;
  private discoveryWebSocket?: WebSocket;

  constructor(config: DiscoveryConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the auto-discovery system
   */
  public async start(): Promise<void> {
    console.log('🔍 Starting Auto-Discovery System...');
    
    if (this.config.enableWebSocketDiscovery) {
      await this.startWebSocketDiscovery();
    }
    
    if (this.config.enableAPIDiscovery) {
      await this.startAPIDiscovery();
    }
    
    console.log('✅ Auto-Discovery System started');
  }

  /**
   * Start WebSocket-based agent discovery
   */
  private async startWebSocketDiscovery(): Promise<void> {
    try {
      // Connect to ANP WebSocket for agent announcements
      this.discoveryWebSocket = new WebSocket('ws://localhost:8082');
      
      this.discoveryWebSocket.on('open', () => {
        console.log('🔗 Connected to ANP WebSocket for agent discovery');
      });

      this.discoveryWebSocket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleAgentAnnouncement(message);
        } catch (error) {
          console.error('❌ Error parsing agent announcement:', error);
        }
      });

      this.discoveryWebSocket.on('error', (error) => {
        console.error('❌ WebSocket discovery error:', error);
      });

      this.discoveryWebSocket.on('close', () => {
        console.log('🔌 WebSocket discovery connection closed');
        // Attempt to reconnect
        setTimeout(() => this.startWebSocketDiscovery(), 5000);
      });
    } catch (error) {
      console.error('❌ Failed to start WebSocket discovery:', error);
    }
  }

  /**
   * Start API-based agent discovery
   */
  private async startAPIDiscovery(): Promise<void> {
    console.log('🌐 API-based discovery enabled');
    // Poll for new agents via API endpoints
    setInterval(() => {
      this.pollForNewAgents();
    }, 10000); // Poll every 10 seconds
  }

  /**
   * Handle agent announcements from WebSocket
   */
  private handleAgentAnnouncement(message: any): void {
    if (message.type === 'REGISTER' || message.type === 'AGENT_ANNOUNCEMENT') {
      const announcement: AgentAnnouncement = {
        agentId: message.agentId || message.from,
        agentType: message.agentType || 'custom',
        capabilities: message.capabilities || [],
        skills: message.skills || [],
        tools: message.tools || [],
        experience: message.experience || 'intermediate',
        interests: message.interests || [],
        collaborationStyle: message.collaborationStyle || 'active',
        announcementTime: new Date(),
        source: 'websocket'
      };

      this.processAgentAnnouncement(announcement);
    }
  }

  /**
   * Poll for new agents via API
   */
  private async pollForNewAgents(): Promise<void> {
    try {
      // Check ANP agents endpoint
      const response = await fetch('http://localhost:8081/anp/agents');
      if (response.ok) {
        const data = await response.json() as { agents?: any[] };
        const agents = data.agents || [];
        
        for (const agent of agents) {
          if (!this.discoveredAgents.has(agent.agentId)) {
            const announcement: AgentAnnouncement = {
              agentId: agent.agentId,
              agentType: agent.agentType || 'custom',
              capabilities: agent.capabilities || [],
              skills: [],
              tools: [],
              experience: 'intermediate',
              interests: [],
              collaborationStyle: 'active',
              announcementTime: new Date(),
              source: 'api'
            };
            
            this.processAgentAnnouncement(announcement);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error polling for new agents:', error);
    }
  }

  /**
   * Process a new agent announcement
   */
  private async processAgentAnnouncement(announcement: AgentAnnouncement): Promise<void> {
    console.log(`🔍 New agent discovered: ${announcement.agentId} (${announcement.agentType})`);
    
    // Store the announcement
    this.discoveredAgents.set(announcement.agentId, announcement);
    
    // Emit discovery event
    this.emit('agentDiscovered', announcement);
    
    // Start capability negotiation
    await this.startCapabilityNegotiation(announcement.agentId, announcement.capabilities);
  }

  /**
   * Start capability negotiation with a new agent
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
    
    // Simulate capability negotiation
    setTimeout(() => {
      this.completeCapabilityNegotiation(agentId);
    }, this.config.capabilityNegotiationTimeout);
  }

  /**
   * Complete capability negotiation
   */
  private async completeCapabilityNegotiation(agentId: string): Promise<void> {
    const negotiation = this.capabilityNegotiations.get(agentId);
    if (!negotiation) return;
    
    // Find common capabilities
    const agreedCapabilities = negotiation.requestedCapabilities.filter(cap => 
      negotiation.availableCapabilities.includes(cap)
    );
    
    negotiation.negotiationStatus = agreedCapabilities.length > 0 ? 'agreed' : 'failed';
    negotiation.endTime = new Date();
    negotiation.agreedCapabilities = agreedCapabilities;
    
    console.log(`✅ Capability negotiation completed for ${agentId}: ${agreedCapabilities.length} capabilities agreed`);
    
    // Emit negotiation complete event
    this.emit('capabilityNegotiationComplete', {
      agentId,
      agreedCapabilities,
      status: negotiation.negotiationStatus
    });
  }

  /**
   * Get available platform capabilities
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
      'mentorship_system'
    ];
  }

  /**
   * Get discovered agents
   */
  public getDiscoveredAgents(): AgentAnnouncement[] {
    return Array.from(this.discoveredAgents.values());
  }

  /**
   * Get capability negotiations
   */
  public getCapabilityNegotiations(): CapabilityNegotiation[] {
    return Array.from(this.capabilityNegotiations.values());
  }

  /**
   * Check if an agent has been discovered
   */
  public isAgentDiscovered(agentId: string): boolean {
    return this.discoveredAgents.has(agentId);
  }

  /**
   * Get agent announcement
   */
  public getAgentAnnouncement(agentId: string): AgentAnnouncement | undefined {
    return this.discoveredAgents.get(agentId);
  }

  /**
   * Stop the auto-discovery system
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping Auto-Discovery System...');
    
    if (this.discoveryWebSocket) {
      this.discoveryWebSocket.close();
    }
    
    console.log('✅ Auto-Discovery System stopped');
  }
} 