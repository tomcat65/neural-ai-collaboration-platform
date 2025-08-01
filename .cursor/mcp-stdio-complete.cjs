#!/usr/bin/env node

const http = require('http');
const readline = require('readline');

// Create readline interface for STDIO
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let initialized = false;

// Handle incoming STDIO messages from Cursor
rl.on('line', (line) => {
  if (!line.trim()) return;
  
  try {
    // Parse the JSON-RPC message from Cursor
    const message = JSON.parse(line);
    
    // Handle some methods locally that the server doesn't implement
    if (message.method === 'notifications/initialized') {
      // Just acknowledge the notification
      return; // Notifications don't need responses
    }
    
    if (message.method === 'prompts/list') {
      // Return empty prompts list
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          prompts: []
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }
    
    if (message.method === 'resources/list') {
      // Return empty resources list
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          resources: []
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }
    
    // Forward all other messages to HTTP MCP server
    const postData = JSON.stringify(message);
    
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
        // Send response back to Cursor via STDIO
        process.stdout.write(data + '\n');
      });
    });
    
    req.on('error', (error) => {
      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: message.id || null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    });
    
    req.write(postData);
    req.end();
    
  } catch (error) {
    // Handle JSON parse errors
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: error.message
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

// Handle process termination
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Don't log to stdout as it interferes with JSON-RPC protocol
// Only log to stderr for debugging
process.stderr.write('[MCP Bridge] Ready. Complete bridge with method handling\n');