#!/bin/bash

# Multi-Agent Platform Production Deployment Script
set -e

echo "🚀 Starting Multi-Agent Platform Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p data logs monitoring/grafana/dashboards monitoring/grafana/datasources

# Build the application
print_status "Building the application..."
npm run build

# Build Docker image
print_status "Building Docker image..."
docker build -t shared-memory-mcp .

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down || true

# Start the platform
print_status "Starting Multi-Agent Platform..."
docker-compose up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 30

# Check health status
print_status "Checking service health..."

# Check main platform
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_status "✅ Multi-Agent Platform is healthy!"
else
    print_error "❌ Multi-Agent Platform health check failed"
    exit 1
fi

# Check Grafana (if enabled)
if curl -f http://localhost:3002 > /dev/null 2>&1; then
    print_status "✅ Grafana is running on http://localhost:3002"
else
    print_warning "⚠️ Grafana is not accessible (may still be starting)"
fi

# Check Prometheus (if enabled)
if curl -f http://localhost:9090 > /dev/null 2>&1; then
    print_status "✅ Prometheus is running on http://localhost:9090"
else
    print_warning "⚠️ Prometheus is not accessible (may still be starting)"
fi

print_status "🎉 Deployment completed successfully!"
echo ""
echo "📊 Service URLs:"
echo "   Multi-Agent Platform: http://localhost:3000"
echo "   WebSocket: ws://localhost:3001"
echo "   Health Check: http://localhost:3000/health"
echo "   Dashboard Status: http://localhost:3000/api/dashboard/status"
echo ""
echo "📈 Monitoring (if enabled):"
echo "   Grafana: http://localhost:3002 (admin/admin)"
echo "   Prometheus: http://localhost:9090"
echo ""
echo "🔧 Management Commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop platform: docker-compose down"
echo "   Restart platform: docker-compose restart"
echo ""
print_status "Platform is ready for production use!" 