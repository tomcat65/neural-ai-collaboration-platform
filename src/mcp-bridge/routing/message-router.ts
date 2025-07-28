/**
 * Message Router
 * Intelligent routing of messages between agents based on capabilities and rules
 */

import {
  AgentIdentifier,
  AgentRole,
  MCPMessage,
  MessageType,
  RoutingRule,
  RoutingCondition,
  AgentProvider
} from '../types';
import { AgentRegistry } from '../registry/agent-registry';

export type RoutingStrategy = 'round-robin' | 'least-loaded' | 'skill-based' | 'cost-optimized';

export class MessageRouter {
  private rules: RoutingRule[] = [];
  private roundRobinCounters: Map<string, number> = new Map();
  private loadCounters: Map<string, number> = new Map();

  constructor(
    private registry: AgentRegistry,
    private defaultStrategy: RoutingStrategy = 'skill-based'
  ) {}

  /**
   * Route a message to appropriate agents
   */
  async route(message: MCPMessage): Promise<AgentIdentifier[]> {
    // Check for explicit targeting first
    if (message.to && !Array.isArray(message.to)) {
      return [message.to];
    }

    if (message.to && Array.isArray(message.to)) {
      return message.to;
    }

    // Apply routing rules
    const ruleBasedTargets = await this.applyRules(message);
    if (ruleBasedTargets.length > 0) {
      return ruleBasedTargets;
    }

    // Use default strategy
    return await this.routeByStrategy(message, this.defaultStrategy);
  }

