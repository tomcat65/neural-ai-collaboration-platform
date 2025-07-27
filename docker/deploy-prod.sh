#!/bin/bash

# Multi-Agent Platform Production Deployment Script
set -e

echo "🚀 Starting Multi-Agent Platform Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check prerequisites
print_step "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if running as root (not recommended for production)
if [[ $EUID -eq 0 ]]; then
   print_warning "Running as root is not recommended for production deployments."
   read -p "Continue anyway? (y/N): " -n 1 -r
   echo
   if [[ ! $REPLY =~ ^[Yy]$ ]]; then
       exit 1
   fi
fi

# Create necessary directories
print_step "Creating production directories..."
mkdir -p data logs ssl monitoring/grafana/dashboards monitoring/grafana/datasources init-scripts

# Generate SSL certificates (self-signed for testing)
print_step "Generating SSL certificates..."
if [ ! -f ssl/cert.pem ] || [ ! -f ssl/key.pem ]; then
    print_status "Generating self-signed SSL certificates..."
    openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    chmod 600 ssl/key.pem
    chmod 644 ssl/cert.pem
else
    print_status "SSL certificates already exist"
fi

# Set environment variables
print_step "Setting up environment variables..."
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -base64 32)}
export REDIS_PASSWORD=${REDIS_PASSWORD:-$(openssl rand -base64 32)}
export GRAFANA_PASSWORD=${GRAFANA_PASSWORD:-$(openssl rand -base64 32)}

# Save environment variables
cat > .env << EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

print_status "Environment variables saved to .env"

# Build the application
print_step "Building the application..."
npm run build

# Build Docker image
print_step "Building production Docker image..."
docker build -t shared-memory-mcp:prod .

# Stop existing containers
print_step "Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down || true

# Start the production platform
print_step "Starting production platform..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
print_step "Waiting for services to be ready..."
sleep 60

# Check health status
print_step "Checking service health..."

# Check main platform
if curl -f -k https://localhost/health > /dev/null 2>&1; then
    print_status "✅ Multi-Agent Platform is healthy!"
else
    print_error "❌ Multi-Agent Platform health check failed"
    docker-compose -f docker-compose.prod.yml logs multi-agent-platform
    exit 1
fi

# Check Grafana
if curl -f http://localhost:3002 > /dev/null 2>&1; then
    print_status "✅ Grafana is running on http://localhost:3002"
else
    print_warning "⚠️ Grafana is not accessible (may still be starting)"
fi

# Check Prometheus
if curl -f http://localhost:9090 > /dev/null 2>&1; then
    print_status "✅ Prometheus is running on http://localhost:9090"
else
    print_warning "⚠️ Prometheus is not accessible (may still be starting)"
fi

# Check Alert Manager
if curl -f http://localhost:9093 > /dev/null 2>&1; then
    print_status "✅ Alert Manager is running on http://localhost:9093"
else
    print_warning "⚠️ Alert Manager is not accessible (may still be starting)"
fi

# Security check
print_step "Performing security checks..."
if docker-compose -f docker-compose.prod.yml exec -T multi-agent-platform sh -c "test -f /app/ssl/cert.pem" 2>/dev/null; then
    print_status "✅ SSL certificates are properly mounted"
else
    print_warning "⚠️ SSL certificates may not be properly mounted"
fi

# Performance check
print_step "Checking resource usage..."
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | head -10

print_status "🎉 Production deployment completed successfully!"
echo ""
echo "📊 Production Service URLs:"
echo "   Multi-Agent Platform: https://localhost"
echo "   WebSocket: wss://localhost/ws/"
echo "   Health Check: https://localhost/health"
echo "   Dashboard Status: https://localhost/api/dashboard/status"
echo ""
echo "📈 Monitoring Services:"
echo "   Grafana: http://localhost:3002 (admin/$GRAFANA_PASSWORD)"
echo "   Prometheus: http://localhost:9090"
echo "   Alert Manager: http://localhost:9093"
echo "   Node Exporter: http://localhost:9100"
echo ""
echo "🔧 Production Management Commands:"
echo "   View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "   Stop platform: docker-compose -f docker-compose.prod.yml down"
echo "   Restart platform: docker-compose -f docker-compose.prod.yml restart"
echo "   Update platform: ./deploy-prod.sh"
echo ""
echo "🔒 Security Notes:"
echo "   - SSL certificates are self-signed (replace with real certificates for production)"
echo "   - Environment variables are saved in .env file"
echo "   - All services have health checks enabled"
echo "   - Rate limiting is configured"
echo ""
print_status "🚀 Production platform is ready for use!" 