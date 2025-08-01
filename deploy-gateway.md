# Universal MCP Gateway Deployment Guide

## 🚀 Quick Deploy

### Option 1: Full System Deployment (Recommended)
```bash
# Deploy with existing neural-ai platform
cd /home/tomcat65/projects/shared-memory-mcp
docker-compose -f docker/docker-compose.simple.yml up -d universal-gateway

# Or use the automated script
./docker/start-universal-gateway.sh
```

### Option 2: Standalone Gateway (Testing)
```bash
# Deploy gateway only (connects to existing services)
docker-compose -f docker/docker-compose.gateway-only.yml up -d

# Test the gateway
./docker/test-gateway.sh
```

## 🔧 Configuration

### MCP Client Configuration
Update your MCP configuration to use the Universal Gateway:

```json
{
  "mcpServers": {
    "universal-gateway": {
      "command": "curl",
      "args": ["-X", "POST", "http://localhost:5200/mcp"],
      "env": {
        "GATEWAY_URL": "http://localhost:5200"
      }
    }
  }
}
```

### Environment Variables
```bash
# Gateway Configuration
GATEWAY_PORT=5200
NODE_ENV=production

# Service URLs
NEURAL_AI_URL=http://neural-ai:5174
REDIS_URL=redis://redis:6379
NEO4J_URL=bolt://neo4j:7687
WEAVIATE_URL=http://weaviate:8080
POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/unified_platform

# Platform Authentication (optional)
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

## 🧪 Testing

### Automated Testing
```bash
# Run comprehensive tests
./docker/test-gateway.sh
```

### Manual Testing
```bash
# Health check
curl http://localhost:5200/health

# Platform registry
curl http://localhost:5200/api/platforms

# Create test entity
curl -X POST http://localhost:5200/api/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entities": [{
      "name": "Test Entity",
      "entityType": "test",
      "observations": ["Test observation"]
    }]
  }'

# Search entities
curl "http://localhost:5200/api/entities/search?query=test"

# Trigger memory sync
curl -X POST http://localhost:5200/api/federation/sync \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

## 🔗 Available Endpoints

### HTTP API
- `GET /health` - Gateway health status
- `GET /api/platforms` - Registered AI platforms  
- `POST /api/entities` - Create entities
- `GET /api/entities/search` - Search entities
- `POST /api/federation/sync` - Trigger memory sync

### Universal MCP Tools
- `universal:create_entities` - Create entities across all platforms
- `universal:get_entities` - Get entities from federated memory
- `universal:search_entities` - Advanced search across platforms
- `universal:send_message` - Send messages to any AI platform
- `universal:sync_memory` - Manual memory federation sync
- `universal:get_platform_status` - Platform health status

## 📊 Monitoring

### Container Status
```bash
# Check container status
docker ps | grep universal-gateway

# View logs
docker logs universal-mcp-gateway

# Container stats
docker stats universal-mcp-gateway
```

### Gateway Metrics
```bash
# Platform status
curl http://localhost:5200/api/platforms | jq

# Memory federation status  
curl http://localhost:5200/health | jq '.memory'
```

## 🔧 Troubleshooting

### Common Issues

1. **Gateway won't start**
   ```bash
   # Check dependencies
   docker-compose -f docker/docker-compose.simple.yml ps
   
   # View startup logs
   docker logs universal-mcp-gateway
   ```

2. **Health check fails**
   ```bash
   # Check port availability
   netstat -tlnp | grep 5200
   
   # Test internal connectivity
   docker exec universal-mcp-gateway curl localhost:5200/health
   ```

3. **Platform registration fails**
   ```bash
   # Check service connectivity
   docker exec universal-mcp-gateway curl neural-ai:5174/health
   
   # Verify environment variables
   docker exec universal-mcp-gateway env | grep URL
   ```

### Debug Mode
```bash
# Run with debug logging
docker-compose -f docker/docker-compose.gateway-only.yml up

# Or set debug environment
docker run -e DEBUG=true -e NODE_ENV=development universal-mcp-gateway
```

## 🚀 Integration with AI Platforms

### Claude Code/Desktop
Use the provided `universal-mcp-config.json`:
```bash
cp universal-mcp-config.json ~/.config/claude-code/mcp-config.json
```

### OpenAI Integration
Set OpenAI API key and endpoint:
```bash
export OPENAI_API_KEY=your_key
export OPENAI_MCP_ENDPOINT=https://api.openai.com/mcp/v1
```

### Gemini Integration  
Set Gemini API key and endpoint:
```bash
export GEMINI_API_KEY=your_key
export GEMINI_MCP_ENDPOINT=https://generativelanguage.googleapis.com/mcp/v1
```

## 📈 Performance Tuning

### Memory Federation
- Sync interval: 5 minutes (300000ms)
- Conflict resolution: Automatic
- Platform priority: Neural-AI → Claude → OpenAI → Gemini

### Caching
- Uses existing Redis instance
- TTL: Based on data type
- Fallback: In-memory cache

### Resource Limits
```yaml
# Add to docker-compose if needed
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

## 🎯 Next Steps

1. **Deploy the gateway** using the scripts provided
2. **Test universal tools** with your AI platforms
3. **Integrate with Vida-Tea** Firebase architecture
4. **Monitor performance** and adjust as needed
5. **Scale horizontally** if handling multiple projects

The Universal MCP Gateway is now ready to revolutionize your AI collaboration workflow! 🌟