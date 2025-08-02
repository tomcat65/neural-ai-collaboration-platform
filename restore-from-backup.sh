#!/bin/bash

# Neural AI Collaboration Platform - Restore from Backup Script
# This script restores data from backup without copying all source files

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

# Check if backup directory is provided
if [ $# -eq 0 ]; then
    print_error "Please provide the backup directory path"
    echo "Usage: $0 <backup-directory>"
    echo "Example: $0 /home/tomcat65/neural-ai-backup-20250731_232637"
    exit 1
fi

BACKUP_DIR="$1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate backup directory
if [ ! -d "$BACKUP_DIR" ]; then
    print_error "Backup directory does not exist: $BACKUP_DIR"
    exit 1
fi

if [ ! -d "$BACKUP_DIR/docker-volumes" ]; then
    print_error "No docker-volumes directory found in backup: $BACKUP_DIR/docker-volumes"
    exit 1
fi

print_status "Restoring Neural AI Platform from backup..."
print_status "Backup directory: $BACKUP_DIR"
print_status "Project directory: $PROJECT_DIR"
echo ""

# Stop any running containers first
print_status "Stopping any running containers..."
"$PROJECT_DIR/neural-ai-control.sh" stop 2>/dev/null || true

# Wait for containers to fully stop
sleep 5

# Restore Docker volumes
print_status "Restoring Docker volumes from backup..."
cd "$BACKUP_DIR/docker-volumes"

for backup_file in *.tar.gz; do
    if [ -f "$backup_file" ]; then
        volume_name="${backup_file%.tar.gz}"
        print_status "Restoring volume: $volume_name"
        
        # Create volume if it doesn't exist
        docker volume create "$volume_name" 2>/dev/null || true
        
        # Restore data to volume
        docker run --rm -v "$volume_name":/data -v "$(pwd)":/backup alpine sh -c "cd /data && tar xzf /backup/$backup_file" && \
            print_success "Restored $volume_name" || \
            print_error "Failed to restore $volume_name"
    fi
done

# Copy database files if they exist
if [ -d "$BACKUP_DIR/databases" ]; then
    print_status "Copying database files..."
    mkdir -p "$PROJECT_DIR/data"
    
    if [ -f "$BACKUP_DIR/databases/unified-platform.db" ]; then
        cp "$BACKUP_DIR/databases/unified-platform.db" "$PROJECT_DIR/data/" && \
            print_success "Copied unified-platform.db"
    fi
    
    if [ -f "$BACKUP_DIR/databases/unified-memory.db" ]; then
        cp "$BACKUP_DIR/databases/unified-memory.db" "$PROJECT_DIR/data/" && \
            print_success "Copied unified-memory.db"
    fi
fi

# Copy configurations if they exist
if [ -d "$BACKUP_DIR/configs" ]; then
    print_status "Restoring configurations..."
    
    # Copy cursor configurations if they exist
    if [ -f "$BACKUP_DIR/configs/global-cursor-mcp.json" ]; then
        mkdir -p ~/.cursor
        cp "$BACKUP_DIR/configs/global-cursor-mcp.json" ~/.cursor/mcp.json && \
            print_success "Restored Cursor MCP configuration"
    fi
    
    # Copy .cursor directory if it exists
    if [ -d "$BACKUP_DIR/configs/.cursor" ]; then
        cp -r "$BACKUP_DIR/configs/.cursor" "$PROJECT_DIR/" 2>/dev/null && \
            print_success "Restored .cursor directory"
    fi
fi

echo ""
print_status "Starting Neural AI Platform with restored data..."
cd "$PROJECT_DIR"

# Start the system using the control script
"$PROJECT_DIR/neural-ai-control.sh" start

# Wait for services to be ready
print_status "Waiting for services to be healthy..."
sleep 15

# Verify the system is running
print_status "Verifying system health..."
if curl -s http://localhost:6174/health > /dev/null 2>&1; then
    print_success "Neural AI Server is healthy"
else
    print_warning "Neural AI Server may still be starting up..."
fi

# Show final status
echo ""
"$PROJECT_DIR/neural-ai-control.sh" status

echo ""
print_success "Restoration complete!"
echo ""
echo "📊 Restored data includes:"
echo "   - Docker volumes with all stored entities and messages"
echo "   - Database files (if they existed in backup)"
echo "   - Configuration files"
echo ""
echo "🌐 Access your restored system at:"
echo "   - Neural AI Server: http://localhost:6174"
echo "   - System Status: http://localhost:6174/system/status"
echo "   - Message Hub WebSocket: ws://localhost:3003"
echo ""
echo "💡 Tips:"
echo "   - Check logs: ./neural-ai-control.sh logs"
echo "   - View messages: curl http://localhost:6174/debug/all-messages"
echo "   - Stop system: ./neural-ai-control.sh stop"