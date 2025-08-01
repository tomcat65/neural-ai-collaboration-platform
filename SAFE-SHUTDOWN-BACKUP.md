# 🔒 Safe Shutdown & Complete Backup Guide

## 🎯 Goal: Preserve All Data for USB Transfer & Machine Migration

This guide ensures you can safely shutdown, backup everything to a USB drive, and restore on any other machine without losing any of your valuable neural AI collaboration data.

---

## 📋 **Step 1: Pre-Shutdown Data Inventory**

### **Check Current System Status**
```bash
# Check all containers and data
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker system df -v
```

### **Verify Data Locations**
```bash
# Check Docker volumes
docker volume ls | grep -E "(neural|redis|neo4j|weaviate|postgres)"

# Check local data directories
ls -la /home/tomcat65/projects/shared-memory-mcp/
ls -la /home/tomcat65/projects/shared-memory-mcp/data/
ls -la /home/tomcat65/projects/shared-memory-mcp/logs/
```

---

## 💾 **Step 2: Complete Data Backup**

### **Create Backup Directory**
```bash
# Create timestamped backup
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/usb/neural-ai-backup-$BACKUP_DATE"
mkdir -p "$BACKUP_DIR"

echo "🔄 Creating backup at: $BACKUP_DIR"
```

### **2A: Backup Docker Volumes (CRITICAL)**
```bash
# Backup all neural AI volumes
echo "📦 Backing up Docker volumes..."

# Create volume backup directory
mkdir -p "$BACKUP_DIR/docker-volumes"

# Backup each volume (this preserves all database data)
docker run --rm -v neural_unified_data:/data -v "$BACKUP_DIR/docker-volumes":/backup alpine tar czf /backup/neural_unified_data.tar.gz -C /data .

# If you have other volumes, backup them too
for volume in $(docker volume ls -q | grep -E "(neural|redis|neo4j|weaviate|postgres)"); do
    echo "Backing up volume: $volume"
    docker run --rm -v "$volume":/data -v "$BACKUP_DIR/docker-volumes":/backup alpine tar czf "/backup/${volume}.tar.gz" -C /data .
done
```

### **2B: Backup Project Files**
```bash
# Backup entire project directory
echo "📁 Backing up project files..."
cp -r /home/tomcat65/projects/shared-memory-mcp "$BACKUP_DIR/project-source"

# Remove node_modules to save space (can be reinstalled)
rm -rf "$BACKUP_DIR/project-source/node_modules"
```

### **2C: Backup Database Exports (Extra Safety)**
```bash
# Create database exports directory
mkdir -p "$BACKUP_DIR/database-exports"

# SQLite databases (direct copy)
echo "💾 Backing up SQLite databases..."
docker exec neural-mcp-unified cp /app/data/unified-memory.db /tmp/
docker exec neural-mcp-unified cp /app/data/unified-platform.db /tmp/
docker cp neural-mcp-unified:/tmp/unified-memory.db "$BACKUP_DIR/database-exports/"
docker cp neural-mcp-unified:/tmp/unified-platform.db "$BACKUP_DIR/database-exports/"

# Redis data export
echo "📊 Backing up Redis data..."
docker exec docker-redis-1 redis-cli BGSAVE
sleep 5  # Wait for background save
docker cp docker-redis-1:/data/dump.rdb "$BACKUP_DIR/database-exports/redis-dump.rdb"

# Neo4j database export
echo "🕸️ Backing up Neo4j database..."
docker exec docker-neo4j-1 neo4j-admin database dump neo4j --to-path=/tmp/
docker cp docker-neo4j-1:/tmp/neo4j.dump "$BACKUP_DIR/database-exports/"

# Weaviate backup (if available)
echo "🔍 Backing up Weaviate data..."
curl -X POST "http://localhost:8080/v1/backups/filesystem" \
  -H "Content-Type: application/json" \
  -d '{"id": "backup-'$BACKUP_DATE'"}' 2>/dev/null || echo "Weaviate backup via API not available"
```

