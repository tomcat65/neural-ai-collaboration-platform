#!/bin/bash

# Token Usage Monitor for Autonomous AI Team
# Neural AI Collaboration Platform

echo "💰 Token Usage Monitor"
echo "====================="
echo "🕐 Check Time: $(date)"
echo ""

# Function to get agent token stats from logs
get_agent_token_stats() {
    local agent=$1
    local log_file="data/logs/${agent}-autonomous.log"
    
    if [ ! -f "$log_file" ]; then
        echo "   ${agent}: No log file found"
        return
    fi
    
    # Count different token-consuming operations
    local mcp_calls=$(grep -c "MCP command" "$log_file" 2>/dev/null || echo "0")
    local messages_sent=$(grep -c "Sent message" "$log_file" 2>/dev/null || echo "0")
    local entities_created=$(grep -c "Stored in memory" "$log_file" 2>/dev/null || echo "0")
    local token_warnings=$(grep -c "token budget exceeded" "$log_file" 2>/dev/null || echo "0")
    local budget_resets=$(grep -c "Token budget reset" "$log_file" 2>/dev/null || echo "0")
    
    # Estimate token usage (rough calculation)
    local estimated_tokens=$((mcp_calls * 50 + messages_sent * 150 + entities_created * 200))
    local daily_limit=100000
    local usage_percent=$((estimated_tokens * 100 / daily_limit))
    
    echo "   ${agent}:"
    echo "      📊 Estimated tokens used: ${estimated_tokens}/${daily_limit} (${usage_percent}%)"
    echo "      🔧 MCP calls: ${mcp_calls}"
    echo "      📤 Messages sent: ${messages_sent}"
    echo "      💾 Entities created: ${entities_created}"
    echo "      ⚠️ Token warnings: ${token_warnings}"
    echo "      🔄 Budget resets: ${budget_resets}"
    
    # Alert if usage is high
    if [ $usage_percent -gt 80 ]; then
        echo "      🚨 HIGH USAGE ALERT: ${usage_percent}% of daily budget used!"
    elif [ $usage_percent -gt 60 ]; then
        echo "      ⚠️ Moderate usage: ${usage_percent}% of daily budget used"
    else
        echo "      ✅ Normal usage: ${usage_percent}% of daily budget used"
    fi
}

# Check each agent's token usage
echo "🤖 Agent Token Usage:"
echo "===================="

for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    get_agent_token_stats "$agent"
    echo ""
done

# Platform token stats (if available)
echo "🌐 Platform Token Statistics:"
echo "============================"

if curl -s http://localhost:5174/system/status > /dev/null 2>&1; then
    echo "   🟢 Platform API: Available"
    
    # Try to get detailed token stats
    token_response=$(curl -s http://localhost:5174/system/token-usage 2>/dev/null)
    if [ ! -z "$token_response" ]; then
        echo "   📊 Platform Token Data:"
        echo "$token_response" | jq -r '.agents[] | "      " + .agent + ": " + (.usage.percentage | tostring) + "% (" + (.usage.used | tostring) + "/" + (.usage.limit | tostring) + ")"' 2>/dev/null || echo "      📈 Token usage data available"
    else
        echo "   📈 Token monitoring: Active (data not yet available)"
    fi
else
    echo "   🔴 Platform API: Not available"
    echo "   💡 Using local log analysis for token estimates"
fi

echo ""

# Optimization effectiveness
echo "⚡ Optimization Effectiveness:"
echo "============================="

total_warnings=0
total_resets=0
total_mcp_calls=0

for agent in "claude-code-cli" "claude-desktop-agent" "cursor-ide-agent"; do
    log_file="data/logs/${agent}-autonomous.log"
    if [ -f "$log_file" ]; then
        warnings=$(grep -c "token budget exceeded" "$log_file" 2>/dev/null || echo "0")
        resets=$(grep -c "Token budget reset" "$log_file" 2>/dev/null || echo "0")
        mcp_calls=$(grep -c "MCP command" "$log_file" 2>/dev/null || echo "0")
        
        total_warnings=$((total_warnings + warnings))
        total_resets=$((total_resets + resets))
        total_mcp_calls=$((total_mcp_calls + mcp_calls))
    fi
done

echo "   📊 Total MCP calls across all agents: ${total_mcp_calls}"
echo "   ⚠️ Total token budget warnings: ${total_warnings}"
echo "   🔄 Total budget resets: ${total_resets}"

if [ $total_warnings -eq 0 ]; then
    echo "   ✅ Excellent: No token budget warnings detected"
elif [ $total_warnings -lt 5 ]; then
    echo "   ⚠️ Good: Few token budget warnings (${total_warnings})"
else
    echo "   🚨 Warning: High number of token budget warnings (${total_warnings})"
fi

echo ""

# Recommendations
echo "💡 Token Optimization Recommendations:"
echo "===================================="

if [ $total_warnings -gt 10 ]; then
    echo "   🚨 HIGH PRIORITY:"
    echo "      • Consider reducing polling frequency"
    echo "      • Implement more aggressive caching"
    echo "      • Review work queue priorities"
    echo "      • Monitor for token budget leaks"
elif [ $total_warnings -gt 5 ]; then
    echo "   ⚠️ MEDIUM PRIORITY:"
    echo "      • Monitor token usage patterns"
    echo "      • Consider adjusting adaptive intervals"
    echo "      • Review logging verbosity"
else
    echo "   ✅ OPTIMAL:"
    echo "      • Token optimization working well"
    echo "      • Continue monitoring for efficiency"
    echo "      • Consider fine-tuning for specific workloads"
fi

echo ""

# Real-time monitoring option
echo "📈 Real-time Monitoring:"
echo "======================="
echo "   💰 Watch token usage: ./monitor-token-usage.sh"
echo "   📊 Check agent status: ./check-autonomous-status.sh"
echo "   📝 View detailed logs: tail -f data/logs/<agent>-autonomous.log"
echo "   🔧 Restart with optimization: ./start-autonomous-team.sh"

echo ""
echo "🎯 Token Budget Summary:"
echo "======================="
echo "   💰 Daily limit per agent: 100,000 tokens"
echo "   🔄 Adaptive polling: 15s-5min intervals"
echo "   🛡️ Budget protection: Skip operations when limit reached"
echo "   📊 Real-time tracking: Enabled"
echo "   ⚡ Optimization: Token-optimized autonomous operation" 