#!/bin/bash

# Start Unified Neural AI Collaboration MCP Server
# This script starts the comprehensive MCP server with all advanced capabilities

echo "🧠 Starting Unified Neural AI Collaboration MCP Server..."
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start the unified neural MCP server
echo "🏗️  Building and starting containers..."
docker-compose -f docker/docker-compose.unified-neural-mcp.yml up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check health status
echo "🔍 Checking service health..."

# Check Unified Neural MCP Server
if curl -f http://localhost:6174/health > /dev/null 2>&1; then
    echo "✅ Unified Neural MCP Server: HEALTHY"
else
    echo "❌ Unified Neural MCP Server: UNHEALTHY"
fi

# Check Message Hub WebSocket
if curl -f http://localhost:3003 > /dev/null 2>&1; then
    echo "✅ Message Hub WebSocket: REACHABLE"
else
    echo "⚠️  Message Hub WebSocket: May not be fully ready yet"
fi

# Check Redis (if enabled)
if docker-compose -f docker/docker-compose.unified-neural-mcp.yml ps redis | grep -q "Up"; then
    echo "✅ Redis Cache: RUNNING"
fi

# Check Neo4j (if enabled)
if docker-compose -f docker/docker-compose.unified-neural-mcp.yml ps neo4j | grep -q "Up"; then
    echo "✅ Neo4j Graph Database: RUNNING"
fi

echo ""
echo "🌟 UNIFIED NEURAL AI COLLABORATION MCP SERVER"
echo "=================================================="
echo "📡 MCP Endpoint: http://localhost:6174/mcp"
echo "💬 AI Messaging: http://localhost:6174/ai-message"
echo "📊 Health Check: http://localhost:6174/health"
echo "🔧 System Status: http://localhost:6174/system/status"
echo "📡 WebSocket Hub: ws://localhost:3003"
echo ""
echo "🧠 ADVANCED CAPABILITIES:"
echo "   ✅ Advanced Memory Systems (Neo4j, Weaviate, Redis)"
echo "   ✅ Multi-Provider AI (OpenAI, Anthropic, Google)"
echo "   ✅ Autonomous Agent Operations"
echo "   ✅ Cross-Platform Support (Windows/WSL/Linux)"
echo "   ✅ Real-Time Collaboration"
echo "   ✅ Consensus & Coordination (RAFT Protocol)"
echo "   ✅ ML Integration & Analytics"
echo "   ✅ Event-Driven Orchestration"
echo ""
echo "📋 CLAUDE DESKTOP/CURSOR CONFIGURATION:"
echo "Use this MCP configuration:"
echo ""
echo '{'
echo '  "mcpServers": {'
echo '    "neural-ai-collaboration": {'
echo '      "command": "npx",'
echo '      "args": ["@modelcontextprotocol/server-fetch", "http://localhost:6174/mcp"]'
echo '    }'
echo '  }'
echo '}'
echo ""
echo "🚀 System Ready for Neural AI Collaboration!"
echo ""
echo "📝 Available MCP Tools:"
echo "   Memory: create_entities, search_entities, add_observations, create_relations, read_graph"
echo "   Communication: send_ai_message, get_ai_messages, register_agent, get_agent_status"
echo "   AI Providers: execute_ai_request, stream_ai_response, get_provider_status, configure_providers"
echo "   Autonomous: start_autonomous_mode, configure_agent_behavior, set_token_budget, trigger_agent_action"
echo "   Cross-Platform: translate_path, test_connectivity, generate_configs, sync_platforms"
echo "   Coordination: submit_consensus_vote, get_consensus_status, coordinate_agents, resolve_conflicts"
echo "   System: get_system_status, configure_system"
echo ""
echo "To stop: docker-compose -f docker/docker-compose.unified-neural-mcp.yml down"