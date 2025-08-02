#!/bin/bash

# Start the complete Neural AI system with all databases

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting complete Neural AI Collaboration Platform..."
echo "This includes: PostgreSQL, Redis, Neo4j, Weaviate, and all services"

cd "$PROJECT_DIR"

# Start all services using the complete docker-compose file
docker-compose -f docker/docker-compose.simple.yml up -d

# Wait for services to be healthy
echo "Waiting for all services to start (this may take 30-60 seconds)..."
sleep 20

# Check service health
echo ""
echo "Checking service status..."
docker-compose -f docker/docker-compose.simple.yml ps

# Test endpoints
echo ""
echo "Testing service endpoints..."
echo -n "Neural AI Platform (5174): "
curl -s http://localhost:5174/health > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Universal Gateway (5200): "
curl -s http://localhost:5200/health > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Weaviate (8080): "
curl -s http://localhost:8080/v1/.well-known/ready > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Neo4j (7474): "
curl -s http://localhost:7474 > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "Redis (6379): "
docker exec $(docker ps -qf "name=redis") redis-cli ping > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo -n "PostgreSQL (5432): "
docker exec $(docker ps -qf "name=postgres") pg_isready > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"

echo ""
echo "System URLs:"
echo "  - Neural AI Platform: http://localhost:5174"
echo "  - Universal Gateway: http://localhost:5200"
echo "  - Vue Dashboard: http://localhost:5176"
echo "  - Weaviate: http://localhost:8080"
echo "  - Neo4j Browser: http://localhost:7474"
echo ""
echo "To stop all services: docker-compose -f docker/docker-compose.simple.yml down"