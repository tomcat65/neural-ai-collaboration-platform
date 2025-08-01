#!/bin/bash

# Universal MCP Gateway Deployment Script
set -e

echo "🚀 Starting Universal MCP Gateway Deployment..."

# Set project directory
PROJECT_DIR="/home/tomcat65/projects/shared-memory-mcp"
cd "$PROJECT_DIR"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "📋 Checking prerequisites..."

# Check if core services are running
echo "🔍 Checking core services status..."
CORE_SERVICES=("postgres" "redis" "neo4j" "weaviate" "neural-ai")
for service in "${CORE_SERVICES[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "$service"; then
        echo "✅ $service is running"
    else
        echo "⚠️ $service is not running - starting core services first..."
        docker-compose -f docker/docker-compose.simple.yml up -d
        echo "⏳ Waiting 30 seconds for services to stabilize..."
        sleep 30
        break
    fi
done

echo "🏗️ Building Universal MCP Gateway..."

# Build the gateway image
docker build -f docker/Dockerfile.universal-gateway -t universal-mcp-gateway:latest .

echo "📦 Deploying Universal MCP Gateway container..."

# Deploy the gateway
docker-compose -f docker/docker-compose.simple.yml up -d universal-gateway

echo "⏳ Waiting for Universal Gateway to be ready..."
sleep 15

# Health check
echo "🏥 Performing health check..."
for i in {1..10}; do
    if curl -s http://localhost:5200/health > /dev/null; then
        echo "✅ Universal MCP Gateway is healthy!"
        break
    else
        echo "⏳ Attempt $i/10 - Gateway not ready yet..."
        sleep 5
    fi
done

# Final status check
echo "📊 Final system status:"
echo ""
echo "=== Universal MCP Gateway Status ==="
if curl -s http://localhost:5200/health | python3 -m json.tool 2>/dev/null; then
    echo ""
    echo "🌐 Gateway Endpoints:"
    echo "  - Health: http://localhost:5200/health"
    echo "  - Platforms: http://localhost:5200/api/platforms" 
    echo "  - Entities API: http://localhost:5200/api/entities"
    echo "  - Federation Sync: http://localhost:5200/api/federation/sync"
    echo ""
    echo "✅ Universal MCP Gateway deployment SUCCESSFUL!"
else
    echo "❌ Universal MCP Gateway health check failed"
    echo "📋 Container logs:"
    docker logs universal-mcp-gateway --tail 20
    exit 1
fi

echo ""
echo "=== Platform Registry Status ==="
curl -s http://localhost:5200/api/platforms | python3 -m json.tool 2>/dev/null || echo "Platform registry not ready"

echo ""
echo "=== Container Status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(universal-gateway|neural-ai|postgres|redis|neo4j|weaviate)"

echo ""
echo "🎉 Universal MCP Gateway is now operational!"
echo "🔧 You can now use universal:* tools across all AI platforms"
echo ""
echo "Next steps:"
echo "1. Update MCP configurations to use localhost:5200"
echo "2. Test universal tools: universal:get_entities, universal:search_entities"
echo "3. Integrate with Vida-Tea Firebase architecture"
echo ""
echo "📚 Configuration file: universal-mcp-config.json"
echo "🐳 Container name: universal-mcp-gateway"
echo "🌐 Gateway port: 5200"