### **2D: Backup Configuration Files**
```bash
# Backup all configuration files
echo "⚙️ Backing up configurations..."
mkdir -p "$BACKUP_DIR/configs"

# Docker configurations
cp -r /home/tomcat65/projects/shared-memory-mcp/docker "$BACKUP_DIR/configs/"

# MCP configurations
cp -r /home/tomcat65/projects/shared-memory-mcp/.cursor "$BACKUP_DIR/configs/"

# Global Cursor config
cp /home/tomcat65/.cursor/mcp.json "$BACKUP_DIR/configs/global-cursor-mcp.json" 2>/dev/null || echo "No global Cursor config found"

# Any other important configs
cp /home/tomcat65/projects/shared-memory-mcp/*.json "$BACKUP_DIR/configs/" 2>/dev/null
cp /home/tomcat65/projects/shared-memory-mcp/*.md "$BACKUP_DIR/configs/" 2>/dev/null
```

### **2E: Create Restoration Script**
```bash
# Create restoration script
cat > "$BACKUP_DIR/RESTORE.sh" << 'EOF'
#!/bin/bash
# Neural AI Collaboration Platform - Restoration Script

echo "🔄 Starting Neural AI Platform Restoration..."

# Get current directory
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/home/$(whoami)/projects/shared-memory-mcp"

echo "📂 Backup location: $BACKUP_DIR"
echo "🎯 Target location: $TARGET_DIR"

# Create target directory
mkdir -p "$TARGET_DIR"

# Restore project files
echo "📁 Restoring project files..."
cp -r "$BACKUP_DIR/project-source/"* "$TARGET_DIR/"

# Restore configurations
echo "⚙️ Restoring configurations..."
cp -r "$BACKUP_DIR/configs/.cursor" "$TARGET_DIR/"
mkdir -p ~/.cursor
cp "$BACKUP_DIR/configs/global-cursor-mcp.json" ~/.cursor/mcp.json 2>/dev/null || echo "No global cursor config to restore"

# Install dependencies
echo "📦 Installing dependencies..."
cd "$TARGET_DIR"
npm install

# Build project
echo "🔨 Building project..."
npm run build

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose -f docker/docker-compose.simple.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Restore Docker volumes
echo "💾 Restoring Docker volumes..."
cd "$BACKUP_DIR/docker-volumes"
for backup_file in *.tar.gz; do
    if [ -f "$backup_file" ]; then
        volume_name="${backup_file%.tar.gz}"
        echo "Restoring volume: $volume_name"
        docker run --rm -v "$volume_name":/data -v "$(pwd)":/backup alpine sh -c "cd /data && tar xzf /backup/$backup_file"
    fi
done

# Restart containers to pick up restored data
echo "🔄 Restarting containers with restored data..."
docker-compose -f docker/docker-compose.simple.yml restart

# Wait for services
sleep 30

# Test system
echo "🧪 Testing restored system..."
curl -s http://localhost:6174/health | python3 -m json.tool

echo "✅ Restoration complete!"
echo "🔗 Access points:"
echo "   Neural AI Server: http://localhost:6174"
echo "   System Status: http://localhost:6174/system/status"
echo "   Health Check: http://localhost:6174/health"

EOF

chmod +x "$BACKUP_DIR/RESTORE.sh"
```

---

## 🛑 **Step 3: Safe Container Shutdown**

### **3A: Graceful Application Shutdown**
```bash
echo "⏸️ Gracefully stopping applications..."

# Give applications time to finish current operations
curl -X POST http://localhost:6174/admin/prepare-shutdown 2>/dev/null || echo "No admin endpoint available"

# Wait a moment for operations to complete
sleep 10
```

### **3B: Stop Containers in Correct Order**
```bash
echo "🛑 Stopping containers safely..."

# Stop the main application first
docker stop neural-mcp-unified

# Stop databases in reverse dependency order
docker stop docker-weaviate-1
docker stop docker-neo4j-1  
docker stop docker-redis-1
docker stop neural-ai-postgres-simple

# Stop any remaining containers
docker-compose -f docker/docker-compose.simple.yml down --timeout 30
```

