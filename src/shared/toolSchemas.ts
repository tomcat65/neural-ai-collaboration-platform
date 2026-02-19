export type JSONSchema = Record<string, any>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

// Unified tool input schemas used by both MCP servers
export const UnifiedToolSchemas: Record<string, ToolDefinition> = {
  create_entities: {
    name: 'create_entities',
    description: 'Create multiple new entities in the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'The name of the entity' },
              entityType: { type: 'string', description: 'The type of the entity' },
              observations: {
                type: 'array',
                items: { type: 'string' },
                description: 'An array of observation contents associated with the entity',
              },
            },
            required: ['name', 'entityType', 'observations'],
          },
        },
      },
      required: ['entities'],
    }
  },
  add_observations: {
    name: 'add_observations',
    description: 'Add new observations to existing entities with automatic vector embedding and graph updates',
    inputSchema: {
      type: 'object',
      properties: {
        observations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityName: { type: 'string', description: 'The name of the entity to add the observations to' },
              contents: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'An array of observation contents to add' 
              }
            },
            required: ['entityName', 'contents']
          }
        }
      },
      required: ['observations']
    }
  },
  create_relations: {
    name: 'create_relations',
    description: 'Create multiple new relations between entities in the knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        relations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'The name of the entity where the relation starts' },
              to: { type: 'string', description: 'The name of the entity where the relation ends' },
              relationType: { type: 'string', description: 'The type of the relation' },
              properties: { type: 'object', description: 'Optional relation properties' }
            },
            required: ['from', 'to', 'relationType']
          }
        }
      },
      required: ['relations']
    }
  },
  read_graph: {
    name: 'read_graph',
    description: 'Read the entire knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  send_ai_message: {
    name: 'send_ai_message',
    description: 'Send messages to AI agents (direct, capability-based, or broadcast)',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target AI agent ID (use "*" for broadcast)' },
        agentId: { type: 'string', description: 'DEPRECATED: Target alias for `to`' },
        from: { type: 'string', description: 'Sender agent ID (required for correct attribution)' },
        content: { type: 'string', description: 'Message content' },
        message: { type: 'string', description: 'DEPRECATED: Alias for `content`' },
        toCapabilities: {
          type: 'array',
          description: 'Select recipients whose capabilities include ALL provided',
          items: { type: 'string' }
        },
        capabilities: {
          type: 'array',
          description: 'Alias for `toCapabilities`',
          items: { type: 'string' }
        },
        broadcast: { type: 'boolean', description: 'Send to all registered agents', default: false },
        excludeSelf: { type: 'boolean', description: 'Exclude sender when broadcasting/selecting', default: true },
        messageType: { 
          type: 'string', 
          enum: ['info', 'task', 'query', 'response', 'collaboration'],
          description: 'Type of message',
          default: 'info'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Message priority',
          default: 'normal'
        }
      },
      required: ['content', 'from']
    }
  },
  get_ai_messages: {
    name: 'get_ai_messages',
    description: 'Retrieve messages for an AI agent with filtering and pagination',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'AI agent ID to get messages for' },
        limit: { type: 'number', description: 'Maximum number of messages', default: 50 },
        messageType: {
          type: 'string',
          enum: ['info', 'task', 'query', 'response', 'collaboration'],
          description: 'Filter by message type'
        },
        since: { type: 'string', description: 'ISO timestamp to get messages since' },
        unreadOnly: { type: 'boolean', description: 'Only return messages that have not been read yet', default: false },
        markAsRead: { type: 'boolean', description: 'Mark returned messages as read after retrieval', default: false }
      },
      required: ['agentId']
    }
  },
  register_agent: {
    name: 'register_agent',
    description: 'Register a new AI agent in the collaboration system',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Unique agent identifier' },
        name: { type: 'string', description: 'Human-readable agent name' },
        capabilities: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of agent capabilities'
        },
        endpoint: { type: 'string', description: 'Agent communication endpoint' },
        metadata: { type: 'object', description: 'Additional agent metadata' }
      },
      required: ['agentId', 'name', 'capabilities']
    }
  },
  set_agent_identity: {
    name: 'set_agent_identity',
    description: 'Update an agent\'s public identity and optionally re-register the MCP bridge automatically',
    inputSchema: {
      type: 'object',
      properties: {
        currentAgentId: { type: 'string', description: 'Existing agent identifier (defaults to caller)' },
        newAgentId: { type: 'string', description: 'Replacement agent identifier' },
        newName: { type: 'string', description: 'Replacement agent display name' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional capability list to upsert during identity update'
        },
        metadata: { type: 'object', description: 'Optional metadata to store alongside the identity change' },
        autoRegister: {
          type: 'boolean',
          description: 'Automatically re-register the MCP bridge with the new identity',
          default: true
        }
      },
      required: ['newAgentId']
    }
  },
  get_agent_status: {
    name: 'get_agent_status',
    description: 'Get comprehensive status and health information for AI agents',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Specific agent ID, or omit for all agents' }
      }
    }
  },
  search_entities: {
    name: 'search_entities',
    description: 'Advanced federated search across graph, vectors, and cache',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query against names, types, observations' },
        searchType: { type: 'string', enum: ['semantic', 'exact', 'graph', 'hybrid'], default: 'hybrid' },
        limit: { type: 'number', description: 'Maximum number of results', default: 50 }
      },
      required: ['query']
    }
  },
  search_nodes: {
    name: 'search_nodes',
    description: 'DEPRECATED alias for graph-only search; use search_entities with { searchType: "graph" }',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to match' }
      },
      required: ['query']
    }
  },
};

export const getUnifiedToolDefinitions = (...names: (keyof typeof UnifiedToolSchemas)[]): ToolDefinition[] => {
  if (names.length === 0) return Object.values(UnifiedToolSchemas);
  return names.map((n) => UnifiedToolSchemas[n]);
};
