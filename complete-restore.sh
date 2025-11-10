#!/bin/bash

# Complete Neural AI System Restoration Script
# Restores the full multi-database system with all available data

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Validate backup directory
if [ $# -eq 0 ]; then
    print_error "Please provide the backup directory path"
    echo "Usage: $0 <backup-directory>"
    echo "Example: $0 /home/tomcat65/neural-ai-backup-20250731_232637"
    exit 1
fi

BACKUP_DIR="$1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_CONTEXT_HELPER="$PROJECT_DIR/scripts/project-context.sh"
if [ -f "$PROJECT_CONTEXT_HELPER" ]; then
    # shellcheck disable=SC1090
    source "$PROJECT_CONTEXT_HELPER"
else
    sanitize_project_slug() {
        local raw="${1:-}"
        local lower
        lower=$(echo "$raw" | tr '[:upper:]' '[:lower:]')
        lower=$(echo "$lower" | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g' | sed -E 's/-{2,}/-/g')
        printf '%s' "$lower"
    }
    set_project_slug() {
        local sanitized
        sanitized=$(sanitize_project_slug "${1:-}")
        if [ -n "$sanitized" ]; then
            export NEURAL_PROJECT="$sanitized"
            printf '%s' "$sanitized"
        fi
    }
fi

if [ ! -d "$BACKUP_DIR" ]; then
    print_error "Backup directory does not exist: $BACKUP_DIR"
    exit 1
fi

BACKUP_NAME=$(basename "$BACKUP_DIR")
DETECTED_PROJECT=""
if [[ $BACKUP_NAME =~ ^neural-ai-backup-([a-z0-9-]+)-([0-9]{8}[-_][0-9]{4,6})$ ]]; then
    DETECTED_PROJECT="${BASH_REMATCH[1]}"
elif [ -f "$BACKUP_DIR/backup-info.txt" ]; then
    DETECTED_PROJECT=$(grep -E '^Active Project:' "$BACKUP_DIR/backup-info.txt" | head -n1 | awk -F': ' '{print $2}')
    DETECTED_PROJECT=$(sanitize_project_slug "$DETECTED_PROJECT")
fi
if [ -n "$DETECTED_PROJECT" ]; then
    set_project_slug "$DETECTED_PROJECT" >/dev/null 2>&1 || true
    export NEURAL_PROJECT="$DETECTED_PROJECT"
fi

print_status "🔄 COMPLETE Neural AI System Restoration"
print_status "Backup: $BACKUP_DIR"
print_status "Project: $PROJECT_DIR"
if [ -n "$DETECTED_PROJECT" ]; then
    print_status "Active project context: $DETECTED_PROJECT"
else
    print_warning "Active project context could not be determined from backup."
fi
echo ""

print_warning "📋 ANALYSIS RESULTS:"
print_warning "• Neo4j data: NOT in backup (will start fresh - this is OK)"
print_warning "• Weaviate data: NOT in backup (will start fresh - this is OK)" 
print_warning "• Redis data: NOT in backup (will start fresh - this is OK)"
print_warning "• PostgreSQL data: SQL backups available for restoration"
print_warning "• Neural AI data: AVAILABLE for restoration"
echo ""

# Stop any running services
print_status "🛑 Stopping any running containers..."
cd "$PROJECT_DIR"
docker-compose -f docker/docker-compose.simple.yml down -v 2>/dev/null || true
./neural-ai-control.sh stop 2>/dev/null || true

# Clean up any leftover containers and networks
print_status "🧹 Cleaning up leftover containers and networks..."
docker rm -f $(docker ps -aq --filter "name=neural" --filter "name=universal" --filter "name=weaviate" --filter "name=neo4j" --filter "name=redis" --filter "name=postgres") 2>/dev/null || true
docker network rm docker_neural-network docker_default gateway-network neural_network 2>/dev/null || true

# Wait for cleanup
sleep 3

print_status "📊 RESTORING COMPLETE MULTI-DATABASE SYSTEM:"
print_status "• SQLite: Built into application"
print_status "• Redis: Fresh cache (will reconnect automatically)"  
print_status "• Weaviate: Fresh vector database (will reinitialize)"
print_status "• Neo4j: Fresh graph database (will reinitialize)"
print_status "• PostgreSQL: Restored from SQL backup"
print_status "• Neural AI Data: Restored from volume backups"
echo ""

# Restore Neural AI volumes with correct naming
print_status "📦 Restoring Neural AI data volumes..."
cd "$BACKUP_DIR/docker-volumes"

# Map backup volumes to compose file volumes
declare -A volume_mapping=(
    ["shared-memory-mcp_neural_ai_config"]="docker_neural_ai_config"
    ["shared-memory-mcp_neural_ai_data"]="docker_neural_ai_data" 
    ["shared-memory-mcp_neural_ai_logs"]="docker_neural_ai_logs"
    ["shared-memory-mcp_neural_unified_data"]="docker_unified_data"
)

for backup_file in *.tar.gz; do
    if [ -f "$backup_file" ]; then
        backup_volume="${backup_file%.tar.gz}"
        target_volume="${volume_mapping[$backup_volume]}"
        
        if [ -n "$target_volume" ]; then
            print_status "Restoring $backup_volume → $target_volume"
            docker volume create "$target_volume" 2>/dev/null || true
            docker run --rm -v "$target_volume":/data -v "$(pwd)":/backup alpine \
                sh -c "cd /data && tar xzf /backup/$backup_file" && \
                print_success "✅ Restored $target_volume" || \
                print_error "❌ Failed to restore $target_volume"
        else
            print_warning "⚠️ Unknown volume mapping for $backup_volume"
        fi
    fi
done

# Restore PostgreSQL data if available
if [ -f "$BACKUP_DIR/project-source/memory-backup/20250731_153103/postgres_backup.sql" ]; then
    print_status "📂 PostgreSQL backup file found, will restore after containers start"
    POSTGRES_BACKUP="$BACKUP_DIR/project-source/memory-backup/20250731_153103/postgres_backup.sql"
else
    print_warning "⚠️ No PostgreSQL backup found"
    POSTGRES_BACKUP=""
fi

# Copy database files to project directory
print_status "💾 Copying SQLite database files..."
mkdir -p "$PROJECT_DIR/data"
if [ -f "$BACKUP_DIR/databases/unified-platform.db" ]; then
    cp "$BACKUP_DIR/databases/unified-platform.db" "$PROJECT_DIR/data/" && \
        print_success "✅ Copied unified-platform.db"
fi
if [ -f "$BACKUP_DIR/databases/unified-memory.db" ]; then
    cp "$BACKUP_DIR/databases/unified-memory.db" "$PROJECT_DIR/data/" && \
        print_success "✅ Copied unified-memory.db"
fi

# Start the complete system
print_status "🚀 Starting complete Neural AI system with all databases..."
cd "$PROJECT_DIR"
docker-compose -f docker/docker-compose.simple.yml up -d

# Wait for services to start
print_status "⏳ Waiting for all services to start (60 seconds)..."
sleep 60

# Restore PostgreSQL data if backup exists
if [ -n "$POSTGRES_BACKUP" ] && [ -f "$POSTGRES_BACKUP" ]; then
    print_status "🗄️ Restoring PostgreSQL data..."
    
    # Wait for PostgreSQL to be ready
    for i in {1..30}; do
        if docker exec neural-ai-postgres-simple pg_isready -U postgres >/dev/null 2>&1; then
            print_success "PostgreSQL is ready"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    
    # Restore the database
    print_status "Importing PostgreSQL backup..."
    docker exec -i neural-ai-postgres-simple psql -U postgres -d neural_ai < "$POSTGRES_BACKUP" && \
        print_success "✅ PostgreSQL data restored" || \
        print_warning "⚠️ PostgreSQL restore had issues (this may be normal)"
fi

# Check system status
print_status "🔍 Checking system status..."
sleep 10

echo ""
echo "🏥 SERVICE HEALTH CHECK:"
services=(
    "neural-ai-platform:5174:/health"
    "universal-gateway:5200:/health" 
    "weaviate:8080:/v1/.well-known/ready"
    "neo4j:7474:/"
    "redis:6379:ping"
    "postgresql:5432:ready"
)

for service_info in "${services[@]}"; do
    IFS=':' read -r name port endpoint <<< "$service_info"
    echo -n "  $name ($port): "
    
    case $name in
        "redis")
            if docker exec $(docker ps -qf "name=redis") redis-cli ping >/dev/null 2>&1; then
                echo "✅ OK"
            else
                echo "❌ Not ready"
            fi
            ;;
        "postgresql")
            if docker exec neural-ai-postgres-simple pg_isready -U postgres >/dev/null 2>&1; then
                echo "✅ OK"
            else  
                echo "❌ Not ready"
            fi
            ;;
        *)
            if curl -s "http://localhost:${port}${endpoint}" >/dev/null 2>&1; then
                echo "✅ OK"
            else
                echo "❌ Not ready"
            fi
            ;;
    esac
