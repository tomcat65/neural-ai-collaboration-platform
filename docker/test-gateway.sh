#!/bin/bash

# Universal MCP Gateway Testing Script
set -e

echo "🧪 Universal MCP Gateway Testing Suite"
echo "======================================"

GATEWAY_URL="http://localhost:5200"

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local description=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $description... "
    
    response=$(curl -s -w "%{http_code}" -o /tmp/test_response "$GATEWAY_URL$endpoint")
    
    if [ "$response" -eq "$expected_status" ]; then
        echo "✅ PASS"
        if [ -s /tmp/test_response ]; then
            echo "   Response preview:" | head -c 100 /tmp/test_response
            echo "..."
        fi
    else
        echo "❌ FAIL (Expected: $expected_status, Got: $response)"
        cat /tmp/test_response
        return 1
    fi
}

# Function to test JSON endpoint
test_json_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "Testing $description... "
    
    if curl -s "$GATEWAY_URL$endpoint" | python3 -c "import sys, json; json.load(sys.stdin)" > /dev/null 2>&1; then
        echo "✅ PASS (Valid JSON)"
    else
        echo "❌ FAIL (Invalid JSON)"
        curl -s "$GATEWAY_URL$endpoint"
        return 1
    fi
}

# Function to test POST endpoint
test_post_endpoint() {
    local endpoint=$1
    local data=$2
    local description=$3
    
    echo -n "Testing $description... "
    
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" -w "%{http_code}" -o /tmp/test_response "$GATEWAY_URL$endpoint")
    
    if [ "$response" -eq 200 ] || [ "$response" -eq 201 ]; then
        echo "✅ PASS"
    else
        echo "❌ FAIL (Status: $response)"
        cat /tmp/test_response
        return 1
    fi
}

echo ""
echo "🏥 Health and Status Tests"
echo "=========================="

# Test health endpoint
test_json_endpoint "/health" "Health Check"

# Test platform registry
test_json_endpoint "/api/platforms" "Platform Registry"

echo ""
echo "🔧 API Functionality Tests"
echo "=========================="

# Test entity creation
test_post_endpoint "/api/entities" '{
    "entities": [{
        "name": "Test Entity",
        "entityType": "test", 
        "observations": ["This is a test observation"]
    }]
}' "Entity Creation API"

# Test entity search
test_json_endpoint "/api/entities/search?query=test" "Entity Search API"

# Test federation sync
test_post_endpoint "/api/federation/sync" '{"force": false}' "Federation Sync API"

echo ""
echo "🌐 MCP Protocol Tests"
echo "====================="

# Test MCP tools list (if MCP server is running)
echo -n "Testing MCP Tools Discovery... "
if curl -s "$GATEWAY_URL/mcp" > /dev/null 2>&1; then
    echo "✅ PASS (MCP endpoint accessible)"
else
    echo "⚠️ SKIP (MCP endpoint not available - may be normal in HTTP-only mode)"
fi

echo ""
echo "📊 Gateway Performance Tests"
echo "============================"

# Response time test
echo -n "Testing response time... "
start_time=$(date +%s%N)
curl -s "$GATEWAY_URL/health" > /dev/null
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

if [ "$response_time" -lt 1000 ]; then
    echo "✅ PASS (${response_time}ms - Excellent)"
elif [ "$response_time" -lt 5000 ]; then
    echo "✅ PASS (${response_time}ms - Good)"
else
    echo "⚠️ SLOW (${response_time}ms - Consider optimization)"
fi

echo ""
echo "🔗 Integration Tests"
echo "==================="

# Test platform detection
echo "Testing platform detection logic..."
curl -s "$GATEWAY_URL/api/platforms" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'📋 Registered platforms: {len(data)}')
for platform in data:
    print(f'   - {platform.get(\"name\", \"Unknown\")} ({platform.get(\"id\", \"no-id\")}): {platform.get(\"status\", \"unknown\")}')
" 2>/dev/null || echo "⚠️ Could not parse platform data"

echo ""
echo "📈 System Resource Usage"
echo "========================"

# Check container stats
if docker stats universal-mcp-gateway --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null; then
    echo "✅ Container resource usage shown above"
else
    echo "⚠️ Could not get container stats - container may not be running"
fi

echo ""
echo "🎯 Test Summary"
echo "==============="

# Final connectivity test
if curl -s "$GATEWAY_URL/health" | grep -q "healthy"; then
    echo "🎉 Universal MCP Gateway is FULLY OPERATIONAL!"
    echo ""
    echo "✅ All core functionality tested"
    echo "✅ HTTP API endpoints working"
    echo "✅ JSON responses valid"
    echo "✅ Platform registry operational"
    echo "✅ Memory federation ready"
    echo ""
    echo "🚀 Ready for AI platform integration!"
    echo "🔧 Configure your MCP clients to use: localhost:5200"
else
    echo "❌ Gateway health check failed"
    echo "📋 Check logs: docker logs universal-mcp-gateway"
    exit 1
fi

# Clean up temp files
rm -f /tmp/test_response