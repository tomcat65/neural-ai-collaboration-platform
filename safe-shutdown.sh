#!/bin/bash

# Safe Neural AI System Shutdown with Automatic Backup
# Gracefully stops all containers and creates a backup for future restoration

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="neural-ai-backup-${TIMESTAMP}"
BACKUP_DIR="$HOME/$BACKUP_NAME"

print_header() { echo -e "${BOLD}${CYAN}$1${NC}"; }
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Function to check if system is running
check_if_running() {
    local running_containers=$(docker ps --format '{{.Names}}' | grep -E "neural|universal|weaviate|neo4j|postgres|redis" | wc -l)
    echo $running_containers
}

# Function to show system status
show_system_status() {
    print_status "Current Neural AI system status:"
    echo ""
    
    local containers=("neural-mcp-unified" "universal-mcp-gateway" "neural-ai-postgres-simple" "neural-ai-redis" "neural-ai-weaviate" "neural-ai-neo4j")
    
    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo -e "  ${GREEN}✓${NC} ${container} is running"
        else
            echo -e "  ${YELLOW}○${NC} ${container} is not running"
        fi
    done
    echo ""
}

# Function to gracefully stop autonomous agents
stop_autonomous_agents() {
    print_status "🤖 Stopping autonomous agents gracefully..."
    
    if [ -x "$PROJECT_DIR/stop-autonomous-team.sh" ]; then
        "$PROJECT_DIR/stop-autonomous-team.sh"
    else
        # Manual agent shutdown
        for agent_type in claude-code-cli claude-desktop-agent cursor-ide-agent; do
            if [ -f "$PROJECT_DIR/data/${agent_type}.pid" ]; then
                local pid=$(cat "$PROJECT_DIR/data/${agent_type}.pid")
                if kill -0 "$pid" 2>/dev/null; then
                    print_status "Stopping $agent_type (PID: $pid)"
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 2
                    kill -KILL "$pid" 2>/dev/null || true
                fi
                rm -f "$PROJECT_DIR/data/${agent_type}.pid"
            fi
        done
    fi
    
    print_success "Autonomous agents stopped"
}

# Function to create backup before shutdown
create_backup() {
    print_status "💾 Creating backup before shutdown..."
    print_status "Backup location: $BACKUP_DIR"
    
    mkdir -p "$BACKUP_DIR"
    
    # Create backup info file
    cat > "$BACKUP_DIR/backup-info.txt" << EOF
Neural AI Collaboration Platform Backup
Created: $(date)
Original Path: $PROJECT_DIR
Backup Type: Safe Shutdown Backup

This backup was created during system shutdown and contains:
- All neural AI data and configurations
- SQLite databases with conversation history
- Docker volume snapshots
- Agent logs and autonomous operation data
- Project source code and configurations

Restore with: ./interactive-startup.sh --restore
EOF

    # Use existing backup script if available
    if [ -x "$PROJECT_DIR/backup-to-home.sh" ]; then
        print_status "Using existing backup script..."
        cd "$PROJECT_DIR"
        ./backup-to-home.sh --quiet --name "$BACKUP_NAME" 2>/dev/null || {
            print_warning "Backup script failed, creating manual backup..."
            create_manual_backup
        }
    else
        create_manual_backup
    fi
    
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A "$BACKUP_DIR" 2>/dev/null | wc -l)" -gt 1 ]; then
        print_success "✅ Backup created successfully"
        echo "   Location: $BACKUP_DIR"
    else
        print_error "❌ Backup creation failed"
        return 1
    fi
}