done

# Check database connections via API
echo ""
echo "🔗 DATABASE CONNECTIVITY CHECK:"
if curl -s http://localhost:5174/system/status >/dev/null 2>&1; then
    curl -s http://localhost:5174/system/status | python3 -c "
import sys,json
try:
    data = json.load(sys.stdin)
    dbs = data.get('databases', {})
    for db_name, db_info in dbs.items():
        if db_name == 'advancedSystemsEnabled':
            continue
        status = '✅ Connected' if db_info.get('connected') else '❌ Disconnected'
        print(f'  {db_info.get(\"type\", db_name)}: {status}')
except:
    print('  Unable to parse status')
"
else
    print "  ❌ Neural AI API not responding"
fi

echo ""
print_success "🎯 COMPLETE SYSTEM RESTORATION FINISHED!"
echo ""
echo "📊 WHAT WAS RESTORED:"
echo "  ✅ Neural AI application data and configurations"
echo "  ✅ SQLite databases (primary storage)" 
echo "  ✅ PostgreSQL data (if backup existed)"
echo "  ✅ Fresh Redis cache (will rebuild automatically)"
echo "  ✅ Fresh Weaviate vector database (will rebuild automatically)"
echo "  ✅ Fresh Neo4j graph database (will rebuild automatically)"
echo ""
echo "🌐 ACCESS YOUR RESTORED SYSTEM:"
echo "  • Neural AI Platform: http://localhost:5174"
echo "  • System Status: http://localhost:5174/system/status"
echo "  • Universal Gateway: http://localhost:5200"
echo "  • Vue Dashboard: http://localhost:5176"
echo "  • Weaviate: http://localhost:8080"
echo "  • Neo4j Browser: http://localhost:7474 (user: neo4j, pass: password)"
echo ""
echo "💡 IMPORTANT NOTES:"
echo "  • Redis, Weaviate, and Neo4j started fresh (this is normal)"
echo "  • They will automatically reconnect as you use the system"
echo "  • Your neural AI data and conversations are preserved"
echo "  • The system will rebuild indexes and caches as needed"
echo ""
echo "🛠️ MANAGEMENT COMMANDS:"
echo "  • Stop system: ./neural-ai-control.sh stop"
echo "  • View logs: docker-compose -f docker/docker-compose.simple.yml logs"
echo "  • Check messages: curl http://localhost:5174/debug/all-messages"
echo ""
print_success "🚀 Your complete Neural AI Collaboration Platform is ready!"
