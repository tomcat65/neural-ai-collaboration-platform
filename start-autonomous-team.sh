#!/bin/bash

# Token-Optimized Autonomous AI Team Startup Script
# Neural AI Collaboration Platform

echo "🚀 Starting Token-Optimized Autonomous AI Team"
echo "=============================================="
echo "🕐 Start Time: $(date)"
echo ""

# Create data directory if it doesn't exist
mkdir -p data/logs

# Function to start an agent with token optimization
start_agent() {
    local agent_id=$1
    local log_file="data/logs/${agent_id}-autonomous.log"
    
    echo "🤖 Starting ${agent_id}..."
    
    # Start the agent in the background
    node autonomous-agent.js ${agent_id} > ${log_file} 2>&1 &
    local pid=$!
    
    # Store PID for management
    echo $pid > data/logs/${agent_id}.pid
    
    echo "   ✅ ${agent_id} started (PID: ${pid})"
    echo "   📝 Log: ${log_file}"
    echo ""
    
    return $pid
}

# Stop any existing agents first
echo "🛑 Stopping any existing agents..."
pkill -f "autonomous-agent.js" 2>/dev/null || true
sleep 2

# Start all agents with token optimization
echo "🚀 Starting token-optimized autonomous agents..."
echo ""

start_agent "claude-code-cli"
start_agent "claude-desktop-agent" 
start_agent "cursor-ide-agent"

echo "⏳ Waiting for agents to initialize..."
sleep 5

# Check if all agents are running
echo "🔍 Verifying agent status..."
echo ""

for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    if [ -f "data/logs/${agent}.pid" ]; then
        pid=$(cat data/logs/${agent}.pid)
        if ps -p $pid > /dev/null 2>&1; then
            echo "   ✅ ${agent}: Running (PID: ${pid})"
        else
            echo "   ❌ ${agent}: Failed to start"
        fi
    else
        echo "   ❌ ${agent}: PID file not found"
    fi
done

echo ""
echo "📊 Token Optimization Features Active:"
echo "   💰 Daily token budget: 100,000 tokens per agent"
echo "   🔄 Adaptive polling: 15s-5min based on activity"
echo "   📝 Reduced logging: WARN level by default"
echo "   ⚙️ Intelligent work queue: Priority-based processing"
echo "   🛡️ Token budget protection: Skip operations when limit reached"
echo ""

echo "🎯 Management Commands:"
echo "   📊 Check status: ./check-autonomous-status.sh"
echo "   🛑 Stop team: ./stop-autonomous-team.sh"
echo "   📝 View logs: tail -f data/logs/<agent>-autonomous.log"
echo "   💰 Token stats: curl http://localhost:5174/system/token-usage"
echo ""

echo "✅ Token-optimized autonomous team startup complete!"
echo "🤖 Agents will operate with intelligent token management"
echo "📈 Monitor token usage to prevent budget overruns"