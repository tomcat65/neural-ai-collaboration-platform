#!/bin/bash

# Start the complete Neural AI system with all databases (override-aware)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_SIMPLE="docker/docker-compose.simple.yml"
COMPOSE_OVERRIDE="docker/docker-compose.simple.override.yml"

compose_args=( -f "$COMPOSE_SIMPLE" )
if [ -f "$PROJECT_DIR/$COMPOSE_OVERRIDE" ]; then
  compose_args+=( -f "$COMPOSE_OVERRIDE" )
fi

echo "Starting complete Neural AI Collaboration Platform..."
echo "This includes: PostgreSQL, Redis, Neo4j, Weaviate, and all services"

cd "$PROJECT_DIR"

docker compose "${compose_args[@]}" up -d

echo "Waiting for all services to start (this may take 30-60 seconds)..."
sleep 20

echo ""
echo "Checking service status..."
docker compose "${compose_args[@]}" ps

echo ""
echo "Testing service endpoints..."
# Determine mapped ports if override present
HTTP_PORT=5174
MCP_PORT=5174
UI_PORT=5176
if [ -f "$PROJECT_DIR/$COMPOSE_OVERRIDE" ]; then
  HTTP_PORT=5300
  MCP_PORT=5175
fi

echo -n "Neural AI Platform (${HTTP_PORT}): "
curl -s "http://localhost:${HTTP_PORT}/health" > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Universal Gateway (5200): "
curl -s http://localhost:5200/health > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Weaviate (8080): "
curl -s http://localhost:8080/v1/.well-known/ready > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Neo4j (7474): "
curl -s http://localhost:7474 > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Redis (6379): "
docker ps -qf name=redis >/dev/null 2>&1 && echo "✓ Running" || echo "✗ Not ready"

echo -n "PostgreSQL (5432): "
docker ps -qf name=postgres >/dev/null 2>&1 && echo "✓ Running" || echo "✗ Not ready"

echo ""
echo "System URLs:"
echo "  - Neural AI Platform: http://localhost:${HTTP_PORT}"
echo "  - Universal Gateway: http://localhost:5200"
echo "  - Vue Dashboard: http://localhost:${UI_PORT}"
echo "  - Weaviate: http://localhost:8080"
echo "  - Neo4j Browser: http://localhost:7474"
echo ""
echo "To stop all services: docker compose ${compose_args[*]} down"
