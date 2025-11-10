# Unified MCP Tool Schemas

> Generated from src/shared/toolSchemas.ts (single source of truth).

### send_ai_message
Send messages to AI agents (direct, capability-based, or broadcast)

Parameters

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "string",
      "description": "Target AI agent ID (use \"*\" for broadcast)"
    },
    "agentId": {
      "type": "string",
      "description": "DEPRECATED: Target alias for `to`"
    },
    "from": {
      "type": "string",
      "description": "Sender agent ID (defaults to server/bridge identity)"
    },
    "content": {
      "type": "string",
      "description": "Message content"
    },
    "message": {
      "type": "string",
      "description": "DEPRECATED: Alias for `content`"
    },
    "toCapabilities": {
      "type": "array",
      "description": "Select recipients whose capabilities include ALL provided",
      "items": {
        "type": "string"
      }
    },
    "capabilities": {
      "type": "array",
      "description": "Alias for `toCapabilities`",
      "items": {
        "type": "string"
      }
    },
    "broadcast": {
      "type": "boolean",
      "description": "Send to all registered agents",
      "default": false
    },
    "excludeSelf": {
      "type": "boolean",
      "description": "Exclude sender when broadcasting/selecting",
      "default": true
    },
    "messageType": {
      "type": "string",
      "enum": [
        "info",
        "task",
        "query",
        "response",
        "collaboration"
      ],
      "description": "Type of message",
      "default": "info"
    },
    "priority": {
      "type": "string",
      "enum": [
        "low",
        "normal",
        "high",
        "urgent"
      ],
      "description": "Message priority",
      "default": "normal"
    }
  },
  "required": [
    "content"
  ]
}
```

### get_ai_messages
Retrieve messages for an AI agent with filtering and pagination

Parameters

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "string",
      "description": "AI agent ID to get messages for"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of messages",
      "default": 50
    },
    "messageType": {
      "type": "string",
      "enum": [
        "info",
        "task",
        "query",
        "response",
        "collaboration"
      ],
      "description": "Filter by message type"
    },
    "since": {
      "type": "string",
      "description": "ISO timestamp to get messages since"
    }
  },
  "required": [
    "agentId"
  ]
}
```

### register_agent
Register a new AI agent in the collaboration system

Parameters

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "string",
      "description": "Unique agent identifier"
    },
    "name": {
      "type": "string",
      "description": "Human-readable agent name"
    },
    "capabilities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "List of agent capabilities"
    },
    "endpoint": {
      "type": "string",
      "description": "Agent communication endpoint"
    },
    "metadata": {
      "type": "object",
      "description": "Additional agent metadata"
    }
  },
  "required": [
    "agentId",
    "name",
    "capabilities"
  ]
}
```

### get_agent_status
Get comprehensive status and health information for AI agents

Parameters

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "string",
      "description": "Specific agent ID, or omit for all agents"
    }
  }
}
```

