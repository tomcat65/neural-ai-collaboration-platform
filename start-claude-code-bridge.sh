#!/bin/bash

# Claude Code Bridge Startup Script
# Starts the Neural AI Collaboration Platform with Claude Code integration

set -e

echo "🚀 Starting Neural AI Collaboration Platform - Claude Code Bridge"
echo "=================================================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ to continue."
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Build the project if dist doesn't exist
if [ ! -d "dist" ]; then
    echo "🔨 Building project..."
    npm run build
fi

# Create data directory if it doesn't exist
mkdir -p data/memory

# Set environment variables for Claude Code integration
export NODE_ENV=development
export MCP_PORT=5174
export CLAUDE_CODE_MODE=true
export MEMORY_BRIDGE_ENABLED=true
export REAL_TIME_SYNC=true

echo "📋 Configuration:"
echo "  MCP Port: $MCP_PORT"
echo "  Claude Code Mode: $CLAUDE_CODE_MODE"
echo "  Memory Bridge: $MEMORY_BRIDGE_ENABLED"
echo "  Real-time Sync: $REAL_TIME_SYNC"
echo ""

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down Claude Code Bridge..."
    jobs -p | xargs -r kill
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

# Start the unified server
echo "🌐 Starting Unified Server (port 3000)..."
npm run unified:start &
UNIFIED_PID=$!

# Wait a moment for unified server to start
sleep 3

# Start the MCP server
echo "📡 Starting MCP Server (port $MCP_PORT)..."
npm run mcp:start &
MCP_PID=$!

# Wait a moment for MCP server to start
sleep 2

# Start Message Hub
echo "💬 Starting Message Hub (port 3003)..."
npm run hub:start &
HUB_PID=$!

sleep 2

# Verify servers are running
echo ""
echo "🔍 Verifying services..."

# Check unified server
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Unified Server: Running"
else
    echo "❌ Unified Server: Failed to start"
fi

# Check MCP server
if curl -s http://localhost:$MCP_PORT/health > /dev/null; then
    echo "✅ MCP Server: Running"
else
    echo "❌ MCP Server: Failed to start"
fi

echo ""
echo "🎯 Claude Code Bridge is ready!"
echo "=================================================================="
echo ""
echo "📋 Available Endpoints:"
echo "  🌐 Unified Server:     http://localhost:3000"
echo "  📡 MCP Server:         http://localhost:$MCP_PORT"
echo "  💬 Message Hub:        ws://localhost:3003"
echo "  📊 Health Check:       http://localhost:3000/health"
echo "  🔧 MCP Health:         http://localhost:$MCP_PORT/health"
echo ""
echo "🧠 Memory & Collaboration:"
echo "  📚 Store Memory:       POST http://localhost:3000/api/memory/store"
echo "  🔍 Search Memory:      GET  http://localhost:3000/api/memory/search"
echo "  🤝 Collaboration:      POST http://localhost:3000/api/collaboration/tasks"
echo "  🗳️ Consensus:          POST http://localhost:3000/api/collaboration/consensus"
echo ""
echo "🔗 MCP Integration:"
echo "  📡 MCP Endpoint:       http://localhost:$MCP_PORT/mcp"
echo "  💬 AI Messaging:       POST http://localhost:$MCP_PORT/ai-message"
echo "  📨 Get Messages:       GET  http://localhost:$MCP_PORT/ai-messages/{agentId}"
echo ""
echo "📄 Claude Code MCP Configuration:"
echo "  Copy this to your Claude Code settings:"
echo '  {
    "mcpServers": {
      "neural-ai-collaboration": {
        "command": "node",
        "args": ["'$(pwd)'/dist/mcp-http-server.js"],
        "env": {
          "MCP_PORT": "'$MCP_PORT'",
          "NODE_ENV": "development"
        }
      }
    }
  }'
echo ""
echo "🚀 To connect Claude Code:"
echo "  1. Copy the MCP configuration above to your Claude Code settings"
echo "  2. Restart Claude Code to load the MCP server"
echo "  3. The platform will be available as an MCP tool in Claude Code"
echo ""
echo "📚 Quick Start Commands (in Claude Code):"
echo '  - Store knowledge: use the "create_entities" tool'
echo '  - Send AI message: use the "send_ai_message" tool'
echo '  - Get messages: use the "get_ai_messages" tool'
echo ""
echo "🔄 Services are running... Press Ctrl+C to stop all services"
echo ""

# Wait for all background jobs
wait