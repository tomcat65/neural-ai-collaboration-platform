#!/usr/bin/env bash
# Shared helpers for reading/writing the active Neural project slug

# shellcheck disable=SC2034 # exported vars may be consumed by caller scripts

# Resolve repo root relative to this helper
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SCRIPT_SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  SCRIPT_SOURCE="$(readlink "$SCRIPT_SOURCE")"
  [[ $SCRIPT_SOURCE != /* ]] && SCRIPT_SOURCE="$SCRIPT_DIR/$SCRIPT_SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_SOURCE")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_CONTEXT_FILE="${PROJECT_CONTEXT_FILE:-$PROJECT_DIR/.project-context}"

sanitize_project_slug() {
  local raw="${1:-}"
  local lower
  lower=$(echo "$raw" | tr '[:upper:]' '[:lower:]')
  # Replace non-alphanumeric with hyphen and collapse repeats
  lower=$(echo "$lower" | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g' | sed -E 's/-{2,}/-/g')
  printf '%s' "$lower"
}

get_project_slug() {
  local from_env="${NEURAL_PROJECT:-}"
  if [ -z "$from_env" ] && [ -f "$PROJECT_CONTEXT_FILE" ]; then
    # shellcheck disable=SC1090
    source "$PROJECT_CONTEXT_FILE"
    from_env="${NEURAL_PROJECT:-}"
  fi
  sanitize_project_slug "$from_env"
}

set_project_slug() {
  local requested="${1:-}"
  local sanitized
  sanitized=$(sanitize_project_slug "$requested")
  if [ -z "$sanitized" ]; then
    echo "Invalid project slug" >&2
    return 1
  fi
  printf 'NEURAL_PROJECT=%s\n' "$sanitized" > "$PROJECT_CONTEXT_FILE"
  export NEURAL_PROJECT="$sanitized"
  printf '%s' "$sanitized"
}

require_project_slug() {
  local slug
  slug=$(get_project_slug)
  if [ -z "$slug" ]; then
    return 1
  fi
  export NEURAL_PROJECT="$slug"
  printf '%s' "$slug"
}

project_backup_prefix() {
  local slug
  slug=$(get_project_slug)
  if [ -n "$slug" ]; then
    printf 'neural-ai-backup-%s' "$slug"
  else
    printf 'neural-ai-backup'
  fi
}
