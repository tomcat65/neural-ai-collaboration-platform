#!/bin/bash

# Fix and start Neural AI system after restore issues

echo "Fixing permission and network issues..."

# Create data directory with proper permissions (you'll need to enter sudo password)
echo "Creating data directory..."
sudo mkdir -p /home/tomcat65/projects/shared-memory-mcp/data
sudo chown $USER:$USER /home/tomcat65/projects/shared-memory-mcp/data

# Copy database files from backup
echo "Copying database files..."
cp /home/tomcat65/neural-ai-backup-20250731_232637/databases/*.db \
   /home/tomcat65/projects/shared-memory-mcp/data/ 2>/dev/null || true

# Clean up any leftover containers
echo "Cleaning up containers..."
docker rm -f neural-mcp-unified universal-mcp-gateway-standalone 2>/dev/null || true

# Start the system properly
echo "Starting Neural AI system..."
cd /home/tomcat65/projects/shared-memory-mcp
./neural-ai-control.sh start

echo "Done! Check status with: ./neural-ai-control.sh status"