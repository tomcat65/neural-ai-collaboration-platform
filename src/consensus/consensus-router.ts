interface ConsensusRoute {
  pattern: string;
  nodeType: 'raft-leader' | 'raft-follower' | 'websocket-node' | 'high-performance';
  conditions: {
    messageSize?: { min?: number; max?: number };
    operationType?: string[];
    urgency?: 'low' | 'medium' | 'high';
  };
}

interface ConsensusOperation {
  id: string;
  type: string;
  data: any;
  urgency: 'low' | 'medium' | 'high';
  size: number;
}

export default class ConsensusRouter {
  private routes: ConsensusRoute[] = [];
  
  constructor() {
    this.initializeDefaultRoutes();
  }
  
  private initializeDefaultRoutes() {
    this.routes = [
      {
        pattern: 'urgent/*',
        nodeType: 'high-performance',
        conditions: { urgency: 'high' }
      },
      {
        pattern: 'consensus/raft/*',
        nodeType: 'raft-leader',
        conditions: { operationType: ['consensus', 'leadership'] }
      },
      {
        pattern: 'message/*',
        nodeType: 'websocket-node',
        conditions: { messageSize: { max: 1000 } }
      }
    ];
  }
  
  async routeConsensusOperation(operation: ConsensusOperation): Promise<string> {
    const startTime = Date.now();
    
    for (const route of this.routes) {
      if (this.matchesRoute(operation, route)) {
        const routingTime = Date.now() - startTime;
        console.log(`🔀 Routed ${operation.type} to ${route.nodeType} in ${routingTime}ms`);
        return route.nodeType;
      }
    }
    
    return 'websocket-node'; // Default fallback
  }
  
  private matchesRoute(operation: ConsensusOperation, route: ConsensusRoute): boolean {
    // Pattern matching logic
    const patternRegex = new RegExp(route.pattern.replace('*', '.*'));
    if (!patternRegex.test(operation.type)) return false;
    
    // Condition matching
    const { conditions } = route;
    if (conditions.urgency && !conditions.urgency.includes(operation.urgency)) return false;
    if (conditions.messageSize) {
      if (conditions.messageSize.min && operation.size < conditions.messageSize.min) return false;
      if (conditions.messageSize.max && operation.size > conditions.messageSize.max) return false;
    }
    
    return true;
  }
  
  addRoute(route: ConsensusRoute) {
    this.routes.unshift(route); // Add to front for priority
  }
  
  getStats() {
    return {
      totalRoutes: this.routes.length,
      routeTypes: this.routes.map(r => r.nodeType)
    };
  }
}