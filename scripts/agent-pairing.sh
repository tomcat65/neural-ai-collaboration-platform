#!/usr/bin/env bash
set -euo pipefail

# Agent Pairing & Messaging Sanity Check
# Usage:
#   scripts/agent-pairing.sh <sender_id> <recipient_id> [message]
#
# Notes:
# - Works against Unified MCP on localhost:6174
# - Honors API_KEY if set (adds x-api-key header)
# - Registers agents if needed, sends a test message, and verifies retrieval

SENDER_ID=${1:-}
RECIPIENT_ID=${2:-}
MESSAGE=${3:-"Hello from agent-pairing.sh"}

if [[ -z "$SENDER_ID" || -z "$RECIPIENT_ID" ]]; then
  echo "Usage: $0 <sender_id> <recipient_id> [message]" >&2
  exit 1
fi

HOST=${MCP_HOST:-localhost}
PORT=${MCP_PORT:-6174}
BASE="http://$HOST:$PORT"

HDR=( -H 'Content-Type: application/json' )
if [[ -n "${API_KEY:-}" ]]; then
  HDR+=( -H "x-api-key: ${API_KEY}" )
fi

echo "[pair] Checking health at $BASE/health" >&2
curl -fsS "$BASE/health" >/dev/null

echo "[pair] Registering sender: $SENDER_ID" >&2
curl -fsS "${HDR[@]}" "$BASE/mcp" -d @- >/dev/null <<JSON
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"register_agent","arguments":{"agentId":"$SENDER_ID","name":"$SENDER_ID","capabilities":["bridge","ai-to-ai-messaging"],"metadata":{"source":"pairing-script"}}}}
JSON

echo "[pair] Registering recipient: $RECIPIENT_ID" >&2
curl -fsS "${HDR[@]}" "$BASE/mcp" -d @- >/dev/null <<JSON
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"register_agent","arguments":{"agentId":"$RECIPIENT_ID","name":"$RECIPIENT_ID","capabilities":["bridge","ai-to-ai-messaging"],"metadata":{"source":"pairing-script"}}}}
JSON

echo "[pair] Sending message: $SENDER_ID -> $RECIPIENT_ID" >&2
SEND_RESP=$(curl -fsS "${HDR[@]}" "$BASE/mcp" -d @- <<JSON)
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"send_ai_message","arguments":{"from":"$SENDER_ID","to":"$RECIPIENT_ID","content":"$MESSAGE","messageType":"info","priority":"normal"}}}
JSON

echo "$SEND_RESP" | jq -r '.result.content[0].text' 2>/dev/null || true

echo "[pair] Fetching messages for recipient: $RECIPIENT_ID" >&2
GET_RESP=$(curl -fsS "${HDR[@]}" "$BASE/mcp" -d @- <<JSON)
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_ai_messages","arguments":{"agentId":"$RECIPIENT_ID","limit":25}}}
JSON

TEXT=$(echo "$GET_RESP" | jq -r '.result.content[0].text' 2>/dev/null || echo '{}')
MATCH=$(echo "$TEXT" | jq --arg sid "$SENDER_ID" --arg rid "$RECIPIENT_ID" 'try (fromjson | .messages // []) | map(select(.content.from==$sid and (.content.to==$rid or .content.target==$rid))) | length' 2>/dev/null || echo 0)

if [[ "${MATCH}" -ge 1 ]]; then
  echo "[pair] Success: Message found for $RECIPIENT_ID from $SENDER_ID" >&2
  exit 0
else
  echo "[pair] Warning: No matching message found yet. Dumping response:" >&2
  echo "$TEXT"
  exit 2
fi

