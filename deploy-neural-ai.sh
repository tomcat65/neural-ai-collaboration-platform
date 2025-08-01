#!/bin/bash

# Neural AI Collaboration Platform - Containerized Deployment Script
# Complete deployment without individual scripts - everything containerized

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="neural-ai-collaboration"
COMPOSE_FILE="docker-compose.yml"
CONFIG_SERVER_PORT=8080
MAIN_SERVER_PORT=3001
GRAFANA_PORT=3000

# Helper functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    success "System requirements check passed"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p docker/{config,scripts,nginx/{conf.d},prometheus,grafana/provisioning,init-scripts}
    mkdir -p data/{shared,logs,config,generated}
    mkdir -p generated-configs
    
    success "Directories created successfully"
}

# Generate Nginx configuration
generate_nginx_config() {
    log "Generating Nginx configuration..."
    
    cat > docker/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream neural_ai_backend {
        server neural-ai-server:3001;
    }
    
    upstream config_server {
        server config-server:8080;
    }
    
    server {
        listen 80;
        server_name localhost;
        
        # Health check endpoint
        location /health {
            return 200 'Neural AI Platform is running';
            add_header Content-Type text/plain;
        }
        
        # Proxy to main server
        location /api/ {
            proxy_pass http://neural_ai_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Proxy to config server
        location /config/ {
            proxy_pass http://config_server/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        # Serve static files for configuration downloads
        location /downloads/ {
            proxy_pass http://config_server/download/;
            proxy_set_header Host $host;
        }
        
        # Default proxy to main server
        location / {
            proxy_pass http://neural_ai_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF
    
    success "Nginx configuration generated"
}

# Generate Prometheus configuration
generate_prometheus_config() {
    log "Generating Prometheus configuration..."
    
    cat > docker/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'neural-ai-server'
    static_configs:
      - targets: ['neural-ai-server:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'autonomous-agents'
    static_configs:
      - targets: 
        - 'claude-code-agent:3001'
        - 'claude-desktop-agent:3001'
        - 'cursor-ide-agent:3001'
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'databases'
    static_configs:
      - targets:
        - 'postgres:5432'
        - 'redis:6379'
        - 'weaviate:8080'
        - 'neo4j:7474'
    scrape_interval: 60s
EOF
    
    success "Prometheus configuration generated"
}

# Generate database initialization scripts
generate_db_init_scripts() {
    log "Generating database initialization scripts..."
    
    cat > docker/init-scripts/01-init-neural-ai.sql << 'EOF'
-- Neural AI Collaboration Platform Database Schema

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Entities table
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Observations table
CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Relations table
CREATE TABLE IF NOT EXISTS relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    relation_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Agent sessions table
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(100) NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_agent VARCHAR(100) NOT NULL,
    to_agent VARCHAR(100) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'pending'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_agents ON messages(from_agent, to_agent);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to entities table
CREATE TRIGGER update_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
EOF
    
    success "Database initialization scripts generated"
}

# Generate Dockerfile for Nginx
generate_nginx_dockerfile() {
    log "Generating Nginx Dockerfile..."
    
    cat > docker/Dockerfile.nginx << 'EOF'
FROM nginx:alpine

# Copy custom configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/conf.d /etc/nginx/conf.d

# Add health check
RUN apk add --no-cache curl

# Create nginx user
RUN addgroup -g 1001 -S nginx && \
    adduser -S nginx -u 1001 -G nginx

# Set proper permissions
RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
EOF
    
    success "Nginx Dockerfile generated"
}

# Deploy the platform
deploy_platform() {
    log "Deploying Neural AI Collaboration Platform..."
    
    # Build and start all services
    docker-compose down --remove-orphans 2>/dev/null || true
    docker-compose build --no-cache
    docker-compose up -d
    
    success "Platform deployment initiated"
}

# Wait for services to be healthy
wait_for_services() {
    log "Waiting for all services to be healthy..."
    
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local healthy_count=0
        local total_services=0
        
        # Check each service health
        for service in neural-ai-server claude-code-agent claude-desktop-agent cursor-ide-agent postgres redis weaviate neo4j; do
            total_services=$((total_services + 1))
            if docker-compose ps --services --filter "status=running" | grep -q "^${service}$"; then
                if [ "$(docker-compose ps --format "{{.Health}}" $service 2>/dev/null)" = "healthy" ] || \
                   [ "$(docker inspect --format "{{.State.Health.Status}}" "${PROJECT_NAME}_${service}_1" 2>/dev/null)" = "healthy" ]; then
                    healthy_count=$((healthy_count + 1))
                fi
            fi
        done
        
        if [ $healthy_count -eq $total_services ]; then
            success "All services are healthy!"
            return 0
        fi
        
        echo -n "."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    warning "Some services may not be fully healthy yet. Check with: docker-compose ps"
    return 1
}

# Display deployment information
show_deployment_info() {
    log "Deployment Information"
    echo ""
    echo "🌐 Service URLs:"
    echo "   • Main API:           http://localhost:${MAIN_SERVER_PORT}"
    echo "   • Configuration:      http://localhost:${CONFIG_SERVER_PORT}"
    echo "   • Monitoring:         http://localhost:${GRAFANA_PORT}"
    echo "   • Load Balancer:      http://localhost:80"
    echo ""
    echo "📱 Configuration Downloads:"
    echo "   • Claude Desktop:     curl -o claude-desktop-config.json http://localhost:${CONFIG_SERVER_PORT}/download/claude-desktop"
    echo "   • Cursor IDE:         curl -o cursor-config.json http://localhost:${CONFIG_SERVER_PORT}/download/cursor"
    echo "   • Claude CLI:         curl -o claude-cli-config.json http://localhost:${CONFIG_SERVER_PORT}/download/claude-cli"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • Check status:       docker-compose ps"
    echo "   • View logs:          docker-compose logs -f [service-name]"
    echo "   • Stop platform:      docker-compose down"
    echo "   • Update platform:    docker-compose pull && docker-compose up -d"
    echo ""
    echo "🤖 Autonomous Agents Status:"
    docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | grep agent || echo "   Agents are initializing..."
    echo ""
    success "Neural AI Collaboration Platform is now running!"
}

# Main deployment function
main() {
    echo ""
    echo "🧠 Neural AI Collaboration Platform - Containerized Deployment"
    echo "=============================================================="
    echo ""
    
    check_requirements
    create_directories
    generate_nginx_config
    generate_prometheus_config
    generate_db_init_scripts
    generate_nginx_dockerfile
    
    deploy_platform
    
    log "Waiting for services to initialize..."
    sleep 10
    
    wait_for_services
    show_deployment_info
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Download and configure your AI clients using the URLs above"
    echo "2. Monitor the system at http://localhost:${GRAFANA_PORT}"
    echo "3. Check autonomous agents are working: curl http://localhost:${MAIN_SERVER_PORT}/agents/status"
    echo ""
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy"|"start")
        main
        ;;
    "stop")
        log "Stopping Neural AI Platform..."
        docker-compose down
        success "Platform stopped"
        ;;
    "restart")
        log "Restarting Neural AI Platform..."
        docker-compose restart
        success "Platform restarted"
        ;;
    "status")
        log "Platform Status:"
        docker-compose ps
        ;;
    "logs")
        log "Platform Logs:"
        docker-compose logs -f "${2:-}"
        ;;
    "update")
        log "Updating Neural AI Platform..."
        docker-compose pull
        docker-compose up -d
        success "Platform updated"
        ;;
    "clean")
        warning "This will remove all containers, networks, and volumes!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose down -v --remove-orphans
            docker system prune -f
            success "Platform cleaned"
        fi
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  deploy/start  - Deploy the platform (default)"
        echo "  stop          - Stop all services"
        echo "  restart       - Restart all services"
        echo "  status        - Show service status"
        echo "  logs [svc]    - Show logs (optionally for specific service)"
        echo "  update        - Update and restart services"
        echo "  clean         - Remove all containers and data"
        echo "  help          - Show this help message"
        ;;
    *)
        error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac