#!/bin/bash
# Backup Neural AI Platform to Home Directory (No USB mounting needed)

set -e  # Exit on any error

SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SCRIPT_SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  [[ $SCRIPT_SOURCE != /* ]] && SCRIPT_SOURCE="$SCRIPT_DIR/$SCRIPT_SOURCE"
done
PROJECT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"

QUIET=0
CUSTOM_NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)
      QUIET=1
      shift
      ;;
    --name)
      CUSTOM_NAME="${2:-}"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

say() {
    if [ "$QUIET" -eq 0 ]; then
        echo "$1"
    fi
}

if [ -f "$PROJECT_DIR/scripts/project-context.sh" ]; then
  # shellcheck disable=SC1090
  source "$PROJECT_DIR/scripts/project-context.sh"
fi

PROJECT_SLUG=$(get_project_slug 2>/dev/null || true)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [ -n "$CUSTOM_NAME" ]; then
  BACKUP_DIR="$HOME/$CUSTOM_NAME"
else
  BACKUP_PREFIX=$(project_backup_prefix 2>/dev/null)
  BACKUP_DIR="$HOME/${BACKUP_PREFIX}-${TIMESTAMP}"
fi

say "🏠 Neural AI Backup to Home Directory"
say "====================================="

if [ -n "$PROJECT_SLUG" ]; then
  export NEURAL_PROJECT="$PROJECT_SLUG"
  say "📛 Active project: $PROJECT_SLUG"
else
  say "⚠️  No project slug set; using generic backup name."
fi

say "📂 Creating backup at: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Function to show progress
show_progress() {
    say "⏳ $1..."
}

# Backup Docker volumes (most critical)
show_progress "Backing up Docker volumes (your valuable data)"
mkdir -p "$BACKUP_DIR/docker-volumes"

# Check if neural container is running and backup its volume
if docker ps | grep -q neural-mcp-unified; then
    echo "✅ Found neural-mcp-unified container"
    
    # Backup the unified data volume
    if docker volume inspect neural_unified_data >/dev/null 2>&1; then
        echo "Backing up neural_unified_data volume..."
        docker run --rm -v neural_unified_data:/data -v "$BACKUP_DIR/docker-volumes":/backup alpine tar czf /backup/neural_unified_data.tar.gz -C /data .
        echo "✅ Neural data volume backed up"
    fi
else
    echo "⚠️  neural-mcp-unified container not running, checking for other volumes..."
fi

# Backup any other neural-related volumes
echo "Checking for other neural volumes..."
for volume in $(docker volume ls -q | grep -i neural 2>/dev/null || true); do
    echo "Backing up volume: $volume"
    docker run --rm -v "$volume":/data -v "$BACKUP_DIR/docker-volumes":/backup alpine tar czf "/backup/${volume}.tar.gz" -C /data . 2>/dev/null || echo "Could not backup $volume"
done

# Backup project source
show_progress "Backing up project source code"
cp -r "$PROJECT_DIR" "$BACKUP_DIR/project-source"
# Remove node_modules to save space
rm -rf "$BACKUP_DIR/project-source/node_modules" 2>/dev/null || true

# Backup SQLite databases directly
show_progress "Backing up SQLite databases"
mkdir -p "$BACKUP_DIR/databases"

if docker ps | grep -q neural-mcp-unified; then
    echo "Extracting SQLite databases from container..."
    
    # List and copy any .db files
    docker exec neural-mcp-unified find /app/data -name "*.db" -type f 2>/dev/null | while read db_path; do
        db_name=$(basename "$db_path")
        echo "Copying database: $db_name"
        docker cp "neural-mcp-unified:$db_path" "$BACKUP_DIR/databases/$db_name" 2>/dev/null || echo "Could not copy $db_name"
    done
fi

# Backup configurations
show_progress "Backing up configurations"
mkdir -p "$BACKUP_DIR/configs"

# Copy important config files
cp -r "$PROJECT_DIR/docker" "$BACKUP_DIR/configs/" 2>/dev/null || true
cp -r "$PROJECT_DIR/.cursor" "$BACKUP_DIR/configs/" 2>/dev/null || true
cp ~/.cursor/mcp.json "$BACKUP_DIR/configs/global-cursor-mcp.json" 2>/dev/null || true

# Create restoration script
show_progress "Creating restoration script"
cat > "$BACKUP_DIR/RESTORE.sh" << 'EOF'
#!/bin/bash
echo "🔄 Restoring Neural AI Collaboration Platform..."

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/neural-ai-restored"

echo "Restoring from: $BACKUP_DIR"
echo "Restoring to: $TARGET_DIR"

# Restore source code
mkdir -p "$TARGET_DIR"
cp -r "$BACKUP_DIR/project-source/"* "$TARGET_DIR/"

# Restore configurations
cp -r "$BACKUP_DIR/configs/.cursor" "$TARGET_DIR/" 2>/dev/null || true
mkdir -p ~/.cursor
cp "$BACKUP_DIR/configs/global-cursor-mcp.json" ~/.cursor/mcp.json 2>/dev/null || true

# Install and build
cd "$TARGET_DIR"
echo "Installing dependencies..."
npm install
echo "Building project..."
npm run build

# Start Docker services
echo "Starting Docker services..."
docker-compose -f docker/docker-compose.simple.yml up -d
sleep 30

# Restore Docker volumes
if [ -d "$BACKUP_DIR/docker-volumes" ]; then
    echo "Restoring Docker volumes..."
    cd "$BACKUP_DIR/docker-volumes"
    for backup_file in *.tar.gz; do
        if [ -f "$backup_file" ]; then
            volume_name="${backup_file%.tar.gz}"
            echo "Restoring volume: $volume_name"
            docker volume create "$volume_name" 2>/dev/null || true
            docker run --rm -v "$volume_name":/data -v "$(pwd)":/backup alpine sh -c "cd /data && tar xzf /backup/$backup_file"
        fi
    done
fi

# Restart containers to use restored data
echo "Restarting containers..."
docker-compose -f docker/docker-compose.simple.yml restart
sleep 30

# Test system
echo "Testing system..."
curl -s http://localhost:6174/health | python3 -m json.tool 2>/dev/null || echo "System starting up..."

echo ""
echo "✅ Restoration complete!"
echo "🌐 Access your system at:"
echo "   - Neural AI Server: http://localhost:6174"
echo "   - System Status: http://localhost:6174/system/status"
echo ""
echo "🎯 Your Neural AI Collaboration Platform is restored!"
EOF

chmod +x "$BACKUP_DIR/RESTORE.sh"

# Create backup info
cat > "$BACKUP_DIR/README.txt" << EOF
Neural AI Collaboration Platform Backup
=======================================

Created: $(date)
Location: $BACKUP_DIR
Size: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "Calculating...")

Contents:
- docker-volumes/: Your valuable neural AI data
- project-source/: Complete source code
- databases/: SQLite database files  
- configs/: All configuration files
- RESTORE.sh: Automated restoration script
Active Project: ${PROJECT_SLUG:-unset}

To Restore on New Machine:
1. Copy this entire folder
2. Run: ./RESTORE.sh
3. Access: http://localhost:6174

Requirements: Docker, Node.js 18+
EOF

# Calculate final size
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "Unknown")
FILE_COUNT=$(find "$BACKUP_DIR" -type f 2>/dev/null | wc -l || echo "Unknown")

echo ""
echo "✅ BACKUP COMPLETE!"
echo "📂 Location: $BACKUP_DIR"
echo "📏 Size: $BACKUP_SIZE"
echo "📄 Files: $FILE_COUNT"
echo ""
echo "🎯 Your Neural AI system is safely backed up!"
echo "💾 You can now copy this folder to USB, external drive, or cloud storage"
echo ""
echo "📋 Next steps:"
echo "1. Copy $BACKUP_DIR to your USB drive or external storage"
echo "2. On new machine: Run ./RESTORE.sh from the backup folder"
echo "3. Your complete system will be restored!"
echo ""
echo "🔒 Safe to shutdown - your data is preserved!"
