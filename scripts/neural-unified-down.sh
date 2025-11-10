#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/tomcat65/projects/shared-memory-mcp"
COMPOSE_YML="$PROJECT_DIR/docker/docker-compose.unified-neural-mcp.yml"

echo "[INFO] Stopping Unified MCP stack (project: unified) ..."
(
  cd "$PROJECT_DIR"
  docker compose -p unified -f "docker/docker-compose.unified-neural-mcp.yml" down --remove-orphans || true
)

echo "[INFO] Also stopping any lingering simple stack (best-effort) ..."
(
  cd "$PROJECT_DIR"
  docker compose -p simple -f docker/docker-compose.simple.yml -f docker/docker-compose.simple.override.yml down -v 2>/dev/null || \
  docker compose -p simple -f docker/docker-compose.simple.yml down -v 2>/dev/null || true
)

echo "[INFO] Done. Tip: remove unused resources with 'docker image prune' and 'docker volume ls' if needed."
