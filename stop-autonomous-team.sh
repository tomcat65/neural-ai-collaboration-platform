#!/bin/bash

# Stop Autonomous AI Team - All Agents
# Gracefully shutdown autonomous collaboration

echo "🛑 Stopping Autonomous AI Collaboration Team"
echo "============================================"

# Function to stop agent
stop_agent() {
    local agent_id=$1
    local pid_file="data/${agent_id}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        echo "🔌 Stopping agent: $agent_id (PID: $pid)"
        
        # Send SIGTERM for graceful shutdown
        if kill -TERM "$pid" 2>/dev/null; then
            echo "✅ Graceful shutdown signal sent to $agent_id"
            
            # Wait up to 10 seconds for graceful shutdown
            local count=0
            while [ $count -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo "⚠️ Force stopping $agent_id"
                kill -KILL "$pid" 2>/dev/null
            fi
        else
            echo "ℹ️ Agent $agent_id was not running"
        fi
        
        # Clean up PID file
        rm -f "$pid_file"
    else
        echo "ℹ️ No PID file found for $agent_id"
    fi
}

# Stop all agents
echo ""
echo "🎯 Stopping autonomous agents..."

stop_agent "claude-code-cli"
stop_agent "claude-desktop-agent"
stop_agent "cursor-ide-agent"

echo ""
echo "✅ Autonomous AI Team Shutdown Complete!"
echo "======================================="
echo ""
echo "📊 Final Status:"
echo "- All autonomous agents stopped"
echo "- Collaboration sessions terminated"
echo "- Log files preserved in data/logs/"
echo ""
echo "🔧 Post-shutdown:"
echo "- Logs available for review: data/logs/*-autonomous.log"
echo "- Shared memory preserved for future sessions"
echo "- Ready to restart with: ./start-autonomous-team.sh"
echo ""
echo "🤖 Autonomous AI team is now offline."