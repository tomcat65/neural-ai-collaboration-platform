/**
 * Agent Registry
 * Manages registration, discovery, and lifecycle of AI agents
 */

import {
  AgentProvider,
  AgentRole,
  AgentIdentifier,
  AgentRegistration,
  AgentCapabilities
} from '../types';

export class AgentRegistry {
  private agents: Map<string, AgentRegistration> = new Map();
  private providerCounts: Map<AgentProvider, number> = new Map();
  private roleAssignments: Map<AgentRole, string[]> = new Map();

  /**
   * Register a new agent
   */
  async register(registration: AgentRegistration): Promise<void> {
    const agentId = registration.agent.id;
    
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    // Validate registration
    this.validateRegistration(registration);

    // Store registration
    this.agents.set(agentId, {
      ...registration,
      lastSeen: new Date()
    });

    // Update counters
    this.updateProviderCount(registration.agent.provider, 1);
    this.updateRoleAssignment(registration.agent.role, agentId, 'add');

    console.log(`Agent registered: ${agentId} (${registration.agent.provider}:${registration.agent.role})`);
  }

  /**
   * Unregister an agent
   */
  async unregister(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId);
    
    if (!registration) {
      throw new Error(`Agent ${agentId} is not registered`);
    }

    // Remove from registry
    this.agents.delete(agentId);

    // Update counters
    this.updateProviderCount(registration.agent.provider, -1);
    this.updateRoleAssignment(registration.agent.role, agentId, 'remove');

    console.log(`Agent unregistered: ${agentId}`);
  }

  /**
   * Update agent status
   */
  async updateStatus(agentId: string, status: 'online' | 'offline' | 'busy' | 'error'): Promise<void> {
    const registration = this.agents.get(agentId);
    
    if (!registration) {
      throw new Error(`Agent ${agentId} is not registered`);
    }

    registration.status = status;
    registration.lastSeen = new Date();
    
    console.log(`Agent status updated: ${agentId} -> ${status}`);
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(agentId: string): Promise<void> {
    const registration = this.agents.get(agentId);
    
    if (registration) {
      registration.lastSeen = new Date();
    }
  }

  /**
   * Find agents by criteria
   */
  findAgents(criteria: {
    provider?: AgentProvider;
    role?: AgentRole;
    skills?: string[];
    status?: 'online' | 'offline' | 'busy' | 'error';
    maxCost?: number;
  }): AgentRegistration[] {
    const results: AgentRegistration[] = [];

    for (const registration of this.agents.values()) {
      // Check provider
      if (criteria.provider && registration.agent.provider !== criteria.provider) {
        continue;
      }

      // Check role
      if (criteria.role && registration.agent.role !== criteria.role) {
        continue;
      }

      // Check status
      if (criteria.status && registration.status !== criteria.status) {
        continue;
      }

      // Check skills
      if (criteria.skills && criteria.skills.length > 0) {
        const hasAllSkills = criteria.skills.every(skill =>
          registration.capabilities.specializations.includes(skill)
        );
        if (!hasAllSkills) {
          continue;
        }
      }

      // Check cost
      if (criteria.maxCost && registration.capabilities.costPerToken) {
        if (registration.capabilities.costPerToken > criteria.maxCost) {
          continue;
        }
      }

      results.push(registration);
    }

    // Sort by response time (if available)
    return results.sort((a, b) => {
      const timeA = a.capabilities.responseTime || Infinity;
      const timeB = b.capabilities.responseTime || Infinity;
      return timeA - timeB;
    });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAll(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by provider
   */
  getByProvider(provider: AgentProvider): AgentRegistration[] {
    return this.getAll().filter(agent => agent.agent.provider === provider);
  }

  /**
   * Get agents by role
   */
  getByRole(role: AgentRole): AgentRegistration[] {
    return this.getAll().filter(agent => agent.agent.role === role);
  }

  /**
   * Get online agents
   */
  getOnlineAgents(): AgentRegistration[] {
    return this.getAll().filter(agent => agent.status === 'online');
  }

  /**
   * Get available agents (online and not busy)
   */
  getAvailableAgents(): AgentRegistration[] {
    return this.getAll().filter(agent => 
      agent.status === 'online'
    );
  }

  /**
   * Find best agent for task
   */
  findBestAgent(requirements: {
    skills: string[];
    preferredProvider?: AgentProvider;
    preferredRole?: AgentRole;
    maxCost?: number;
    maxResponseTime?: number;
  }): AgentRegistration | null {
    const candidates = this.findAgents({
      provider: requirements.preferredProvider,
      role: requirements.preferredRole,
      skills: requirements.skills,
      status: 'online',
      maxCost: requirements.maxCost
    });

    if (candidates.length === 0) {
      return null;
    }

    // Score candidates
    const scoredCandidates = candidates.map(candidate => ({
      agent: candidate,
      score: this.scoreAgent(candidate, requirements)
    }));

    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score);

    return scoredCandidates[0].agent;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const total = this.agents.size;
    const online = this.getOnlineAgents().length;
    const available = this.getAvailableAgents().length;

    const byProvider: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const registration of this.agents.values()) {
      // Count by provider
      const provider = registration.agent.provider;
      byProvider[provider] = (byProvider[provider] || 0) + 1;

      // Count by role
      const role = registration.agent.role;
      byRole[role] = (byRole[role] || 0) + 1;

      // Count by status
      const status = registration.status;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return {
      total,
      online,
      available,
      byProvider,
      byRole,
      byStatus
    };
  }

  /**
   * Clean up stale agents
   */
  async cleanup(maxAge: number = 5 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [agentId, registration] of this.agents.entries()) {
      const age = now - registration.lastSeen.getTime();
      if (age > maxAge && registration.status !== 'online') {
        toRemove.push(agentId);
      }
    }

    for (const agentId of toRemove) {
      await this.unregister(agentId);
    }

    if (toRemove.length > 0) {
      console.log(`Cleaned up ${toRemove.length} stale agents`);
    }
  }

  /**
   * Validate agent registration
   */
  private validateRegistration(registration: AgentRegistration): void {
    const { agent, capabilities } = registration;

    if (!agent.id || !agent.provider || !agent.role) {
      throw new Error('Agent must have id, provider, and role');
    }

    if (!capabilities.specializations || capabilities.specializations.length === 0) {
      throw new Error('Agent must have at least one specialization');
    }

    if (typeof capabilities.mcpNative !== 'boolean') {
      throw new Error('Agent capabilities must specify MCP native support');
    }
  }

  /**
   * Score an agent for task suitability
   */
  private scoreAgent(
    registration: AgentRegistration,
    requirements: {
      skills: string[];
      preferredProvider?: AgentProvider;
      preferredRole?: AgentRole;
      maxCost?: number;
      maxResponseTime?: number;
    }
  ): number {
    let score = 0;

    // Skill match (most important factor)
    const skillMatchRatio = requirements.skills.filter(skill =>
      registration.capabilities.specializations.includes(skill)
    ).length / requirements.skills.length;
    score += skillMatchRatio * 50;

    // Provider preference
    if (requirements.preferredProvider === registration.agent.provider) {
      score += 20;
    }

    // Role preference
    if (requirements.preferredRole === registration.agent.role) {
      score += 15;
    }

    // MCP native support
    if (registration.capabilities.mcpNative) {
      score += 10;
    }

    // Response time (lower is better)
    if (registration.capabilities.responseTime) {
      const responseScore = Math.max(0, 5 - (registration.capabilities.responseTime / 1000));
      score += responseScore;
    }

    // Cost efficiency (lower is better)
    if (registration.capabilities.costPerToken) {
      const costScore = Math.max(0, 5 - (registration.capabilities.costPerToken * 10000));
      score += costScore;
    }

    return score;
  }

  /**
   * Update provider count
   */
  private updateProviderCount(provider: AgentProvider, delta: number): void {
    const current = this.providerCounts.get(provider) || 0;
    this.providerCounts.set(provider, current + delta);
  }

  /**
   * Update role assignment
   */
  private updateRoleAssignment(role: AgentRole, agentId: string, action: 'add' | 'remove'): void {
    const agents = this.roleAssignments.get(role) || [];
    
    if (action === 'add') {
      agents.push(agentId);
    } else {
      const index = agents.indexOf(agentId);
      if (index > -1) {
        agents.splice(index, 1);
      }
    }
    
    this.roleAssignments.set(role, agents);
  }
}