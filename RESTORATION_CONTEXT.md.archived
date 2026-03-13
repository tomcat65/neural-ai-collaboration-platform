# Neural AI Collaboration Platform - Restoration Context

## Current Situation (August 1, 2025)

### Problem Analysis
- **Issue**: Neo4j container failing to start due to corrupted data
- **Root Cause**: Original backup script only saved volumes with "neural" in name
- **Impact**: Missing Neo4j, Weaviate, and Redis data from backup

### Backup Analysis Results
**BACKUP LOCATION**: `/home/tomcat65/neural-ai-backup-20250731_232637`

**AVAILABLE IN BACKUP**:
- ✅ Neural AI application data (entities, messages, configs)
- ✅ SQLite databases (`unified-platform.db`, `unified-memory.db`)
- ✅ PostgreSQL SQL backup files
- ✅ Application configurations

**NOT AVAILABLE IN BACKUP**:
- ❌ Neo4j graph database data
- ❌ Weaviate vector database data
- ❌ Redis cache data

### Solution Created

**COMPLETE RESTORATION SCRIPT**: `/home/tomcat65/projects/shared-memory-mcp/complete-restore.sh`

This script:
1. Restores neural AI data with correct volume mapping
2. Starts fresh Neo4j, Weaviate, Redis (they rebuild automatically)
3. Restores PostgreSQL from SQL backup files
4. Launches complete system with all 4 databases working
5. Verifies all connections and provides status report

### Volume Mapping Issue Solved
- Backup uses `shared-memory-mcp_*` prefix
- Current compose files expect `docker_*` prefix
- Script handles the mapping automatically

### System Architecture
**4-Database System**:
1. **SQLite** (Primary Storage) - Built into application
2. **Redis** (Caching Layer) - Will start fresh and rebuild
3. **Weaviate** (Vector Database) - Will start fresh and rebuild
4. **Neo4j** (Graph Database) - Will start fresh and rebuild

### MCP Configuration
**Located**: `/home/tomcat65/projects/shared-memory-mcp/.cursor/mcp.json`
**STDIO Bridge**: `/home/tomcat65/projects/shared-memory-mcp/.cursor/mcp-stdio-final.cjs`

### Next Steps
1. **Start Claude Code in projects directory**: `cd /home/tomcat65/projects/shared-memory-mcp`
2. **Run complete restoration**: `./complete-restore.sh /home/tomcat65/neural-ai-backup-20250731_232637`
3. **Verify MCP connection**: Use the neural-ai-collaboration tools to store context
4. **System will be fully operational** with all 4 databases

### Important Notes
- Neo4j, Weaviate, Redis starting fresh is NORMAL and OK
- They will automatically rebuild relationships, embeddings, and cache as you use the system
- Your valuable neural AI data (entities, messages, conversations) is preserved
- The system is designed for graceful degradation and will reconnect all databases

### File Locations
- **Project Directory**: `/home/tomcat65/projects/shared-memory-mcp`
- **Backup Directory**: `/home/tomcat65/neural-ai-backup-20250731_232637`
- **Main Compose File**: `docker/docker-compose.simple.yml`
- **Control Script**: `neural-ai-control.sh`
- **Complete Restore Script**: `complete-restore.sh`

### Status
- ✅ Analysis complete
- ✅ Solution scripts created
- ✅ Volume mapping resolved
- ✅ MCP configuration identified
- 🚀 Ready for complete system restoration

## Commands Summary

```bash
# Navigate to projects directory
cd /home/tomcat65/projects/shared-memory-mcp

# Run complete restoration (includes all 4 databases)
./complete-restore.sh /home/tomcat65/neural-ai-backup-20250731_232637

# Check system status after restoration
curl http://localhost:5174/system/status | python3 -m json.tool

# Access points after restoration:
# - Neural AI Platform: http://localhost:5174
# - Universal Gateway: http://localhost:5200
# - Vue Dashboard: http://localhost:5176
# - Weaviate: http://localhost:8080
# - Neo4j Browser: http://localhost:7474
```

---
*Context saved on August 1, 2025 - Ready for projects directory restart*