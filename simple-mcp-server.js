#!/usr/bin/env node

/**
 * Simple MCP Server for Claude Code Integration
 * Works with existing docker containers on different port
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

const NEURAL_AI_BASE_URL = 'http://localhost:5174';

class SimpleMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'neural-ai-collaboration',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_entities',
            description: 'Store knowledge in the shared memory system',
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
                        description: 'Array of observation contents'
                      }
                    },
                    required: ['name', 'entityType', 'observations']
                  }
                }
              },
              required: ['entities']
            }
          },
          {
            name: 'send_ai_message',
            description: 'Send a message to another AI agent',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'Target agent ID' },
                content: { type: 'string', description: 'Message content' },
                messageType: { 
                  type: 'string', 
                  enum: ['info', 'task', 'query', 'response', 'collaboration'],
                  description: 'Type of message'
                }
              },
              required: ['agentId', 'content', 'messageType']
            }
          },
          {
            name: 'get_ai_messages',
            description: 'Retrieve messages for an agent',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'Agent ID to get messages for' },
                limit: { type: 'number', description: 'Maximum number of messages to retrieve' }
              },
              required: ['agentId']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'create_entities':
            return await this.handleCreateEntities(request.params.arguments);
          case 'send_ai_message':
            return await this.handleSendMessage(request.params.arguments);
          case 'get_ai_messages':
            return await this.handleGetMessages(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async makeApiCall(endpoint, method = 'GET', data = null) {
    const url = `${NEURAL_AI_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async handleCreateEntities(args) {
    try {
      const result = await this.makeApiCall('/api/memory/store', 'POST', args);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully stored ${args.entities.length} entities in shared memory`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to store entities: ${error.message}`
          }
        ]
      };
    }
  }

  async handleSendMessage(args) {
    try {
      // Map MCP parameters to backend API format
      const mappedData = {
        from: 'claude-code-mcp',
        to: args.agentId,
        message: args.content,
        type: args.messageType || 'info'
      };
      
      const result = await this.makeApiCall('/ai-message', 'POST', mappedData);
      return {
        content: [
          {
            type: 'text',
            text: `Message sent to agent ${args.agentId}: ${args.content}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to send message: ${error.message}`
          }
        ]
      };
    }
  }

  async handleGetMessages(args) {
    try {
      const result = await this.makeApiCall(`/ai-messages/${args.agentId}${args.limit ? `?limit=${args.limit}` : ''}`);
      return {
        content: [
          {
            type: 'text',
            text: `Retrieved ${result.messages?.length || 0} messages for agent ${args.agentId}: ${JSON.stringify(result, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get messages: ${error.message}`
          }
        ]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Simple MCP Server for Neural AI Collaboration running on stdio');
  }
}

const server = new SimpleMCPServer();
server.run().catch(console.error);