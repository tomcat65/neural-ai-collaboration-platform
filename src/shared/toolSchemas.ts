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
              aliases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional natural-language aliases that should resolve to this canonical entity',
              },
              agentBootstrap: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional agent-facing bootstrap instructions for future sessions',
              },
              metadata: { type: 'object', description: 'Optional structured metadata for agent consumers' },
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
        agentId: {
          type: 'string',
          description: 'Optional source agent ID for observation attribution. This is accepted inside the operator/API-key trust boundary and becomes shared_memory.created_by; Phase C gate evidence also requires operator-pinned observation IDs and exact hash/scope bindings.',
        },
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
              },
              metadata: {
                type: 'object',
                description: 'Optional structured metadata for agents, e.g. {kind, canonicalFact, supersedes, appliesTo, severity, status}',
              },
              kind: { type: 'string', description: 'Optional shorthand for metadata.kind, e.g. correction, handoff, decision' },
              canonicalFact: { type: 'string', description: 'Optional shorthand for metadata.canonicalFact when kind=correction' },
              supersedes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional observation IDs or handles superseded by this observation',
              },
              appliesTo: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional entity names this observation/correction applies to',
              },
              severity: { type: 'string', description: 'Optional agent-facing importance, e.g. low, normal, high, critical' },
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
    description: 'Retrieve messages for an AI agent with filtering and pagination. IMPORTANT: For routine inbox checks, just pass agentId — the defaults (unreadOnly: true, compact: true, limit: 5) will return your latest unread messages. Do NOT use the since filter for inbox checks; it often causes missed messages when the timestamp is stale. SHARED INBOX NOTE: When monitoring another agent\'s inbox (e.g. claude-desktop checking codex), use unreadOnly: false — the target agent marks its own messages read during execution, so unreadOnly: true returns 0.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'AI agent ID to get messages for' },
        from: { type: 'string', description: 'Filter by sender agent ID (e.g. "codex", "claude-code-sm")' },
        limit: { type: 'number', description: 'Maximum number of messages (server hard cap: 20)', default: 5 },
        messageType: {
          type: 'string',
          enum: ['info', 'task', 'query', 'response', 'collaboration'],
          description: 'Filter by message type'
        },
        since: { type: 'string', description: 'ADVANCED ONLY — ISO timestamp for time-range queries. Do NOT use for routine inbox checks; use unreadOnly instead. A stale timestamp will cause missed messages.' },
        unreadOnly: { type: 'boolean', description: 'Only return unread messages (default: true). This is the recommended way to check your inbox. Set to false when monitoring a shared inbox — other agents mark their own messages read.', default: true },
        compact: { type: 'boolean', description: 'Return summaries only without full content (use get_message_detail for full content)', default: true },
        markAsRead: { type: 'boolean', description: 'Mark returned messages as read after retrieval', default: false },
        includeArchived: { type: 'boolean', description: 'Include archived messages in results (excluded by default)', default: false }
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
        agentId: { type: 'string', description: 'Specific agent ID, or omit for all agents' },
        groupByCanonical: {
          type: 'boolean',
          description: 'Include canonical-agent rollups and aliases in addition to raw registrations',
          default: true,
        },
        limit: {
          type: 'number',
          description: 'Max raw registrations to return when listing all agents (server hard cap: 200). The canonical-agent rollup always covers ALL registrations regardless of this limit.',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Skip this many raw registrations for pagination (use nextOffset from a previous response).',
          default: 0,
        }
      }
    }
  },
  search_entities: {
    name: 'search_entities',
    description: 'Advanced federated search across graph, vectors, and cache. Returns compact summaries by default (use get_entity_detail for full content). Supports pagination via offset/nextOffset and filtering by memoryType/agentFilter.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query against names, types, observations' },
        searchType: { type: 'string', enum: ['semantic', 'exact', 'graph', 'hybrid'], default: 'hybrid' },
        limit: { type: 'number', description: 'Maximum number of results per page', default: 50 },
        compact: { type: 'boolean', description: 'Return compact summaries for large entities (use get_entity_detail for full content)', default: true },
        offset: { type: 'number', description: 'Skip this many results for pagination (use nextOffset from previous response)', default: 0 },
        maxResponseSize: { type: 'number', description: 'Maximum response size in characters (budget enforcement)', default: 40000 },
        memoryType: { type: 'string', description: 'Filter results by memory type (e.g. "individual", "shared")' },
        agentFilter: { type: 'string', description: 'Filter results by agent/source ID' },
        includeRedundantRepresentations: {
          type: 'boolean',
          description: 'Include dual-storage representations that are hidden by default, such as an entity row matched only through embedded inline observation text when the materialized observation row is also returned',
          default: false
        }
      },
      required: ['query']
    }
  },
  inspect_identity_candidates: {
    name: 'inspect_identity_candidates',
    description: 'Pass 2.0 Phase A read-only inventory/dry-run producer for duplicate canonical entity keys. Produces a reviewable report and may record exactly one pass2_dry_run audit row for the canonical-form report hash.',
    inputSchema: {
      type: 'object',
      properties: {
        canonicalKey: {
          type: 'string',
          description: 'Optional canonical entity key or entity name to inspect. When omitted, scans duplicate canonical-key groups.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of candidate groups to return',
          default: 50,
        },
        minGroupSize: {
          type: 'number',
          description: 'Minimum entity rows per canonical-key group',
          default: 2,
        },
        includeSingletons: {
          type: 'boolean',
          description: 'Include single-row canonical-key groups. Useful only for diagnostics.',
          default: false,
        },
        recordAudit: {
          type: 'boolean',
          description: 'If true, write exactly one neural_audit_log row with operation pass2_dry_run and the canonical-form report hash. No domain tables are mutated.',
          default: false,
        },
        saveArtifact: {
          type: 'boolean',
          description: 'If true, save the dry-run report JSON to artifactDir. Filesystem artifact writes do not mutate Neural domain tables.',
          default: false,
        },
        artifactDir: {
          type: 'string',
          description: 'Directory for saved dry-run JSON artifacts when saveArtifact is true. Defaults to data/pass2-dry-runs.',
        },
      },
    }
  },
  get_entity_context: {
    name: 'get_entity_context',
    description: 'Pass 2.0 Phase B read-only identity-oriented context over legacy shared_memory plus a signed Phase A dry-run projection.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Human entity name, alias, canonical key, or lookup term. Required unless identityId is provided.',
        },
        identityId: {
          type: 'string',
          description: 'Optional persisted Phase C identity id. If both identityId and query are present, identityId wins.',
        },
        tenantId: { type: 'string', description: 'Tenant id. Defaults to request context tenant/default.' },
        sections: {
          type: 'array',
          items: { type: 'string', enum: ['identity', 'observations', 'relations', 'facets', 'legacyBootstrap'] },
          description: 'Sections to assemble. Defaults to identity, observations, relations, facets, and legacyBootstrap.',
        },
        observationLimit: { type: 'number', default: 25, description: 'Maximum observations to return, capped at 100.' },
        observationOffset: { type: 'number', default: 0, description: 'Observation pagination offset.' },
        observationKindFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional metadata.kind values to include.',
        },
        relationLimit: { type: 'number', default: 25, description: 'Maximum relations to return, capped at 100.' },
        relationOffset: { type: 'number', default: 0, description: 'Relation pagination offset.' },
        relationTypeFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional sourceRelationType or semanticRelationType values to include.',
        },
        facetLimit: { type: 'number', default: 25, description: 'Accepted for Phase C compatibility; Phase B returns no facet items.' },
        facetOffset: { type: 'number', default: 0, description: 'Accepted for Phase C compatibility; Phase B returns no facet items.' },
        facetTypeFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Accepted for Phase C compatibility; Phase B projected facets remain in provenance only.',
        },
        maxTokens: { type: 'number', default: 8000, description: 'Hard token budget for assembled context, bounded between 500 and 50000.' },
        since: {
          type: 'string',
          description: 'ISO timestamp. Includes observations and relation rows whose recorded/created timestamp is at or after this value.',
        },
        includeLegacyEmbedded: { type: 'boolean', default: false, description: 'Include legacy inline entity observations as observation items.' },
        includeFacets: { type: 'boolean', default: true, description: 'Include projected facet metadata in provenance. Phase B facets.items remains empty.' },
        includeCandidates: { type: 'boolean', default: true, description: 'Include unresolved resolution candidates.' },
        includeLegacyRowCounts: { type: 'boolean', default: true, description: 'Include diagnostic legacy row counts.' },
        excludeLifecycleStatus: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional lifecycle statuses to exclude from candidates. Closed projects are not excluded by default.',
        },
        dryRunArtifactPath: {
          type: 'string',
          description: 'Optional dev/test artifact path. The artifact must still match a signed pass2_dry_run audit row.',
        },
        dryRunHash: {
          type: 'string',
          description: 'Optional dev/test expected canonical hash. It must match a signed pass2_dry_run audit row.',
        },
      },
      additionalProperties: true,
    }
  },
  execute_pass2_phase_c: {
    name: 'execute_pass2_phase_c',
    description: 'Pass 2.0 Phase C guarded identity/facet/link migration tool. Supports plan, non-production rehearsal, and production execute only when operator-pinned evidence IDs, exact approval, reviewer PASS, and rollback rehearsal evidence are validated.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['plan', 'execute', 'rollback', 'verify'],
          default: 'plan',
          description: 'Phase C action. Production execute is enabled only when the operator switch, exact dry-run hash, operator-pinned approval/rehearsal/reviewer evidence IDs, live plan output, rollback rehearsal evidence, reviewer PASS, and fresh exact-scope execute approval gates are complete.',
        },
        tenantId: { type: 'string', description: 'Tenant id. Defaults to request context tenant/default.' },
        dryRunHash: {
          type: 'string',
          description: 'Canonical-form sha256 of the signed Phase A dry-run artifact. Required for production plan/execute.',
        },
        dryRunArtifactPath: {
          type: 'string',
          description: 'Optional artifact path. If dryRunHash is supplied, the artifact must match that exact signed hash.',
        },
        canonicalKeys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional allowlist of canonical keys for diagnostics/canary planning.',
        },
        approvalObservationId: {
          type: 'string',
          description: 'Required for production execute. Must identify a fresh Phase C production_execute_approval observation from a trusted creator/approver, bound to the exact dryRunHash and scope.',
        },
        requireRollbackRehearsal: {
          type: 'boolean',
          default: true,
          description: 'Production execute gate. Production execute requires rollback rehearsal evidence.',
        },
        executionMode: {
          type: 'string',
          enum: ['test', 'rehearsal', 'production'],
          description: 'Optional context marker. Production writes require executionMode=production plus validated approval and rollback rehearsal evidence.',
        },
        rollbackOwnerAuditId: {
          type: 'string',
          description: 'Future rollback handle. Must be a unique Phase C owner audit row id, not a dry-run content hash.',
        },
        deactivatedBy: {
          type: 'string',
          default: 'codex-desktop',
          description: 'Future rollback actor id.',
        },
      },
    },
  },
  get_agent_context: {
    name: 'get_agent_context',
    description: 'Retrieve a tiered context bundle for an agent, optionally scoped to a project. Returns identity, project state, unread messages, guardrails, and handoff flags.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to build context for' },
        projectId: { type: 'string', description: 'Optional project scope (enables WARM/COLD tiers and handoff flag)' },
        depth: {
          type: 'string',
          enum: ['hot', 'warm', 'cold'],
          description: 'Context depth: hot (identity+messages+guardrails), warm (hot+project 30d), cold (everything). Defaults to warm if projectId provided, else hot.',
        },
        maxTokens: {
          type: 'number',
          description: 'Hard token budget ceiling. Context is trimmed by priority if exceeded. Default: 4000.',
          default: 4000
        },
        userId: { type: 'string', description: 'Optional user ID to include HOT tier user profile block. Overridden by JWT userId when authenticated.' }
      },
      required: ['agentId']
    }
  },
  begin_session: {
    name: 'begin_session',
    description: 'Open a project session for an agent. Loads context bundle, returns handoff flag from previous session, creates project skeleton if missing, and posts Slack notification.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent opening the session' },
        projectId: { type: 'string', description: 'Project to open a session for' },
        maxTokens: {
          type: 'number',
          description: 'Hard token budget ceiling for the returned context. Default: 4000.',
          default: 4000
        },
        userId: { type: 'string', description: 'Optional user ID for user-scoped context. Overridden by JWT userId when authenticated.' }
      },
      required: ['agentId', 'projectId']
    }
  },
  end_session: {
    name: 'end_session',
    description: 'Close a project session. Writes a handoff flag for the next session, records learnings, and posts Slack notification.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent closing the session' },
        projectId: { type: 'string', description: 'Project to close the session for' },
        summary: { type: 'string', description: 'Summary of what was accomplished this session' },
        openItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'Open items to hand off to the next session'
        },
        learnings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              context: { type: 'string' },
              lesson: { type: 'string' },
              confidence: { type: 'number' }
            },
            required: ['context', 'lesson']
          },
          description: 'Learnings to record from this session'
        }
      },
      required: ['agentId', 'projectId', 'summary']
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
  // Task 1100: User profile tools
  get_user_profile: {
    name: 'get_user_profile',
    description: 'Get a user profile within the current tenant. Returns timezone, locale, preferences.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to retrieve profile for. Must match authenticated user (JWT) or be provided by service key.' }
      },
      required: ['userId']
    }
  },
  update_user_profile: {
    name: 'update_user_profile',
    description: 'Update a user profile. Only the profile owner (or a service key) can update. Bumps prefs_version.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID to update. Must match authenticated user (JWT) or be provided by service key.' },
        displayName: { type: 'string', description: 'Display name' },
        timezone: { type: 'string', description: 'IANA timezone string (e.g., America/Chicago)' },
        locale: { type: 'string', description: 'Locale string (e.g., en-US)' },
        dateFormat: { type: 'string', description: 'Date format preference' },
        units: { type: 'string', description: 'Unit system (metric/imperial)' },
        workingHours: {
          type: 'object',
          description: 'Working hours { start, end }',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          }
        }
      },
      required: ['userId']
    }
  },
  // Message Hygiene: Single message detail retrieval
  get_message_detail: {
    name: 'get_message_detail',
    description: 'Retrieve the full content of a single message by ID. Use after scanning compact message list from get_ai_messages.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The message ID to retrieve full content for' },
        agentId: { type: 'string', description: 'Agent ID (recipient) — required to prove recipient identity' },
        markAsRead: { type: 'boolean', description: 'Mark this message as read after retrieval', default: true }
      },
      required: ['messageId', 'agentId']
    }
  },
  // Entity detail retrieval (companion to search_entities compact mode)
  get_entity_detail: {
    name: 'get_entity_detail',
    description: 'Retrieve full content for specific entities by ID. Use after scanning compact results from search_entities.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entity IDs to retrieve (max 5)',
          maxItems: 5
        },
        maxTotalSize: { type: 'number', description: 'Maximum total response size in characters', default: 80000 }
      },
      required: ['ids']
    }
  },
  // Task 1200: Message lifecycle tools
  mark_messages_read: {
    name: 'mark_messages_read',
    description: 'Mark specific messages or all unread messages for an agent as read',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent whose messages to mark as read' },
        messageIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific message IDs to mark as read. If omitted, marks all unread messages for the agent.'
        }
      },
      required: ['agentId']
    }
  },
  archive_messages: {
    name: 'archive_messages',
    description: 'Archive messages older than N days for an agent. Archived messages are excluded from get_ai_messages by default.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent whose messages to archive' },
        olderThanDays: { type: 'number', description: 'Archive messages older than this many days', default: 30 }
      },
      required: ['agentId', 'olderThanDays']
    }
  },

  // === KNOWLEDGE GRAPH MUTATIONS (Phase A) ===
  delete_entity: {
    name: 'delete_entity',
    description: 'Delete an entity and cascade-delete its observations and relations from the knowledge graph. Requires admin-equivalent authorization.',
    inputSchema: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Name of the entity to delete (case-insensitive match)' },
        dryRun: { type: 'boolean', description: 'If true, return targets without executing deletion', default: false },
        reason: { type: 'string', description: 'Reason for deletion (recorded in audit log)' },
      },
      required: ['entityName'],
    },
  },
  remove_observations: {
    name: 'remove_observations',
    description: 'Remove specific observations from an entity by ID or content match. Requires admin-equivalent authorization.',
    inputSchema: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Entity the observations belong to (case-insensitive match)' },
        observationIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific observation row IDs to remove',
        },
        containsAny: {
          type: 'array',
          items: { type: 'string' },
          description: 'Remove observations whose content contains any of these substrings (case-insensitive, special chars escaped)',
        },
        dryRun: { type: 'boolean', description: 'If true, return targets without executing deletion', default: false },
        reason: { type: 'string', description: 'Reason for removal (recorded in audit log)' },
      },
      required: ['entityName'],
    },
  },
  update_observation: {
    name: 'update_observation',
    description: 'Update the content of a specific observation. Runs sanitizer for parity with create/add paths. Requires admin-equivalent authorization.',
    inputSchema: {
      type: 'object',
      properties: {
        observationId: { type: 'string', description: 'Row ID of the observation to update' },
        contentIndex: { type: 'number', description: 'Index within the contents array to replace (default: replaces entire content)' },
        newContent: { type: 'string', description: 'New content string' },
        reason: { type: 'string', description: 'Reason for update (recorded in audit log)' },
      },
      required: ['observationId', 'newContent'],
    },
  },
  delete_observations_by_entity: {
    name: 'delete_observations_by_entity',
    description: 'Delete ALL observations for a given entity. Requires admin-equivalent authorization.',
    inputSchema: {
      type: 'object',
      properties: {
        entityName: { type: 'string', description: 'Entity name whose observations to delete (case-insensitive match)' },
        dryRun: { type: 'boolean', description: 'If true, return targets without executing deletion', default: false },
        reason: { type: 'string', description: 'Reason for deletion (recorded in audit log)' },
      },
      required: ['entityName'],
    },
  },
};

export const getUnifiedToolDefinitions = (...names: (keyof typeof UnifiedToolSchemas)[]): ToolDefinition[] => {
  if (names.length === 0) return Object.values(UnifiedToolSchemas);
  return names.map((n) => UnifiedToolSchemas[n]);
};
