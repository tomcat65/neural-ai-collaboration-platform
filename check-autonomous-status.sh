#!/bin/bash

# Token-Optimized Autonomous AI Team Status Check
# Neural AI Collaboration Platform

echo "📊 Token-Optimized Autonomous AI Team Status Check"
echo "=================================================="
echo "🕐 Check Time: $(date)"
echo ""

# Check agent processes
echo "🤖 Agent Status:"
echo "================"

for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    if [ -f "data/logs/${agent}.pid" ]; then
        pid=$(cat data/logs/${agent}.pid)
        if ps -p $pid > /dev/null 2>&1; then
            echo "   ✅ ${agent}: Running (PID: ${pid})"
            echo "      📝 Log: data/logs/${agent}-autonomous.log"
            
            # Show last activity from log
            if [ -f "data/logs/${agent}-autonomous.log" ]; then
                last_activity=$(tail -1 "data/logs/${agent}-autonomous.log" | cut -d']' -f2- | sed 's/^ *//')
                if [ ! -z "$last_activity" ]; then
                    echo "      🔄 Last Activity: ${last_activity}"
                fi
            fi
        else
            echo "   ❌ ${agent}: Process not running (PID: ${pid})"
        fi
    else
        echo "   ❌ ${agent}: PID file not found"
    fi
    echo ""
done

# Check token usage if platform is running
echo "💰 Token Usage Status:"
echo "====================="

if curl -s http://localhost:5174/system/status > /dev/null 2>&1; then
    echo "   🟢 Platform API: Available"
    
    # Try to get token usage stats
    token_stats=$(curl -s http://localhost:5174/system/token-usage 2>/dev/null)
    if [ ! -z "$token_stats" ]; then
        echo "   📊 Token Statistics:"
        echo "$token_stats" | jq -r '.agents[] | "      " + .agent + ": " + (.usage.percentage | tostring) + "% (" + (.usage.used | tostring) + "/" + (.usage.limit | tostring) + ")"' 2>/dev/null || echo "      📈 Token usage data available"
    else
        echo "   📈 Token monitoring: Active (data not yet available)"
    fi
else
    echo "   🔴 Platform API: Not available"
    echo "   💡 Token usage will be tracked locally by agents"
fi
echo ""

# System health check
echo "🏥 System Health:"
echo "================"

# Docker containers
echo "🐳 Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(neural-ai|docker)" || echo "   No neural-ai containers found"

echo ""

# Memory and CPU
echo "💾 System Resources:"
echo "   Memory Usage:"
free -h | grep -E "Mem|Swap" | awk '{print "      " $1 ": " $3 "/" $2 " (" $5 ")"}'

echo "   CPU Load:"
uptime | awk '{print "      " $0}'

echo ""

# Token optimization features
echo "⚡ Token Optimization Features:"
echo "=============================="
echo "   💰 Daily Budget: 100,000 tokens per agent"
echo "   🔄 Adaptive Polling: 15s-5min intervals"
echo "   📝 Log Level: WARN (reduced verbosity)"
echo "   ⚙️ Work Queue: Priority-based processing"
echo "   🛡️ Budget Protection: Skip operations when limit reached"
echo "   📊 Usage Tracking: Real-time monitoring"
echo ""

# Recent activity summary
echo "📡 Recent Activity Summary:"
echo "=========================="

for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    if [ -f "data/logs/${agent}-autonomous.log" ]; then
        echo "   ${agent}:"
        
        # Count different types of activities
        total_lines=$(wc -l < "data/logs/${agent}-autonomous.log")
        mcp_calls=$(grep -c "MCP command" "data/logs/${agent}-autonomous.log" 2>/dev/null || echo "0")
        token_warnings=$(grep -c "token budget exceeded" "data/logs/${agent}-autonomous.log" 2>/dev/null || echo "0")
        work_processed=$(grep -c "Processed work" "data/logs/${agent}-autonomous.log" 2>/dev/null || echo "0")
        
        echo "      📊 Total log entries: ${total_lines}"
        echo "      🔧 MCP calls: ${mcp_calls}"
        echo "      ⚠️ Token warnings: ${token_warnings}"
        echo "      ⚙️ Work processed: ${work_processed}"
        
        # Show last 3 activities
        echo "      🔄 Recent activities:"
        tail -3 "data/logs/${agent}-autonomous.log" | while read line; do
            activity=$(echo "$line" | cut -d']' -f2- | sed 's/^ *//')
            if [ ! -z "$activity" ]; then
                echo "         • ${activity}"
            fi
        done
    else
        echo "   ${agent}: No log file found"
    fi
    echo ""
done

echo "🎯 Quick Summary:"
echo "================"

# Count running agents
running_agents=0
for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    if [ -f "data/logs/${agent}.pid" ]; then
        pid=$(cat data/logs/${agent}.pid)
        if ps -p $pid > /dev/null 2>&1; then
            ((running_agents++))
        fi
    fi
done

echo "🤖 Agents Running: ${running_agents}/3"
if [ $running_agents -eq 3 ]; then
    echo "✅ Full token-optimized autonomous team operational"
else
    echo "⚠️ Some agents may need restart"
fi

echo ""
echo "🔧 Management Commands:"
echo "   🚀 Start team: ./start-autonomous-team.sh"
echo "   🛑 Stop team: ./stop-autonomous-team.sh"
echo "   📝 Watch logs: tail -f data/logs/<agent>-autonomous.log"
echo "   📊 System status: curl http://localhost:5174/system/status"
echo "   💰 Token stats: curl http://localhost:5174/system/token-usage"