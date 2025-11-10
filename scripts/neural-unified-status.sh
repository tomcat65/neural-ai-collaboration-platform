#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/tomcat65/projects/shared-memory-mcp"
COMPOSE_YML="$PROJECT_DIR/docker/docker-compose.unified-neural-mcp.yml"

echo "[INFO] docker compose ps (Unified MCP)"
(
  cd "$PROJECT_DIR"
  docker compose -f "docker/docker-compose.unified-neural-mcp.yml" ps || true
)

echo ""
echo "[INFO] Health checks"
if command -v curl >/dev/null 2>&1; then
  echo -n "  • MCP (6174) /health: "
  if curl -fsS --max-time 3 http://localhost:6174/health >/dev/null; then echo "OK"; else echo "not ready"; fi
  echo -n "  • Hub (3004) /status: "
  if curl -fsS --max-time 3 http://localhost:3004/status >/dev/null; then echo "OK"; else echo "n/a"; fi
else
  echo "  curl not found; skipping"
fi

echo ""
echo "[INFO] Quick tools list (requires API_KEY in env)"
echo "  curl -s -H 'Content-Type: application/json' -H \"x-api-key: \\${API_KEY}\" \\\"http://localhost:6174/mcp\\\" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | jq"
