#!/bin/bash

# Neural AI Collaboration Platform Control Script
# This script provides manual control over the Neural AI system

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if containers are running
check_status() {
    print_status "Checking Neural AI system status..."
    echo ""
    
    # Check specific neural-ai containers
    containers=("neural-mcp-unified" "universal-mcp-gateway" "neural-ai-postgres-simple")
    running_count=0
    
    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo -e "  ${GREEN}✓${NC} ${container} is running"
            ((running_count++))
        else
            echo -e "  ${RED}✗${NC} ${container} is not running"
        fi
    done
    
    echo ""
    if [ $running_count -eq 0 ]; then
        print_status "Neural AI system is stopped"
    elif [ $running_count -eq ${#containers[@]} ]; then
        print_success "Neural AI system is fully operational"
        echo ""
        echo "Access points:"
        echo "  - Neural AI Server: http://localhost:6174"
        echo "  - Message Hub WebSocket: ws://localhost:3003"
        echo "  - Gateway: http://localhost:5200"
    else
        print_warning "Neural AI system is partially running"
    fi
}

# Function to start the system
start_system() {
    print_status "Starting Neural AI Collaboration Platform..."
    
    cd "$PROJECT_DIR"
    
    # Start the unified neural MCP service
    if docker ps --format '{{.Names}}' | grep -q "^neural-mcp-unified$"; then
        print_warning "neural-mcp-unified is already running"
    else
        print_status "Starting neural-mcp-unified service..."
        docker-compose -f docker/docker-compose.unified-neural-mcp.yml up -d
    fi
    
    # Start the gateway service (if needed)
    if docker ps --format '{{.Names}}' | grep -q "^universal-mcp-gateway$"; then
        print_warning "universal-mcp-gateway is already running"
    else
        print_status "Starting universal-mcp-gateway service..."
        # Check which compose file to use
        if [ -f "docker/docker-compose.gateway-only.yml" ]; then
            docker-compose -f docker/docker-compose.gateway-only.yml up -d
        fi
    fi
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 10
    
    # Test the system
    print_status "Testing system health..."
    if curl -s http://localhost:6174/health > /dev/null 2>&1; then
        print_success "Neural AI Server is responding"
    else
        print_warning "Neural AI Server is still starting up..."
    fi
    
    echo ""
    check_status
}

# Function to stop the system
stop_system() {
    print_status "Stopping Neural AI Collaboration Platform..."
    
    cd "$PROJECT_DIR"
    
    # Stop all neural-ai related containers
    print_status "Stopping neural-mcp-unified..."
    docker-compose -f docker/docker-compose.unified-neural-mcp.yml down
    
    # Stop gateway if it exists
    if [ -f "docker/docker-compose.gateway-only.yml" ]; then
        print_status "Stopping universal-mcp-gateway..."
        docker-compose -f docker/docker-compose.gateway-only.yml down
    fi
    
    # Stop any other related containers
    print_status "Checking for other neural-ai containers..."
    for container in $(docker ps --format '{{.Names}}' | grep -E "(neural|mcp)"); do
        print_warning "Stopping additional container: $container"
        docker stop "$container"
    done
    
    print_success "Neural AI system stopped"
}

# Function to restart the system
restart_system() {
    print_status "Restarting Neural AI Collaboration Platform..."
    stop_system
    echo ""
    start_system
}

# Function to prevent auto-start on boot
disable_autostart() {
    print_status "Disabling auto-start for Neural AI containers..."
    
    # Update restart policy for all neural-ai containers
    containers=("neural-mcp-unified" "universal-mcp-gateway" "neural-ai-postgres-simple")
    
    for container in "${containers[@]}"; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            print_status "Updating restart policy for $container..."
            docker update --restart=no "$container" 2>/dev/null && \
                print_success "Disabled auto-start for $container" || \
                print_warning "Container $container not found"
        fi
    done
    
    print_success "Auto-start disabled. Containers will not start on system boot."
}

# Function to enable auto-start on boot
enable_autostart() {
    print_status "Enabling auto-start for Neural AI containers..."
    
    # Update restart policy for all neural-ai containers
    containers=("neural-mcp-unified" "universal-mcp-gateway" "neural-ai-postgres-simple")
    
    for container in "${containers[@]}"; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            print_status "Updating restart policy for $container..."
            docker update --restart=unless-stopped "$container" 2>/dev/null && \
                print_success "Enabled auto-start for $container" || \
                print_warning "Container $container not found"
        fi
    done
    
    print_success "Auto-start enabled. Containers will start on system boot."
}

# Function to backup data
backup_data() {
    print_status "Creating backup of Neural AI data..."
    
    BACKUP_DIR="$HOME/neural-ai-backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup Docker volumes
    print_status "Backing up Docker volumes..."
    volumes=("unified_neural_data" "redis_data" "postgres_data")
    
    for volume in "${volumes[@]}"; do
        if docker volume ls --format '{{.Name}}' | grep -q "^${volume}$"; then
            print_status "Backing up volume: $volume"
            docker run --rm -v "${volume}:/data" -v "${BACKUP_DIR}:/backup" alpine \
                tar czf "/backup/${volume}.tar.gz" -C /data .
            print_success "Backed up $volume"
        fi
    done
    
    # Copy project configuration
    print_status "Backing up project configuration..."
    cp -r "$PROJECT_DIR/configs" "$BACKUP_DIR/" 2>/dev/null || true
    
    print_success "Backup completed: $BACKUP_DIR"
}

# Function to show logs
show_logs() {
    container="$1"
    if [ -z "$container" ]; then
        print_status "Showing logs for all neural-ai containers..."
        docker-compose -f docker/docker-compose.unified-neural-mcp.yml logs --tail=50
    else
        print_status "Showing logs for $container..."
        docker logs --tail=50 "$container"
    fi
}

# Main script logic
case "$1" in
    start)
        start_system
        ;;
    stop)
        stop_system
        ;;
    restart)
        restart_system
        ;;
    status)
        check_status
        ;;
    disable-autostart)
        disable_autostart
        ;;
    enable-autostart)
        enable_autostart
        ;;
    backup)
        backup_data
        ;;
    logs)
        show_logs "$2"
        ;;
    *)
        echo "Neural AI Collaboration Platform Control Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|disable-autostart|enable-autostart|backup|logs [container]}"
        echo ""
        echo "Commands:"
        echo "  start              - Start the Neural AI system"
        echo "  stop               - Stop the Neural AI system"
        echo "  restart            - Restart the Neural AI system"
        echo "  status             - Check system status"
        echo "  disable-autostart  - Prevent containers from auto-starting on boot"
        echo "  enable-autostart   - Allow containers to auto-start on boot"
        echo "  backup             - Create a backup of system data"
        echo "  logs [container]   - Show logs (all containers or specific one)"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 status"
        echo "  $0 logs neural-mcp-unified"
        exit 1
        ;;
esac

exit 0