  /**
   * Add a routing rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.sortRules();
  }

  /**
   * Remove a routing rule
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Update a routing rule
   */
  updateRule(ruleId: string, updates: Partial<RoutingRule>): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this.sortRules();
    }
  }

  /**
   * Get all routing rules
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Route message using specific strategy
   */
  private async routeByStrategy(message: MCPMessage, strategy: RoutingStrategy): Promise<AgentIdentifier[]> {
    switch (strategy) {
      case 'round-robin':
        return await this.routeRoundRobin(message);
      case 'least-loaded':
        return await this.routeLeastLoaded(message);
      case 'skill-based':
        return await this.routeSkillBased(message);
      case 'cost-optimized':
        return await this.routeCostOptimized(message);
      default:
        throw new Error(`Unknown routing strategy: ${strategy}`);
    }
  }

  /**
   * Apply routing rules to message
   */
  private async applyRules(message: MCPMessage): Promise<AgentIdentifier[]> {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (await this.matchesCondition(message, rule.condition)) {
        return await this.resolveTarget(rule.target);
      }
    }

    return [];
  }

  /**
   * Check if message matches routing condition
   */
  private async matchesCondition(message: MCPMessage, condition: RoutingCondition): Promise<boolean> {
    // Check message type
    if (condition.messageType && !condition.messageType.includes(message.type)) {
      return false;
    }

    // Check skills (for task requests)
    if (condition.skills && message.type === MessageType.TASK_REQUEST) {
      const taskContent = message.content as { requirements?: { skills?: string[] } };
      const messageSkills = taskContent.requirements?.skills || [];
      const hasRequiredSkills = condition.skills.some(skill => messageSkills.includes(skill));
      if (!hasRequiredSkills) {
        return false;
      }
    }

    // Check provider
    if (condition.provider && !condition.provider.includes(message.from.provider)) {
      return false;
    }

    // Check custom condition
    if (condition.custom && !condition.custom(message)) {
      return false;
    }

    return true;
  }

  /**
   * Resolve routing target to actual agents
   */
  private async resolveTarget(target: AgentIdentifier | AgentRole): Promise<AgentIdentifier[]> {
    if (typeof target === 'object') {
      // Specific agent
      const registration = this.registry.getAgent(target.id);
      return registration ? [target] : [];
    } else {
      // Role-based targeting
      const agentsWithRole = this.registry.getByRole(target);
      return agentsWithRole.map(reg => reg.agent);
    }
  }

  /**
   * Round-robin routing
   */
  private async routeRoundRobin(message: MCPMessage): Promise<AgentIdentifier[]> {
    const availableAgents = this.registry.getAvailableAgents();
    if (availableAgents.length === 0) {
      return [];
    }

    const key = `${message.type}-${message.from.provider}`;
    const counter = this.roundRobinCounters.get(key) || 0;
    const selectedAgent = availableAgents[counter % availableAgents.length];
    
    this.roundRobinCounters.set(key, counter + 1);
    
    return [selectedAgent.agent];
  }

  /**
   * Least-loaded routing
   */
  private async routeLeastLoaded(message: MCPMessage): Promise<AgentIdentifier[]> {
    const availableAgents = this.registry.getAvailableAgents();
    if (availableAgents.length === 0) {
      return [];
    }

    // Find agent with lowest load
    let minLoad = Infinity;
    let selectedAgent = availableAgents[0];

    for (const agent of availableAgents) {
      const load = this.loadCounters.get(agent.agent.id) || 0;
      if (load < minLoad) {
        minLoad = load;
        selectedAgent = agent;
      }
    }

    // Increment load counter
    const currentLoad = this.loadCounters.get(selectedAgent.agent.id) || 0;
    this.loadCounters.set(selectedAgent.agent.id, currentLoad + 1);

    return [selectedAgent.agent];
  }

  /**
   * Skill-based routing
   */
  private async routeSkillBased(message: MCPMessage): Promise<AgentIdentifier[]> {
    // Extract required skills from message
    const requiredSkills = this.extractRequiredSkills(message);
    
    if (requiredSkills.length === 0) {
      // Fallback to round-robin if no skills specified
      return await this.routeRoundRobin(message);
    }

    // Find best matching agent
    const bestAgent = this.registry.findBestAgent({
      skills: requiredSkills
    });

    return bestAgent ? [bestAgent.agent] : [];
  }

  /**
   * Cost-optimized routing
   */
  private async routeCostOptimized(message: MCPMessage): Promise<AgentIdentifier[]> {
    const requiredSkills = this.extractRequiredSkills(message);
    const availableAgents = this.registry.getAvailableAgents();

    if (availableAgents.length === 0) {
      return [];
    }

    // Filter agents that can handle the task
    const capableAgents = availableAgents.filter(agent => {
      if (requiredSkills.length === 0) return true;
      
      return requiredSkills.some(skill =>
        agent.capabilities.specializations.includes(skill)
      );
    });

    if (capableAgents.length === 0) {
      return [];
    }

    // Sort by cost (lowest first)
    capableAgents.sort((a, b) => {
      const costA = a.capabilities.costPerToken || 0;
      const costB = b.capabilities.costPerToken || 0;
      return costA - costB;
    });

    return [capableAgents[0].agent];
  }

  /**
   * Extract required skills from message
   */
  private extractRequiredSkills(message: MCPMessage): string[] {
    switch (message.type) {
      case MessageType.TASK_REQUEST:
        const taskContent = message.content as { requirements?: { skills?: string[] } };
        return taskContent.requirements?.skills || [];
      
      case MessageType.KNOWLEDGE_SHARE:
        const knowledgeContent = message.content as { tags?: string[] };
        return knowledgeContent.tags || [];
      
      default:
        return [];
    }
  }

  /**
   * Sort rules by priority (highest first)
   */
  private sortRules(): void {
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Reset load counters (should be called periodically)
   */
  resetLoadCounters(): void {
    this.loadCounters.clear();
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return {
      rulesCount: this.rules.length,
      activeRules: this.rules.filter(r => r.enabled).length,
      loadCounters: Object.fromEntries(this.loadCounters),
      roundRobinCounters: Object.fromEntries(this.roundRobinCounters)
    };
  }

  /**
   * Create a default routing rule for a message type
   */
  static createDefaultRule(
    messageType: MessageType,
    targetRole: AgentRole,
    priority: number = 50
  ): RoutingRule {
    return {
      id: `default-${messageType}-${targetRole}`,
      name: `Default ${messageType} to ${targetRole}`,
      condition: {
        messageType: [messageType]
      },
      target: targetRole,
      priority,
      enabled: true
    };
  }

  /**
   * Create a skill-based routing rule
   */
  static createSkillRule(
    skills: string[],
    targetRole: AgentRole,
    priority: number = 75
  ): RoutingRule {
    return {
      id: `skill-${skills.join('-')}-${targetRole}`,
      name: `Route ${skills.join(', ')} to ${targetRole}`,
      condition: {
        skills
      },
      target: targetRole,
      priority,
      enabled: true
    };
  }

  /**
   * Create a provider-specific routing rule
   */
  static createProviderRule(
    provider: AgentProvider,
    targetAgent: AgentIdentifier,
    priority: number = 60
  ): RoutingRule {
    return {
      id: `provider-${provider}-${targetAgent.id}`,
      name: `Route ${provider} messages to ${targetAgent.id}`,
      condition: {
        provider: [provider]
      },
      target: targetAgent,
      priority,
      enabled: true
    };
  }
}