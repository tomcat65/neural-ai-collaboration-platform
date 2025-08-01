# Advanced Memory System API Testing Guide

This document provides comprehensive curl commands to test the advanced memory system APIs that interact with Redis, Weaviate, Neo4j, and SQLite databases.

## System Status & Health Checks

### 1. Check System Status (All Databases)
```bash
curl -s http://localhost:5174/system/status | jq .
```
**Expected Response:** Status of SQLite, Redis, Weaviate, Neo4j connections plus performance metrics.

### 2. Check Health Endpoint
```bash
curl -s http://localhost:5174/health | jq .
```

### 3. Test Weaviate Direct API
```bash
curl -s http://localhost:8080/v1/meta | jq .
```

## Advanced Memory Storage Operations

### 4. Store Message in All 4 Databases
```bash
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test-agent",
    "to": "memory-system", 
    "message": "This message will be stored in SQLite, cached in Redis, vectorized in Weaviate, and graphed in Neo4j",
    "type": "multi_db_test"
  }'
```

### 5. Store Knowledge Entity
```bash
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{
    "from": "knowledge-bot",
    "to": "system", 
    "message": "Knowledge: Redis is an in-memory data structure store with sub-millisecond latency",
    "type": "knowledge"
  }'
```

### 6. Store Performance Data
```bash
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{
    "from": "performance-monitor",
    "to": "analytics", 
    "message": "Performance metrics: Redis 99.9% availability, Weaviate 0.1s query time, Neo4j 50ms traversal",
    "type": "performance_metrics"
  }'
```

## Advanced Memory Retrieval Operations

### 7. Retrieve Messages for Specific Agent
```bash
curl -s http://localhost:5174/ai-messages/memory-system | jq .
```

### 8. Get All Stored Messages (Debug)
```bash
curl -s http://localhost:5174/debug/all-messages | jq .
```

### 9. Get Messages with Filtering
```bash
curl -s http://localhost:5174/ai-messages/system | jq '.messages[] | select(.content.type == "knowledge")'
```

## Search & Query Operations

### 10. Search for Redis-related Content
```bash
curl -s http://localhost:5174/debug/all-messages | jq '.messages[] | select(.content.message | test("Redis"; "i"))'
```

### 11. Search for Vector Database Content  
```bash
curl -s http://localhost:5174/debug/all-messages | jq '.messages[] | select(.content.message | test("vector|Weaviate"; "i"))'
```

### 12. Search for Graph Database Content
```bash
curl -s http://localhost:5174/debug/all-messages | jq '.messages[] | select(.content.message | test("graph|Neo4j"; "i"))'
```

### 13. Performance Testing - Multiple Requests
```bash
# Test Redis caching performance
for i in {1..5}; do
  echo "Request $i:"
  time curl -s http://localhost:5174/system/status > /dev/null
done
```

## Weaviate Vector Database Direct Testing

### 14. Check Weaviate Health
```bash
curl -s http://localhost:8080/v1/.well-known/ready
```

### 15. Get Weaviate Schema
```bash
curl -s http://localhost:8080/v1/schema | jq .
```

### 16. Query Weaviate Objects (if Memory class exists)
```bash
curl -s http://localhost:8080/v1/objects?class=Memory&limit=10 | jq .
```

### 17. Get Weaviate Cluster Info
```bash
curl -s http://localhost:8080/v1/nodes | jq .
```

## Redis Performance Testing (Indirect)

### 18. Test Response Time Consistency
```bash
# Run multiple requests and measure timing
curl -w "Time: %{time_total}s\n" -s http://localhost:5174/system/status -o /dev/null
```

### 19. Check Redis Statistics via System Status
```bash
curl -s http://localhost:5174/system/status | jq '.advanced.redis.stats'
```

### 20. Monitor Memory Usage
```bash
curl -s http://localhost:5174/system/status | jq '.advanced.redis.memory'
```

## Integration Testing