### **3C: Verify Data Integrity**
```bash
echo "🔍 Verifying backup integrity..."

# Check backup directory size
du -sh "$BACKUP_DIR"

# Verify critical files exist
echo "Checking critical backup files:"
ls -la "$BACKUP_DIR/docker-volumes/" | head -10
ls -la "$BACKUP_DIR/project-source/" | head -10
ls -la "$BACKUP_DIR/database-exports/" | head -10

# Create checksum file for integrity verification
find "$BACKUP_DIR" -type f -exec md5sum {} \; > "$BACKUP_DIR/CHECKSUMS.md5"

echo "✅ Backup verification complete"
```

---

## 📄 **Step 4: Create Backup Summary**

```bash
# Create backup summary
cat > "$BACKUP_DIR/BACKUP-INFO.md" << EOF
# Neural AI Collaboration Platform Backup

**Backup Date**: $(date)
**Source Machine**: $(hostname)
**Backup Size**: $(du -sh "$BACKUP_DIR" | cut -f1)

## Contents:
- **docker-volumes/**: All Docker volume data (databases, persistent storage)
- **project-source/**: Complete source code and configurations
- **database-exports/**: Individual database exports for extra safety
- **configs/**: All configuration files including MCP settings
- **RESTORE.sh**: Automated restoration script
- **CHECKSUMS.md5**: File integrity verification

## Key Data Preserved:
- ✅ All neural AI conversation history and entities
- ✅ Multi-database architecture (SQLite, Redis, Neo4j, Weaviate)
- ✅ MCP server configurations for Claude Desktop and Cursor
- ✅ Custom STDIO bridge implementations
- ✅ Docker container configurations
- ✅ 27 neural AI collaboration tools
- ✅ Cross-platform integration settings

## Restoration:
1. Copy this backup directory to target machine
2. Run: ./RESTORE.sh
3. Access system at http://localhost:6174

## System Requirements:
- Docker and Docker Compose
- Node.js 18+
- Linux or WSL2 environment
- 8GB+ RAM, 20GB+ storage
EOF

echo "📋 Backup summary created at: $BACKUP_DIR/BACKUP-INFO.md"
```

---

## 🚀 **Step 5: Final Verification & USB Transfer**

```bash
# Final backup verification
echo "🔎 Final backup verification..."
echo "Backup location: $BACKUP_DIR"
echo "Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "File count: $(find "$BACKUP_DIR" -type f | wc -l)"

# Show directory structure
echo "📂 Backup structure:"
tree "$BACKUP_DIR" -L 2 || ls -la "$BACKUP_DIR"

echo ""
echo "✅ BACKUP COMPLETE AND VERIFIED!"
echo ""
echo "🎯 Next steps:"
echo "1. Copy $BACKUP_DIR to USB drive"
echo "2. Safely shutdown this machine"
echo "3. On new machine: Run ./RESTORE.sh from backup directory"
echo ""
echo "🔒 Your Neural AI Collaboration Platform is fully backed up!"
```

---

## 📱 **Emergency Quick Backup (If Short on Time)**

If you need to backup quickly:

```bash
# Quick essential backup
QUICK_BACKUP="/mnt/usb/neural-ai-quick-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$QUICK_BACKUP"

# Backup just the essentials
docker run --rm -v neural_unified_data:/data -v "$QUICK_BACKUP":/backup alpine tar czf /backup/essential-data.tar.gz -C /data .
cp -r /home/tomcat65/projects/shared-memory-mcp "$QUICK_BACKUP/source" 
rm -rf "$QUICK_BACKUP/source/node_modules"

echo "⚡ Quick backup complete at: $QUICK_BACKUP"
```

---

## ✅ **Safe Shutdown Checklist**

- [ ] System status verified
- [ ] Docker volumes backed up
- [ ] Source code backed up  
- [ ] Database exports completed
- [ ] Configuration files saved
- [ ] Restoration script created
- [ ] Backup integrity verified
- [ ] Containers gracefully stopped
- [ ] Backup transferred to USB
- [ ] Machine ready for shutdown

**Your Neural AI Collaboration Platform is now safely preserved and portable! 🎉**