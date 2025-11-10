#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/tomcat65/projects/shared-memory-mcp"
API_KEY="${API_KEY:-}"
COMPOSE_YML="$PROJECT_DIR/docker/docker-compose.unified-neural-mcp.yml"

PROJECT_CONTEXT_HELPER="$PROJECT_DIR/scripts/project-context.sh"
if [ -f "$PROJECT_CONTEXT_HELPER" ]; then
  # shellcheck disable=SC1090
  source "$PROJECT_CONTEXT_HELPER"
else
  get_project_slug() { printf '%s' "${NEURAL_PROJECT:-}"; }
fi
PROJECT_SLUG=$(get_project_slug 2>/dev/null || true)
if [ -n "$PROJECT_SLUG" ]; then
  export NEURAL_PROJECT="$PROJECT_SLUG"
fi

info() { echo -e "[INFO] $*"; }
warn() { echo -e "[WARN] $*"; }
err()  { echo -e "[ERROR] $*" >&2; }

# 1) Preflight: .env and API_KEY
if [ -n "$PROJECT_SLUG" ]; then
  info "Active project: $PROJECT_SLUG"
fi

if [ -n "$API_KEY" ]; then
  info "Using API key from environment (hidden)."
elif [ -f "$PROJECT_DIR/.env" ]; then
  API_KEY_LINE=$(grep -E '^API_KEY=' "$PROJECT_DIR/.env" || true)
  API_KEY_VAL=${API_KEY_LINE#API_KEY=}
  if [ -z "${API_KEY_VAL:-}" ] || [ "$API_KEY_VAL" = "change-me" ]; then
    warn "API_KEY in .env is unset or 'change-me'. Set a strong key before exposing the server."
  else
    API_KEY="$API_KEY_VAL"
    info "Using API key from .env (hidden)."
  fi
else
  warn "No .env found at $PROJECT_DIR/.env. Create one from .env.example and set API_KEY."
fi

if [ -n "$API_KEY" ]; then
  export API_KEY
fi

# 2) Preflight: Port checks (best effort)
check_port() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn | awk '{print $4}' | grep -q ":${port}$"; then
      warn "Port ${port} appears in LISTEN state. Another service may be using it."
    fi
  fi
}

check_port 6174   # MCP
check_port 3004   # Message Hub

# 3) Ensure Simple stack is stopped (avoid port conflicts) – best-effort
info "Ensuring Simple stack is stopped (avoid conflicts) ..."
(
  cd "$PROJECT_DIR"
  docker compose -p simple -f docker/docker-compose.simple.yml -f docker/docker-compose.simple.override.yml down -v 2>/dev/null || \
  docker compose -p simple -f docker/docker-compose.simple.yml down -v 2>/dev/null || true
)

# 4) Bring up the Unified MCP stack with a distinct project name and remove orphans
info "Starting Unified MCP stack (compose: $COMPOSE_YML) ..."
(
  cd "$PROJECT_DIR"
  docker compose -p unified -f "docker/docker-compose.unified-neural-mcp.yml" up -d --build --remove-orphans
)

# 5) Health check
info "Waiting for health endpoint (http://localhost:6174/health) ..."
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 5 http://localhost:6174/health >/dev/null; then
    info "Unified MCP health OK."
  else
    warn "Health check failed. The server may still be starting. Check: (cd $PROJECT_DIR && docker compose -p unified -f docker/docker-compose.unified-neural-mcp.yml logs -f)"
  fi
fi

echo ""
info "Quick test (requires API key):"
echo "  curl -s -H 'Content-Type: application/json' -H \"x-api-key: \\${API_KEY}\" \\\"http://localhost:6174/mcp\\\" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}' | jq"
