# Restoring Neural AI Collaboration Platform from Backup

## Overview

This guide explains how to restore your Neural AI Collaboration Platform using data from a backup directory. The restoration process preserves all your stored entities, messages, and configurations without overwriting your current source code.

## Quick Restore

```bash
# Navigate to project directory
cd /home/tomcat65/projects/shared-memory-mcp

# Run restore script with your backup directory
./restore-from-backup.sh /home/tomcat65/neural-ai-backup-20250731_232637
```

## What Gets Restored

1. **Docker Volumes** (Primary Data)
   - `shared-memory-mcp_neural_ai_config` - Configuration data
   - `shared-memory-mcp_neural_ai_data` - Application data
   - `shared-memory-mcp_neural_ai_logs` - Log files
   - `shared-memory-mcp_neural_unified_data` - Unified platform data

2. **Database Files**
   - `unified-platform.db` - Main platform database
   - `unified-memory.db` - Memory system database

3. **Configuration Files**
   - Cursor MCP configuration (`~/.cursor/mcp.json`)
   - Project-specific `.cursor` directory

## Step-by-Step Process

### 1. Stop Current System (if running)
```bash
./neural-ai-control.sh stop
```

### 2. Run Restore Script
```bash
./restore-from-backup.sh /path/to/backup-directory
```

### 3. Verify Restoration
```bash
# Check system status
./neural-ai-control.sh status

# Test API health
curl http://localhost:6174/health

# View restored messages
curl http://localhost:6174/debug/all-messages
```

## Manual Restoration (Alternative Method)

If you prefer to restore manually:

### 1. Stop the System
```bash
./neural-ai-control.sh stop
```

### 2. Restore Docker Volumes
```bash
cd /home/tomcat65/neural-ai-backup-20250731_232637/docker-volumes

# Restore each volume
for backup in *.tar.gz; do
    volume_name="${backup%.tar.gz}"
    docker volume create "$volume_name"
    docker run --rm -v "$volume_name":/data -v "$(pwd)":/backup alpine \
        sh -c "cd /data && tar xzf /backup/$backup"
done
```

### 3. Copy Database Files (if needed)
```bash
cp /home/tomcat65/neural-ai-backup-20250731_232637/databases/*.db \
   /home/tomcat65/projects/shared-memory-mcp/data/
```

### 4. Start the System
```bash
./neural-ai-control.sh start
```

## Verification Steps

After restoration, verify your data:

1. **Check System Health**
   ```bash
   curl http://localhost:6174/system/status | python3 -m json.tool
   ```

2. **View Stored Entities**
   ```bash
   # Use your MCP client to search entities
   # Or check via API endpoints
   ```

3. **Check Message History**
   ```bash
   curl http://localhost:6174/debug/all-messages
   ```

## Important Notes

- **Data Preservation**: The restore script does NOT overwrite your current source code
- **Volume Names**: Docker volumes must match the original names for proper restoration
- **Service Restart**: The system automatically starts after restoration
- **Backup Safety**: Original backup files are not modified during restoration

## Troubleshooting

### If restoration fails:

1. **Check Docker is running**
   ```bash
   docker ps
   ```

2. **Verify backup directory exists**
   ```bash
   ls -la /path/to/backup-directory
   ```

3. **Check volume restoration**
   ```bash
   docker volume ls
   ```

4. **View logs**
   ```bash
   ./neural-ai-control.sh logs
   ```

### Common Issues:

- **Permission Denied**: Run with sudo if needed for Docker operations
- **Volume Already Exists**: The script handles existing volumes gracefully
- **Service Won't Start**: Check port availability (6174, 3003, 5200)

## Creating New Backups

To backup your current system:

```bash
./neural-ai-control.sh backup
```

This creates a timestamped backup in `~/neural-ai-backups/`