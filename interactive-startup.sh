#!/bin/bash

# Interactive Neural AI Collaboration Platform Startup
# Choose to continue existing projects or start fresh

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Resolve script path (supports symlinks) to get stable project dir
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
PROJECT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

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
  get_project_slug() {
    sanitize_project_slug "${NEURAL_PROJECT:-}"
  }
  set_project_slug() {
    local sanitized
    sanitized=$(sanitize_project_slug "${1:-}")
    if [ -n "$sanitized" ]; then
      export NEURAL_PROJECT="$sanitized"
      printf '%s' "$sanitized"
      return 0
    fi
    return 1
  }
fi

refresh_project_context() {
    CURRENT_PROJECT=$(get_project_slug 2>/dev/null || true)
    if [ -n "$CURRENT_PROJECT" ]; then
        export NEURAL_PROJECT="$CURRENT_PROJECT"
    fi
}

refresh_project_context

print_header() { echo -e "${BOLD}${CYAN}$1${NC}"; }
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

ensure_project_context() {
    refresh_project_context
    if [ -z "${CURRENT_PROJECT:-}" ]; then
        print_warning "No active project set."
        prompt_for_project_slug
    fi
}

prompt_for_project_slug() {
    while true; do
        echo ""
        read -p "Enter project name (will be slugified): " raw_slug
        local sanitized
        sanitized=$(sanitize_project_slug "$raw_slug")
        if [ -z "$sanitized" ]; then
            print_error "Project slug cannot be empty after sanitizing."
            continue
        fi
        if [ "$sanitized" != "$raw_slug" ]; then
            print_status "Using slug: $sanitized"
        fi
        read -p "Confirm project slug '$sanitized'? [y/N]: " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            if set_project_slug "$sanitized" >/dev/null 2>&1; then
                CURRENT_PROJECT="$sanitized"
                export NEURAL_PROJECT="$CURRENT_PROJECT"
                print_success "Active project set to: $CURRENT_PROJECT"
            else
                print_error "Failed to set project slug."
                continue
            fi
            break
        fi
    done
}

get_backup_project_slug() {
    local backup_dir="$1"
    local backup_name
    backup_name=$(basename "$backup_dir")
    if [[ $backup_name =~ ^neural-ai-backup-([a-z0-9-]+)-([0-9]{8}[-_][0-9]{4,6})$ ]]; then
        printf '%s' "${BASH_REMATCH[1]}"
        return 0
    fi
    if [ -f "$backup_dir/backup-info.txt" ]; then
        local info
        info=$(grep -E '^Active Project:' "$backup_dir/backup-info.txt" | head -n1 | awk -F': ' '{print $2}')
        info=$(sanitize_project_slug "$info")
        if [ -n "$info" ]; then
            printf '%s' "$info"
            return 0
        fi
    fi
    return 1
}

# Function to find available backups
find_backups() {
    local backup_dirs=()
    
    # Check home directory backups
    if [ -d "$HOME" ]; then
        while IFS= read -r -d '' dir; do
            backup_dirs+=("$dir")
        done < <(find "$HOME" -maxdepth 1 -name "neural-ai-backup-*" -type d -print0 2>/dev/null)
    fi
    
    # Check project backups directory
    if [ -d "$PROJECT_DIR/backups" ]; then
        while IFS= read -r -d '' dir; do
            backup_dirs+=("$PROJECT_DIR/backups/$dir")
        done < <(find "$PROJECT_DIR/backups" -maxdepth 1 -type d -not -path "$PROJECT_DIR/backups" -print0 2>/dev/null)
    fi
    
    # Check for data.backup.* directories
    while IFS= read -r -d '' dir; do
        backup_dirs+=("$dir")
    done < <(find "$PROJECT_DIR" -maxdepth 1 -name "data.backup.*" -type d -print0 2>/dev/null)
    
    printf '%s\n' "${backup_dirs[@]}" | sort
}

