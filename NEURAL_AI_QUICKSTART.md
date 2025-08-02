# Neural AI Collaboration Platform - Quick Reference

## System Control

The `neural-ai-control.sh` script provides complete control over your Neural AI system.

### Basic Commands

```bash
# Check system status
./neural-ai-control.sh status

# Start the system
./neural-ai-control.sh start

# Stop the system (preserves all data)
./neural-ai-control.sh stop

# Restart the system
./neural-ai-control.sh restart
```

### Auto-Start Management

```bash
# Prevent containers from starting on boot (recommended for development)
./neural-ai-control.sh disable-autostart

# Re-enable auto-start on boot
./neural-ai-control.sh enable-autostart
```

### Data Management

```bash
# Create a backup of all system data
./neural-ai-control.sh backup

# View logs for all containers
./neural-ai-control.sh logs

# View logs for specific container
./neural-ai-control.sh logs neural-mcp-unified
```

## Access Points

When the system is running:
- **Neural AI Server**: http://localhost:6174
- **Message Hub WebSocket**: ws://localhost:3003
- **Universal Gateway**: http://localhost:5200

## Data Persistence

All data is stored in Docker volumes:
- `unified_neural_data` - Main application data
- `redis_data` - Cache data
- `postgres_data` - Database data

Data persists even when containers are stopped or removed.

## Important Notes

1. **Auto-start is now DISABLED** - The system will not start automatically on boot
2. **Data is preserved** - Stopping the system does not delete any data
3. **Manual control** - You have full control over when to start/stop the system

## Troubleshooting

If containers start unexpectedly:
```bash
# Check what's running
docker ps

# Disable auto-start again
./neural-ai-control.sh disable-autostart

# Stop the system
./neural-ai-control.sh stop
```

## Project Structure
- Main code: `/home/tomcat65/projects/shared-memory-mcp/`
- Backup location: `/home/tomcat65/neural-ai-backup-20250731_232637/`
- Control script: `./neural-ai-control.sh`