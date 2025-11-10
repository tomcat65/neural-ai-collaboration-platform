#!/usr/bin/env bash
set -euo pipefail

# Validate a Hugging Face API key and (optionally) a model is accessible.
# Usage:
#   scripts/validate-hf-key.sh [hf_token] [model_name]
# If not provided, reads from env HUGGINGFACE_APIKEY or from .env in repo root.
# Default model: sentence-transformers/all-MiniLM-L6-v2

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

color() { local c="$1"; shift; printf "\033[${c}m%s\033[0m\n" "$*"; }
info(){ color 34 "[INFO] $*"; }
warn(){ color 33 "[WARN] $*"; }
err(){  color 31 "[ERROR] $*"; }
ok(){   color 32 "[OK] $*"; }

TOKEN=${1:-${HUGGINGFACE_APIKEY:-}}
MODEL=${2:-sentence-transformers/all-MiniLM-L6-v2}

# Fallback: parse .env if present
if [[ -z "${TOKEN}" && -f "$REPO_ROOT/.env" ]]; then
  TOKEN=$(grep -E '^HUGGINGFACE_APIKEY=' "$REPO_ROOT/.env" | sed 's/^HUGGINGFACE_APIKEY=//') || true
fi

if [[ -z "${TOKEN:-}" ]]; then
  err "No token provided. Set HUGGINGFACE_APIKEY or pass as first argument."
  exit 1
fi

info "Validating HF token against whoami-v2 ..."
HTTP=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  https://huggingface.co/api/whoami-v2 || true)

case "$HTTP" in
  200) ok "Token valid (whoami-v2: 200)." ;;
  401) err "Token invalid (401 Unauthorized)."; exit 2 ;;
  403) err "Token forbidden (403). Check org access or token scopes."; exit 3 ;;
  *) warn "Unexpected status from whoami-v2: $HTTP" ;;
 esac

info "Checking model accessibility: ${MODEL}"
HTTP_MODEL=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  https://huggingface.co/api/models/${MODEL} || true)

case "$HTTP_MODEL" in
  200) ok "Model metadata accessible (200)." ;;
  401|403) warn "Model access denied ($HTTP_MODEL). Private or insufficient scope." ;;
  404) warn "Model not found (404)." ;;
  *) warn "Unexpected status from model metadata: $HTTP_MODEL" ;;
 esac

# Optional: light inference probe (may bill; skip by default unless HF_VALIDATE_INFERENCE=1)
if [[ "${HF_VALIDATE_INFERENCE:-0}" == "1" ]]; then
  info "Running minimal inference call to Inference API (may incur usage)."
  RESP=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -X POST "https://api-inference.huggingface.co/models/${MODEL}" \
    -d '{"inputs":"hello"}' || true)
  if echo "$RESP" | grep -q 'error'; then
    warn "Inference API responded with error: $(echo "$RESP" | sed 's/\n/ /g')"
  else
    ok "Inference API responded (truncated): $(echo "$RESP" | head -c 120) ..."
  fi
fi

# If running unified stack, check container env wiring
if docker ps --format '{{.Names}}' | grep -q '^unified-weaviate-1$'; then
  info "Checking env inside unified-weaviate-1 ..."
  docker exec unified-weaviate-1 sh -lc 'echo HF=${HUGGINGFACE_APIKEY:+set} MODEL=${HUGGINGFACE_EMBEDDING_MODEL:-<none>}' || true
fi

ok "Validation completed."
