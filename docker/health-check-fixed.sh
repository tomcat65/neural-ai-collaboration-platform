#!/bin/bash
# Check if agent process is running and responsive
if pgrep -f "smart-autonomous-agent.js" > /dev/null; then
  # Try to connect to webhook endpoint if available
  if [ ! -z "$WEBHOOK_PORT" ]; then
    curl -f http://localhost:$WEBHOOK_PORT/health 2>/dev/null || echo "Agent running but webhook not responsive"
  fi
  exit 0
else
  exit 1
fi 