# Function to display backup info
show_backup_info() {
    local backup_dir="$1"
    local backup_name=$(basename "$backup_dir")
    local project_slug
    project_slug=$(get_backup_project_slug "$backup_dir" 2>/dev/null || true)
    
    echo -e "    ${BOLD}$backup_name${NC}"
    echo -e "    Path: $backup_dir"
    if [ -n "$project_slug" ]; then
        echo -e "    Project: ${project_slug}"
    else
        echo -e "    Project: (unknown/legacy)"
    fi
    
    # Check what's in the backup
    local has_databases=false
    local has_volumes=false
    local has_config=false
    
    if [ -f "$backup_dir/databases/unified-memory.db" ] || [ -f "$backup_dir/unified-memory.db" ]; then
        has_databases=true
    fi
    
    if [ -d "$backup_dir/docker-volumes" ] && [ -n "$(ls -A "$backup_dir/docker-volumes" 2>/dev/null)" ]; then
        has_volumes=true
    fi
    
    if [ -f "$backup_dir/project-source/package.json" ] || [ -d "$backup_dir/src" ]; then
        has_config=true
    fi
    
    echo -n "    Contains: "
    [ "$has_databases" = true ] && echo -n "Databases "
    [ "$has_volumes" = true ] && echo -n "Docker-Volumes "
    [ "$has_config" = true ] && echo -n "Config "
    echo ""
    
    if [ -f "$backup_dir/README.txt" ]; then
        echo "    Notes: $(head -n1 "$backup_dir/README.txt")"
    fi
    echo ""
}

# Function to check if system is running
check_if_running() {
    if docker ps --format '{{.Names}}' | grep -q "neural\|universal\|weaviate\|neo4j\|postgres"; then
        return 0  # System is running
    fi
    return 1  # System is not running
}

# Function to stop current system
stop_current_system() {
    print_status "Stopping any running Neural AI containers..."
    
    cd "$PROJECT_DIR"
    docker compose -f docker/docker-compose.simple.yml -f docker/docker-compose.simple.override.yml down -v || docker compose -f docker/docker-compose.simple.yml down -v 2>/dev/null || true
    ./neural-ai-control.sh stop 2>/dev/null || true
    
    # Clean up any leftover containers
    docker rm -f $(docker ps -aq --filter "name=neural" --filter "name=universal" --filter "name=weaviate" --filter "name=neo4j" --filter "name=redis" --filter "name=postgres") 2>/dev/null || true
    
    print_success "System stopped"
}

wipe_project_state() {
    print_warning "Preparing blank memory stores for the next project..."
    rm -f "$PROJECT_DIR/data/unified-memory.db" 2>/dev/null || true
    rm -f "$PROJECT_DIR/data/unified-platform.db" 2>/dev/null || true
    rm -rf "$PROJECT_DIR/data/memory" 2>/dev/null || true
    rm -rf "$PROJECT_DIR/data/generated" 2>/dev/null || true
    rm -rf "$PROJECT_DIR/data/logs" 2>/dev/null || true
    mkdir -p "$PROJECT_DIR/data/logs"

    local volumes=(unified_neural_data unified_data weaviate_data neo4j_data neo4j_logs neo4j_import neo4j_plugins redis_data postgres_data)
    for volume in "${volumes[@]}"; do
        if docker volume inspect "$volume" >/dev/null 2>&1; then
            print_status "Removing Docker volume: $volume"
            docker volume rm "$volume" >/dev/null 2>&1 || true
        fi
    done

    print_success "Persistent state cleared."
}

# Main interactive menu
main_menu() {
    refresh_project_context
    clear
    print_header "🧠 Neural AI Collaboration Platform - Interactive Startup"
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    if [ -n "${CURRENT_PROJECT:-}" ]; then
        print_status "Active project: ${CURRENT_PROJECT}"
    else
        print_warning "Active project not set."
    fi
    
    # Check if system is already running
    if check_if_running; then
        print_warning "⚠️  Neural AI system is currently running!"
        echo ""
        echo "   1) Stop current system and restart"
        echo "   2) View system status"
        echo "   3) Exit (keep current system running)"
        echo ""
        read -p "Choose option [1-3]: " choice
        
        case $choice in
            1) stop_current_system ;;
            2) 
                ./neural-ai-control.sh status
                echo ""
                read -p "Press Enter to continue..."
                main_menu
                return
                ;;
            3) exit 0 ;;
            *) print_error "Invalid choice"; sleep 2; main_menu; return ;;
        esac
        echo ""
    fi
    
    print_status "🚀 Choose your startup option:"
    echo ""
    echo "   1) 🆕 Start Fresh Project (simple stack)"
    echo "   2) 🤝 Start Unified MCP (JSON-RPC 6174)"
    echo "   3) 🔄 Continue Existing Project (restore from backup)"
    echo "   4) 📊 View Available Backups"
    echo "   5) 🔁 Change Active Project"
    echo "   6) ❌ Exit"
    echo ""
    read -p "Choose option [1-6]: " choice
    
    case $choice in
        1) start_fresh ;;
        2) start_unified_mcp ;;
        3) restore_project ;;
        4) view_backups; main_menu ;;
        5) prompt_for_project_slug; main_menu ;;
        6) exit 0 ;;
        *) print_error "Invalid choice"; sleep 2; main_menu ;;
    esac
}

# Function to start fresh system
start_fresh() {
    clear
    print_header "🆕 Starting Fresh Neural AI System (Simple Stack)"
    echo ""
    print_status "Current active project: ${CURRENT_PROJECT:-none}" 
    echo ""
    local new_project
    while true; do
        read -p "Enter new project name (will become slug): " new_project
        local sanitized
        sanitized=$(sanitize_project_slug "$new_project")
        if [ -z "$sanitized" ]; then
            print_error "Project slug cannot be empty."
            continue
        fi
        print_status "Using project slug: $sanitized"
        read -p "Use this slug and wipe existing data? [y/N]: " slug_confirm
        if [[ $slug_confirm =~ ^[Yy]$ ]]; then
            if set_project_slug "$sanitized" >/dev/null 2>&1; then
                CURRENT_PROJECT="$sanitized"
                export NEURAL_PROJECT="$CURRENT_PROJECT"
            fi
            break
        fi
    done

    echo ""
    print_warning "This will remove cached memory, logs, and neural Docker volumes before starting a clean stack."
    read -p "Proceed with fresh start for project '$CURRENT_PROJECT'? [y/N]: " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        main_menu
        return
    fi

    wipe_project_state

    print_status "🚀 Starting complete Neural AI system (simple stack)..."
    cd "$PROJECT_DIR"
    ./start-complete-system.sh
    
    print_success "🎯 Fresh Neural AI system started for project '$CURRENT_PROJECT'!"
    echo ""
    print_status "Access your system at:"
    echo "  • Neural AI Platform (REST/UI): http://localhost:5174"
    echo "  • System Status: http://localhost:5174/system/status"
    echo "  • Universal Gateway: http://localhost:5200"
    echo ""
}

# Function to start Unified MCP server (JSON-RPC over HTTP)
start_unified_mcp() {
    clear
    ensure_project_context
    print_header "🤝 Starting Unified MCP Server (JSON-RPC over HTTP)"
    echo ""
    if [ -n "${CURRENT_PROJECT:-}" ]; then
        print_status "Project context: ${CURRENT_PROJECT}"
    fi
    print_status "This will:"
    echo "  ✓ Launch Unified MCP at http://localhost:6174/mcp"
    echo "  ✓ Start Message Hub WebSocket on ws://localhost:3004"
    echo "  ✓ Start Redis, Weaviate, Neo4j (internal)"
    echo "  ✓ Require x-api-key if API_KEY is set in .env"
    echo ""
    read -p "Continue? [y/N]: " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        cd "$PROJECT_DIR"
        export NEURAL_PROJECT="$CURRENT_PROJECT"
        print_status "🚀 Bringing up Unified MCP stack..."
        docker compose -f docker/docker-compose.unified-neural-mcp.yml up -d --build
        echo ""
        print_status "⏳ Waiting for health (about 30-60s)..."
        sleep 20
        echo ""
        print_status "🔎 Health checks:"
        echo -n "  • Unified MCP (6174): "
        curl -s http://localhost:6174/health > /dev/null 2>&1 && echo "✓ OK" || echo "✗ Not ready"
        echo -n "  • Message Hub (3004): "
        curl -s http://localhost:3004/status > /dev/null 2>&1 && echo "✓ OK" || echo "↻ Check logs"
        echo -n "  • Weaviate (8080): "
        curl -s http://localhost:8080/v1/.well-known/ready > /dev/null 2>&1 && echo "✓ OK" || echo "↻ Starting"
        echo -n "  • Neo4j (7474): "
        curl -s http://localhost:7474 > /dev/null 2>&1 && echo "✓ OK" || echo "↻ Starting"
        echo -n "  • Redis (6379): "
        docker ps -qf name=redis >/dev/null && echo "✓ Running" || echo "↻ Starting"
        echo ""
        print_success "🎯 Unified MCP is starting. Test tools with:"
        echo "  curl -s -H 'Content-Type: application/json' -H \"x-api-key: \\${API_KEY}\" \\\"http://localhost:6174/mcp\\\" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | jq"
        echo ""
    fi
}

# Function to view available backups
view_backups() {
    clear
    print_header "📊 Available Neural AI Backups"
    echo ""
    
    local backups=($(find_backups))
    
    if [ ${#backups[@]} -eq 0 ]; then
        print_warning "No backups found in:"
        echo "  • $HOME/neural-ai-backup-*"
        echo "  • $PROJECT_DIR/backups/"
        echo "  • $PROJECT_DIR/data.backup.*"
        echo ""
        read -p "Press Enter to continue..."
        return
    fi
    
    declare -A grouped
    declare -a slug_keys
    local backup
    for backup in "${backups[@]}"; do
        local slug
        slug=$(get_backup_project_slug "$backup" 2>/dev/null || true)
        if [ -z "$slug" ]; then
            slug="(unknown)"
        fi
        if [[ -z ${grouped[$slug]+x} ]]; then
            slug_keys+=("$slug")
            grouped[$slug]=""
        fi
        grouped[$slug]+="$backup"$'\n'
    done

    local sorted_keys
    sorted_keys=$(printf '%s\n' "${slug_keys[@]}" | sort)
    while IFS= read -r slug; do
        if [ -z "$slug" ]; then
            continue
        fi
        echo -e "${BOLD}Project: $slug${NC}"
        mapfile -t group_backups < <(printf '%s' "${grouped[$slug]}" | sed '/^$/d' | sort -r)
        local b
        for b in "${group_backups[@]}"; do
            show_backup_info "$b"
        done
    done <<< "$sorted_keys"
    IFS=$' \t\n'
    
    read -p "Press Enter to continue..."
}

# Function to restore from backup
restore_project() {
    clear
    print_header "🔄 Restore Existing Neural AI Project"
    echo ""
    
    local backups=($(find_backups))
    
    if [ ${#backups[@]} -eq 0 ]; then
        print_error "No backups found!"
        echo ""
        print_status "Create a backup first using:"
        echo "  ./backup-to-home.sh"
        echo ""
        read -p "Press Enter to continue..."
        main_menu
        return
    fi
    
    print_status "Available backups:"
    echo ""
    
    local index=1
    for backup in "${backups[@]}"; do
        echo -e "${BOLD}$index)${NC}"
        show_backup_info "$backup"
        ((index++))
    done
    
    echo -e "${BOLD}$((index)))${NC} 🔙 Back to main menu"
    echo ""
    read -p "Choose backup to restore [1-$index]: " choice
    
    if [ "$choice" -eq "$index" ] 2>/dev/null; then
        main_menu
        return
    fi
    
    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#backups[@]} ]; then
        print_error "Invalid choice"
        sleep 2
        restore_project
        return
    fi
    
    local selected_backup="${backups[$((choice-1))]}"
    
    echo ""
    print_warning "⚠️  This will restore from:"
    echo "   $selected_backup"
    echo ""
    print_warning "⚠️  This will stop any running containers and replace current data!"
    echo ""
    read -p "Continue with restoration? [y/N]: " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        print_status "🔄 Restoring Neural AI system from backup..."
        local restored_slug
        restored_slug=$(get_backup_project_slug "$selected_backup" 2>/dev/null || true)
        if [ -n "$restored_slug" ]; then
            set_project_slug "$restored_slug" >/dev/null 2>&1 || true
            CURRENT_PROJECT="$restored_slug"
            export NEURAL_PROJECT="$CURRENT_PROJECT"
            print_status "Project context set to '$CURRENT_PROJECT' from backup metadata."
        else
            print_warning "Could not determine project slug from backup; set manually if needed."
        fi
        
        # Use the existing restoration script
        if [ -x "$PROJECT_DIR/complete-restore.sh" ]; then
            "$PROJECT_DIR/complete-restore.sh" "$selected_backup"
        else
            print_error "Restoration script not found: $PROJECT_DIR/complete-restore.sh"
            read -p "Press Enter to continue..."
        fi
    else
        restore_project
    fi
}

# Function to show help
show_help() {
    echo "Neural AI Interactive Startup"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --fresh     Start fresh system without prompts"
    echo "  --restore   Show restore menu without main menu"
    echo "  --list      List available backups and exit"
    echo "  --help      Show this help"
    echo ""
}

# Handle command line arguments
case "${1:-}" in
    --fresh)
        start_fresh
        ;;
    --unified)
        start_unified_mcp
        ;;
    --restore)
        restore_project
        ;;
    --list)
        view_backups
        ;;
    --help)
        show_help
        ;;
    "")
        main_menu
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac
