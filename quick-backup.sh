#!/bin/bash
# Quick Backup Script for Neural AI Collaboration Platform

set -e  # Exit on any error

echo "🚀 Neural AI Collaboration Platform - Quick Backup"
echo "=================================================="

# Create timestamped backup directory
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/usb/neural-ai-backup-$BACKUP_DATE"

# Check if USB mount point exists
if [ ! -d "/mnt/usb" ]; then
    echo "❌ USB mount point /mnt/usb not found!"
    echo "💡 Please mount your USB drive first:"
    echo "   sudo mkdir -p /mnt/usb"
    echo "   sudo mount /dev/sdX1 /mnt/usb  # Replace sdX1 with your USB device"
    exit 1
fi

echo "📂 Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Function to show progress
show_progress() {
    echo "⏳ $1..."
}

# Backup Docker volumes (most critical)
show_progress "Backing up Docker volumes (contains all your data)"
mkdir -p "$BACKUP_DIR/docker-volumes"

# Backup the main neural data volume
if docker volume inspect neural_unified_data >/dev/null 2>&1; then
    docker run --rm -v neural_unified_data:/data -v "$BACKUP_DIR/docker-volumes":/backup alpine sh -c "tar czf /backup/neural_unified_data.tar.gz -C /data . && echo 'Neural data backed up'"
else
    echo "⚠️  neural_unified_data volume not found, checking for alternatives..."
    # Backup any neural-related volumes
    for volume in $(docker volume ls -q | grep -i neural); do
        echo "Backing up volume: $volume"
        docker run --rm -v "$volume":/data -v "$BACKUP_DIR/docker-volumes":/backup alpine tar czf "/backup/${volume}.tar.gz" -C /data .
    done
fi

# Backup project source
show_progress "Backing up project source code"
cp -r "$(dirname "$0")" "$BACKUP_DIR/project-source"
# Remove node_modules to save space
rm -rf "$BACKUP_DIR/project-source/node_modules" 2>/dev/null || true

# Backup critical databases directly from containers
show_progress "Backing up databases"
mkdir -p "$BACKUP_DIR/database-exports"

# SQLite databases from the neural container
if docker ps | grep -q neural-mcp-unified; then
    echo "Backing up SQLite databases..."
    docker exec neural-mcp-unified sh -c "ls /app/data/*.db" 2>/dev/null | while read db; do
        db_name=$(basename "$db")
        docker cp "neural-mcp-unified:/app/data/$db_name" "$BACKUP_DIR/database-exports/" 2>/dev/null || echo "Could not backup $db_name"
    done
fi

# Redis backup
if docker ps | grep -q redis; then
    echo "Backing up Redis data..."
    redis_container=$(docker ps --format "{{.Names}}" | grep redis | head -1)
    docker exec "$redis_container" redis-cli BGSAVE 2>/dev/null || echo "Redis backup command failed"
    sleep 2
    docker cp "$redis_container:/data/dump.rdb" "$BACKUP_DIR/database-exports/redis-dump.rdb" 2>/dev/null || echo "Could not copy Redis data"
fi

# Backup configurations
show_progress "Backing up configurations"
mkdir -p "$BACKUP_DIR/configs"

# Docker configs
cp -r "$(dirname "$0")/docker" "$BACKUP_DIR/configs/" 2>/dev/null || true
# MCP configs
cp -r "$(dirname "$0")/.cursor" "$BACKUP_DIR/configs/" 2>/dev/null || true
# Global cursor config
cp ~/.cursor/mcp.json "$BACKUP_DIR/configs/global-cursor-mcp.json" 2>/dev/null || true

# Create simple restoration script
show_progress "Creating restoration script"
cat > "$BACKUP_DIR/RESTORE-SIMPLE.sh" << 'EOF'
#!/bin/bash
echo "🔄 Restoring Neural AI Collaboration Platform..."

# Get directories
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/neural-ai-restored"

echo "Restoring to: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# Restore source
cp -r "$BACKUP_DIR/project-source/"* "$TARGET_DIR/"

# Install and build
cd "$TARGET_DIR"
npm install && npm run build

# Start containers
docker-compose -f docker/docker-compose.simple.yml up -d
sleep 30

# Restore volumes if available
cd "$BACKUP_DIR/docker-volumes"
for backup_file in *.tar.gz; do
    if [ -f "$backup_file" ]; then
        volume_name="${backup_file%.tar.gz}"
        echo "Restoring $volume_name..."
        docker run --rm -v "$volume_name":/data -v "$(pwd)":/backup alpine sh -c "cd /data && tar xzf /backup/$backup_file"
    fi
done

# Restart to pick up data
docker-compose -f docker/docker-compose.simple.yml restart
sleep 30

echo "✅ Restoration complete!"
echo "Access at: http://localhost:6174"
EOF

chmod +x "$BACKUP_DIR/RESTORE-SIMPLE.sh"

# Create backup info
show_progress "Creating backup summary"
cat > "$BACKUP_DIR/BACKUP-INFO.txt" << EOF
Neural AI Collaboration Platform Backup
=======================================

Backup Date: $(date)
Source Machine: $(hostname)
Backup Location: $BACKUP_DIR

Contents:
- docker-volumes/: Database and persistent data
- project-source/: Complete source code  
- database-exports/: Individual database files
- configs/: Configuration files
- RESTORE-SIMPLE.sh: Restoration script

To Restore:
1. Copy this folder to new machine
2. Run: ./RESTORE-SIMPLE.sh
3. Access: http://localhost:6174

Requirements: Docker, Node.js 18+, Linux/WSL2
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo "✅ BACKUP COMPLETE!"
echo "📂 Location: $BACKUP_DIR"
echo "📏 Size: $BACKUP_SIZE"
echo "📄 Files: $(find "$BACKUP_DIR" -type f | wc -l)"
echo ""
echo "🎯 Your Neural AI system is now safely backed up!"
echo "💾 USB backup ready for transfer to any machine"
echo ""
echo "To restore: Run ./RESTORE-SIMPLE.sh from the backup directory"