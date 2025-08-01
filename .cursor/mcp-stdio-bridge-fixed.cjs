#!/usr/bin/env node

const http = require('http');
const readline = require('readline');

// Create readline interface for STDIO
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let messageIdCounter = 0;
const messageIdMap = new Map(); // Map Cursor's IDs to our IDs

// Handle incoming STDIO messages from Cursor
rl.on('line', (line) => {
  if (!line.trim()) return;
  
  try {
    // Parse the JSON-RPC message from Cursor
    const message = JSON.parse(line);
    
    // Store the original ID and replace with our counter
    const originalId = message.id;
    const ourId = ++messageIdCounter;
    
    if (originalId !== undefined) {
      messageIdMap.set(ourId, originalId);
      message.id = ourId;
    }
    
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
        try {
          // Parse the response
          const response = JSON.parse(data);
          
          // Map our ID back to Cursor's original ID
          if (response.id !== undefined && messageIdMap.has(response.id)) {
            response.id = messageIdMap.get(response.id);
            messageIdMap.delete(ourId);
          }
          
          // Send response back to Cursor via STDIO
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (e) {
          // If response isn't JSON, send it as-is
          process.stdout.write(data + '\n');
        }
      });
    });
    
    req.on('error', (error) => {
      // Send error response with original ID
      const errorResponse = {
        jsonrpc: '2.0',
        id: originalId || null,
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
process.stderr.write('[MCP Bridge] Ready. Forwarding STDIO to http://localhost:6174/mcp\n');