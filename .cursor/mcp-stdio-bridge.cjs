#!/usr/bin/env node

const http = require('http');
const readline = require('readline');

// Create readline interface for STDIO
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Handle incoming STDIO messages
rl.on('line', (line) => {
  if (!line.trim()) return;
  
  try {
    // Parse the JSON-RPC message
    const message = JSON.parse(line);
    
    // Forward to HTTP MCP server
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
        // Send response back via STDIO
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

// Log that bridge is ready (to stderr so it doesn't interfere with STDIO protocol)
console.error('[MCP Bridge] Ready. Forwarding STDIO to http://localhost:6174/mcp');