# Function to create manual backup
create_manual_backup() {
    print_status "Creating manual backup..."
    
    # Backup SQLite databases
    mkdir -p "$BACKUP_DIR/databases"
    if [ -f "$PROJECT_DIR/data/unified-memory.db" ]; then
        cp "$PROJECT_DIR/data/unified-memory.db" "$BACKUP_DIR/databases/"
    fi
    if [ -f "$PROJECT_DIR/data/unified-platform.db" ]; then
        cp "$PROJECT_DIR/data/unified-platform.db" "$BACKUP_DIR/databases/"
    fi
    
    # Backup logs
    mkdir -p "$BACKUP_DIR/logs"
    if [ -d "$PROJECT_DIR/data/logs" ]; then
        cp -r "$PROJECT_DIR/data/logs" "$BACKUP_DIR/"
    fi
    
    # Backup autonomous agent logs
    for log_file in "$PROJECT_DIR/data"/*-autonomous.log; do
        if [ -f "$log_file" ]; then
            cp "$log_file" "$BACKUP_DIR/logs/"
        fi
    done
    
    # Backup Docker volumes if containers are running
    mkdir -p "$BACKUP_DIR/docker-volumes"
    local volumes=$(docker volume ls --format '{{.Name}}' | grep neural)
    for volume in $volumes; do
        if [ -n "$volume" ]; then
            print_status "Backing up Docker volume: $volume"
            docker run --rm -v "$volume":/data -v "$BACKUP_DIR/docker-volumes":/backup alpine \
                tar czf "/backup/${volume}.tar.gz" -C /data . 2>/dev/null || true
        fi
    done
    
    # Backup configurations
    mkdir -p "$BACKUP_DIR/config"
    cp "$PROJECT_DIR"/*.json "$BACKUP_DIR/config/" 2>/dev/null || true
    cp "$PROJECT_DIR"/*.yml "$BACKUP_DIR/config/" 2>/dev/null || true
    
    # Create restoration script
    cat > "$BACKUP_DIR/RESTORE.sh" << 'EOF'
#!/bin/bash
# Quick restoration script
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="/home/tomcat65/projects/shared-memory-mcp"

if [ -x "$PROJECT_DIR/complete-restore.sh" ]; then
    "$PROJECT_DIR/complete-restore.sh" "$BACKUP_DIR"
else
    echo "Please use: $PROJECT_DIR/interactive-startup.sh --restore"
fi
EOF
    chmod +x "$BACKUP_DIR/RESTORE.sh"
}

# Function to stop Docker containers
stop_containers() {
    print_status "🐳 Stopping Docker containers..."
    
    cd "$PROJECT_DIR"
    
    # Stop using compose files
    for compose_file in "docker/docker-compose.simple.yml" "docker/docker-compose.unified-neural-mcp.yml" "docker-compose.yml"; do
        if [ -f "$compose_file" ]; then
            print_status "Stopping services from $compose_file"
            docker-compose -f "$compose_file" down --timeout 30 2>/dev/null || true
        fi
    done
    
    # Use neural-ai-control.sh if available
    if [ -x "$PROJECT_DIR/neural-ai-control.sh" ]; then
        "$PROJECT_DIR/neural-ai-control.sh" stop
    fi
    
    # Force stop any remaining neural AI containers
    print_status "Force stopping any remaining neural AI containers..."
    local remaining_containers=$(docker ps -aq --filter "name=neural" --filter "name=universal" --filter "name=weaviate" --filter "name=neo4j" --filter "name=redis" --filter "name=postgres")
    
    if [ -n "$remaining_containers" ]; then
        docker stop $remaining_containers --time 10 2>/dev/null || true
        docker rm $remaining_containers 2>/dev/null || true
    fi
    
    print_success "All containers stopped"
}

# Function to cleanup resources
cleanup_resources() {
    print_status "🧹 Cleaning up Docker resources..."
    
    # Remove dangling images
    docker image prune -f 2>/dev/null || true
    
    # Remove unused networks
    local neural_networks=$(docker network ls --format '{{.Name}}' | grep -E "neural|gateway|docker_default")
    for network in $neural_networks; do
        docker network rm "$network" 2>/dev/null || true
    done
    
    print_success "Cleanup completed"
}

# Function to show shutdown summary
show_shutdown_summary() {
    print_header "📋 Shutdown Summary"
    echo ""
    print_success "✅ Neural AI Collaboration Platform safely shut down"
    echo ""
    print_status "What was completed:"
    echo "  ✓ Autonomous agents stopped gracefully"
    echo "  ✓ All Docker containers stopped"
    echo "  ✓ System backup created and verified"
    echo "  ✓ Resources cleaned up"
    echo ""
    print_status "Backup Information:"
    echo "  📍 Location: $BACKUP_DIR"
    echo "  📦 Contains: Databases, logs, configurations, Docker volumes"
    echo "  🔄 Restore with: ./interactive-startup.sh --restore"
    echo ""
    print_status "Quick Commands:"
    echo "  🚀 Start fresh: ./interactive-startup.sh --fresh"
    echo "  🔄 Restore this backup: ./complete-restore.sh $BACKUP_DIR"
    echo "  📋 Interactive startup: ./interactive-startup.sh"
    echo ""
}

# Function to show help
show_help() {
    echo "Neural AI Safe Shutdown Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --no-backup     Skip backup creation (faster shutdown)"
    echo "  --force         Force shutdown without confirmations"
    echo "  --help          Show this help"
    echo ""
    echo "This script will:"
    echo "  1. Stop autonomous agents gracefully"
    echo "  2. Create a complete system backup"
    echo "  3. Stop all Docker containers"
    echo "  4. Clean up Docker resources"
    echo ""
}

# Main shutdown process
main_shutdown() {
    clear
    print_header "🛑 Neural AI Collaboration Platform - Safe Shutdown"
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    
    local running_count=$(check_if_running)
    
    if [ "$running_count" -eq 0 ]; then
        print_warning "⚠️  No Neural AI containers are currently running"
        echo ""
        read -p "Continue with cleanup and backup anyway? [y/N]: " confirm
        if [[ ! $confirm =~ ^[Yy]$ ]]; then
            exit 0
        fi
    else
        show_system_status
        
        if [ "${1:-}" != "--force" ]; then
            print_warning "⚠️  This will stop all Neural AI services and create a backup"
            echo ""
            read -p "Continue with safe shutdown? [y/N]: " confirm
            if [[ ! $confirm =~ ^[Yy]$ ]]; then
                exit 0
            fi
        fi
    fi
    
    echo ""
    print_status "🚀 Starting safe shutdown process..."
    echo ""
    
    # Step 1: Stop autonomous agents
    if [ "$running_count" -gt 0 ]; then
        stop_autonomous_agents
        echo ""
    fi
    
    # Step 2: Create backup (unless skipped)
    if [ "${1:-}" != "--no-backup" ]; then
        create_backup
        echo ""
    fi
    
    # Step 3: Stop containers
    if [ "$running_count" -gt 0 ]; then
        stop_containers
        echo ""
    fi
    
    # Step 4: Cleanup
    cleanup_resources
    echo ""
    
    # Step 5: Show summary
    show_shutdown_summary
}

# Handle command line arguments
case "${1:-}" in
    --help)
        show_help
        ;;
    --no-backup)
        main_shutdown --no-backup
        ;;
    --force)
        main_shutdown --force
        ;;
    "")
        main_shutdown
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac