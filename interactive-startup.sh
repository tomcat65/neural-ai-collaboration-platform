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

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_header() { echo -e "${BOLD}${CYAN}$1${NC}"; }
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

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
    
    echo -e "    ${BOLD}$backup_name${NC}"
    echo -e "    Path: $backup_dir"
    
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
    docker-compose -f docker/docker-compose.simple.yml down -v 2>/dev/null || true
    ./neural-ai-control.sh stop 2>/dev/null || true
    
    # Clean up any leftover containers
    docker rm -f $(docker ps -aq --filter "name=neural" --filter "name=universal" --filter "name=weaviate" --filter "name=neo4j" --filter "name=redis" --filter "name=postgres") 2>/dev/null || true
    
    print_success "System stopped"
}

# Main interactive menu
main_menu() {
    clear
    print_header "🧠 Neural AI Collaboration Platform - Interactive Startup"
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    
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
    echo "   1) 🆕 Start Fresh (new project/clean databases)"
    echo "   2) 🔄 Continue Existing Project (restore from backup)"
    echo "   3) 📊 View Available Backups"
    echo "   4) ❌ Exit"
    echo ""
    read -p "Choose option [1-4]: " choice
    
    case $choice in
        1) start_fresh ;;
        2) restore_project ;;
        3) view_backups; main_menu ;;
        4) exit 0 ;;
        *) print_error "Invalid choice"; sleep 2; main_menu ;;
    esac
}

# Function to start fresh system
start_fresh() {
    clear
    print_header "🆕 Starting Fresh Neural AI System"
    echo ""
    
    print_status "This will:"
    echo "  ✓ Start with clean databases"
    echo "  ✓ Initialize all services (PostgreSQL, Redis, Neo4j, Weaviate)"
    echo "  ✓ Create fresh neural AI data volumes"
    echo ""
    read -p "Continue? [y/N]: " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        print_status "🚀 Starting complete Neural AI system..."
        cd "$PROJECT_DIR"
        
        # Remove any existing data to ensure fresh start
        docker volume rm $(docker volume ls -q | grep neural) 2>/dev/null || true
        
        # Start the system
        ./start-complete-system.sh
        
        print_success "🎯 Fresh Neural AI system started!"
        echo ""
        print_status "Access your system at:"
        echo "  • Neural AI Platform: http://localhost:5174"
        echo "  • System Status: http://localhost:5174/system/status"
        echo "  • Universal Gateway: http://localhost:5200"
        echo ""
    else
        main_menu
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
    
    print_status "Found ${#backups[@]} backup(s):"
    echo ""
    
    local index=1
    for backup in "${backups[@]}"; do
        echo -e "${BOLD}$index)${NC}"
        show_backup_info "$backup"
        ((index++))
    done
    
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