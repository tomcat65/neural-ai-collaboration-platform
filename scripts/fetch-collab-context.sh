#!/usr/bin/env bash
set -euo pipefail

# Simple helper to fetch collaboration context from the Universal MCP Gateway (5200)
# or the Network MCP Server (5174) depending on what's available.
#
# Usage:
#   scripts/fetch-collab-context.sh [--endpoint http://host:port]
#
# Defaults:
#   - Tries endpoint provided via --endpoint
#   - Else tries http://localhost:5200 (Universal MCP Gateway)
#   - Else falls back to http://localhost:5174 (Network MCP Server)

ENDPOINT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --endpoint)
      ENDPOINT="$2"; shift 2;;
    *)
      echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

try_endpoint() {
  local url="$1"
  curl -sS --max-time 2 "$url/health" >/dev/null 2>&1
}

if [[ -z "$ENDPOINT" ]]; then
  if try_endpoint "http://localhost:5200"; then
    ENDPOINT="http://localhost:5200"
  elif try_endpoint "http://localhost:5174"; then
    ENDPOINT="http://localhost:5174"
  else
    # Default to gateway if neither is reachable; user may be remote
    ENDPOINT="http://localhost:5200"
  fi
fi

echo "Using endpoint: $ENDPOINT" >&2

# Queries recommended for agents
declare -a QUERIES=(
  "Universal MCP Gateway"
  "infrastructure"
  "Windows-WSL"
  "event-driven sync"
  "test_results"
)

encode() { python3 - <<'PY'
import sys, urllib.parse as u
print(u.quote(sys.argv[1]))
PY
}

search_gateway() {
  local q="$1"
  local enc
  enc=$(encode "$q")
  curl -sS "$ENDPOINT/api/entities/search?query=$enc" || true
}

search_mcp_http() {
  local q="$1"
  local enc
  enc=$(encode "$q")
  curl -sS "$ENDPOINT/api/tools/search_nodes/$enc" || true
}

# Decide which path to use based on endpoint port
USE_GATEWAY=false
if [[ "$ENDPOINT" =~ :5200(/|$) ]]; then
  USE_GATEWAY=true
fi

sep() { printf '\n-----------------------------\n' ; }

for q in "${QUERIES[@]}"; do
  sep
  echo "Query: $q" >&2
  if $USE_GATEWAY; then
    search_gateway "$q"
  else
    search_mcp_http "$q"
  fi
  echo
done

sep
echo "Done." >&2

