#!/usr/bin/env node

const http = require('http');
const readline = require('readline');

// Create readline interface for STDIO
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Track message IDs to handle async responses
const pendingRequests = new Map();
let nextId = 1;

// Handle incoming STDIO messages from Cursor
rl.on('line', (line) => {
  if (!line.trim()) return;
  
  try {
    // Parse the JSON-RPC message from Cursor
    const message = JSON.parse(line);
    
    // Store original ID for response mapping
    const originalId = message.id;
    
    // Handle initialization specially
    if (message.method === 'initialize') {
      // Return our own initialization response
      const response = {
        jsonrpc: '2.0',
        id: originalId,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: 'neural-ai-collaboration',
            version: '1.0.0'
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      
      // Also forward to server to initialize it
      const serverMessage = {...message};
      serverMessage.id = nextId++;
      pendingRequests.set(serverMessage.id, {originalId, isInit: true});
      
      const postData = JSON.stringify(serverMessage);
      const options = {
        hostname: 'localhost',
        port: 6174,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Server initialized, but we already responded to Cursor
        });
      });
      req.on('error', () => {});
      req.write(postData);
      req.end();
      return;
    }
    
    // Handle notifications (no response needed)
    if (message.method === 'notifications/initialized') {
      return; // Just acknowledge silently
    }
    
    // Handle prompts/list
    if (message.method === 'prompts/list') {
      const response = {
        jsonrpc: '2.0',
        id: originalId,
        result: { prompts: [] }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }
    
    // Handle resources/list
    if (message.method === 'resources/list') {
      const response = {
        jsonrpc: '2.0',
        id: originalId,
        result: { resources: [] }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }
    
    // Forward all other messages to HTTP MCP server
    const serverMessage = {...message};
    if (originalId !== undefined) {
      serverMessage.id = nextId++;
      pendingRequests.set(serverMessage.id, {originalId, isInit: false});
    }
    
    const postData = JSON.stringify(serverMessage);
    
    const options = {
      hostname: 'localhost',
      port: 6174,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          // Map server ID back to Cursor's original ID
          if (response.id !== undefined && pendingRequests.has(response.id)) {
            const {originalId, isInit} = pendingRequests.get(response.id);
            if (!isInit) { // Don't send duplicate init response
              response.id = originalId;
              process.stdout.write(JSON.stringify(response) + '\n');
            }
            pendingRequests.delete(response.id);
          } else {
            // Send as-is if no mapping
            process.stdout.write(data + '\n');
          }
        } catch (e) {
          // If not JSON, send as-is
          process.stdout.write(data + '\n');
        }
      });
    });
    
    req.on('error', (error) => {
      if (originalId !== undefined) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: originalId,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });
    
    req.write(postData);
    req.end();
    
  } catch (error) {
    process.stderr.write(`[MCP Bridge] Error: ${error.message}\n`);
  }
});

// Handle process termination
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Log ready to stderr
process.stderr.write('[MCP Bridge] Final version ready\n');