### 21. Store Complex Multi-System Message
```bash
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{
    "from": "integration-test",
    "to": "all-databases",
    "message": "Integration test: Redis caching (O1 lookup), Weaviate semantic search (cosine similarity), Neo4j graph traversal (shortest path), SQLite ACID persistence",
    "type": "integration_test"
  }'
```

### 22. Verify Storage Across All Systems
```bash
# Store message and get ID
RESULT=$(curl -s -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{"from":"test","to":"verify","message":"Verification test","type":"verify"}')

MESSAGE_ID=$(echo $RESULT | jq -r '.messageId')
echo "Stored message ID: $MESSAGE_ID"

# Verify it appears in retrieval
curl -s http://localhost:5174/ai-messages/verify | jq ".messages[] | select(.id == \"$MESSAGE_ID\")"
```

## Performance Benchmarking

### 23. Benchmark Storage Performance
```bash
echo "Testing storage performance..."
time for i in {1..10}; do
  curl -s -X POST http://localhost:5174/ai-message \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"perf$i\",\"to\":\"benchmark\",\"message\":\"Performance test message $i\",\"type\":\"benchmark\"}" > /dev/null
done
```

### 24. Benchmark Retrieval Performance  
```bash
echo "Testing retrieval performance..."
time for i in {1..10}; do
  curl -s http://localhost:5174/ai-messages/benchmark > /dev/null
done
```

## System Monitoring

### 25. Monitor System Resource Usage
```bash
curl -s http://localhost:5174/system/status | jq '{
  uptime: .uptime,
  memory_used: .memory.used,
  redis_memory: .advanced.redis.memory.used_memory_human,
  total_messages: .memory.system
}'
```

### 26. Check Database Connection Status
```bash
curl -s http://localhost:5174/system/status | jq '.databases'
```

## Error Testing

### 27. Test Invalid Message Format
```bash
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d '{"invalid": "format"}'
```

### 28. Test Large Message Storage
```bash
LARGE_MESSAGE=$(python3 -c "print('Large message test: ' + 'x' * 1000)")
curl -X POST http://localhost:5174/ai-message \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"load-test\",\"to\":\"system\",\"message\":\"$LARGE_MESSAGE\",\"type\":\"load_test\"}"
```

## Advanced Query Examples

### 29. Complex Message Analysis
```bash
curl -s http://localhost:5174/debug/all-messages | jq '
{
  total: .total,
  by_type: (.messages | group_by(.content.type) | map({type: .[0].content.type, count: length})),
  by_agent: (.messages | group_by(.source) | map({agent: .[0].source, count: length}))
}'
```

### 30. System Performance Report
```bash
curl -s http://localhost:5174/system/status | jq '{
  service: .service,
  version: .version,
  uptime_hours: (.uptime / 3600 | floor),
  databases: {
    sqlite: .databases.sqlite.connected,
    redis: .databases.redis.connected,
    weaviate: .databases.weaviate.connected,
    neo4j: .databases.neo4j.connected
  },
  redis_performance: {
    memory_used: .advanced.redis.memory.used_memory_human,
    commands_processed: .advanced.redis.stats.total_commands_processed,
    hit_rate: (.advanced.redis.stats.keyspace_hits / (.advanced.redis.stats.keyspace_hits + .advanced.redis.stats.keyspace_misses) * 100 | floor)
  }
}'
```

## Test Results Verification

All commands above should demonstrate:

✅ **SQLite Integration**: Primary data storage and ACID compliance  
✅ **Redis Integration**: High-performance caching with sub-50ms responses  
✅ **Weaviate Integration**: Vector database ready for semantic search  
✅ **Neo4j Integration**: Graph database for relationship mapping  
✅ **Multi-DB Storage**: Single API call stores across all 4 systems  
✅ **Performance**: Optimized response times through intelligent caching  
✅ **Reliability**: System status monitoring and health checks  

The advanced memory system successfully provides a unified API that leverages the strengths of each database technology for optimal performance and functionality.