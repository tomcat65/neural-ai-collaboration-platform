#!/bin/sh

# Docker Services Startup Script
# Starts all Neural AI Collaboration Platform services in Docker container

set -e

echo "🚀 Starting Neural AI Collaboration Platform - Docker Environment"
echo "=================================================================="

# Set environment variables for Docker
export NODE_ENV=production
export MCP_PORT=5174
export CLAUDE_CODE_MODE=true
export MEMORY_BRIDGE_ENABLED=true
export REAL_TIME_SYNC=true

echo "📋 Docker Configuration:"
echo "  Environment: $NODE_ENV"
echo "  MCP Port: $MCP_PORT"
echo "  Claude Code Mode: $CLAUDE_CODE_MODE"
echo "  Memory Bridge: $MEMORY_BRIDGE_ENABLED"
echo ""

# Create data directory if it doesn't exist
mkdir -p data/memory

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    jobs -p | xargs -r kill
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

echo "🌐 Starting Unified Server (port 3000)..."
node dist/unified-server/index.js &
UNIFIED_PID=$!

# Wait for unified server to start
sleep 5

echo "📡 Starting MCP Server (port $MCP_PORT)..."
node dist/mcp-http-server.js &
MCP_PID=$!

# Wait for MCP server to start
sleep 3

echo "💬 Starting Message Hub (port 3003)..."
node dist/message-hub/server.js &
HUB_PID=$!

sleep 3

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
echo "🎯 Neural AI Collaboration Platform is ready!"
echo "=================================================================="
echo ""
echo "📋 Available Endpoints:"
echo "  🌐 Unified Server:     http://localhost:3000"
echo "  📡 MCP Server:         http://localhost:$MCP_PORT"
echo "  💬 Message Hub:        ws://localhost:3003"
echo "  📊 Health Check:       http://localhost:3000/health"
echo ""
echo "🔗 MCP Integration:"
echo "  📡 MCP Endpoint:       http://localhost:$MCP_PORT/mcp"
echo "  💬 AI Messaging:       POST http://localhost:$MCP_PORT/ai-message"
echo ""
echo "🤖 Claude Code Integration Ready!"
echo "Add the MCP configuration to Claude Code settings:"
echo '{"mcpServers":{"neural-ai-collaboration":{"command":"node","args":["dist/mcp-http-server.js"],"env":{"MCP_PORT":"5174"}}}}'
echo ""
echo "🔄 All services running in Docker..."

# Wait for all background jobs
wait