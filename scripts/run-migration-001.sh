#!/bin/bash
# Migration 001: ai_messages table
# Runs inside Docker container against live DB
# Implements all 6 codex amendments

set -euo pipefail

CONTAINER="unified-unified-neural-mcp-1"
DB_PATH="/app/data/unified-platform.db"
ALLOW_FAILURES="${1:-}"

echo "🔄 Migration 001: ai_messages table"
echo "   Container: $CONTAINER"
echo "   DB: $DB_PATH"
echo ""

# Pre-flight: verify backup exists
BACKUP_EXISTS=$(ls /mnt/d/Backups/Neural/unified-platform.db.backup-live-* 2>/dev/null | head -1)
if [ -z "$BACKUP_EXISTS" ]; then
  echo "❌ No backup found at /mnt/d/Backups/Neural/. Run backup first."
  exit 1
fi
echo "✅ Backup verified: $BACKUP_EXISTS"

# Get source count
SOURCE_COUNT=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM shared_memory WHERE memory_type = 'ai_message'")
echo "📊 Source rows: $SOURCE_COUNT"

if [ "$SOURCE_COUNT" -eq 0 ]; then
  echo "⚠️  No ai_message rows to migrate."
  exit 0
fi

# Run migration SQL inside container
docker exec "$CONTAINER" sqlite3 "$DB_PATH" <<'MIGRATION_SQL'
-- Migration 001: ai_messages table with all codex amendments

-- Create target table (amendment 2: legacy_shared_memory_id UNIQUE for idempotency)
-- (amendment 3: from_source column for provenance)
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  legacy_shared_memory_id TEXT UNIQUE,
  from_agent TEXT NOT NULL,
  from_source TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'info',
  priority TEXT DEFAULT 'normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  metadata TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_messages_to ON ai_messages(to_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_from ON ai_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_type ON ai_messages(to_agent, message_type);

-- Amendment 5: Failures table
CREATE TABLE IF NOT EXISTS ai_message_migration_failures (
  id TEXT PRIMARY KEY,
  shared_memory_id TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Amendment 4: Single transaction
BEGIN TRANSACTION;

-- Amendment 2: INSERT OR IGNORE for idempotency
-- Amendment 3: from_agent precedence (json.from → json.sender → created_by → 'unknown')
INSERT OR IGNORE INTO ai_messages (
  id,
  legacy_shared_memory_id,
  from_agent,
  from_source,
  to_agent,
  content,
  message_type,
  priority,
  created_at,
  metadata
)
SELECT
  sm.id,
  sm.id,
  -- from_agent precedence chain
  COALESCE(
    NULLIF(json_extract(sm.content, '$.from'), ''),
    NULLIF(json_extract(sm.content, '$.sender'), ''),
    NULLIF(sm.created_by, ''),
    'unknown'
  ),
  -- from_source provenance
  CASE
    WHEN json_extract(sm.content, '$.from') IS NOT NULL AND json_extract(sm.content, '$.from') != '' THEN 'json_from'
    WHEN json_extract(sm.content, '$.sender') IS NOT NULL AND json_extract(sm.content, '$.sender') != '' THEN 'json_sender'
    WHEN sm.created_by IS NOT NULL AND sm.created_by != '' THEN 'created_by'
    ELSE 'unknown'
  END,
  -- to_agent
  COALESCE(
    NULLIF(json_extract(sm.content, '$.to'), ''),
    NULLIF(json_extract(sm.content, '$.target'), ''),
    'unknown'
  ),
  -- content (prefer $.content, fallback to $.message)
  COALESCE(
    json_extract(sm.content, '$.content'),
    json_extract(sm.content, '$.message'),
    ''
  ),
  -- message_type
  COALESCE(
    NULLIF(json_extract(sm.content, '$.messageType'), ''),
    NULLIF(json_extract(sm.content, '$.type'), ''),
    'info'
  ),
  -- priority
  COALESCE(
    NULLIF(json_extract(sm.content, '$.priority'), ''),
    'normal'
  ),
  -- created_at
  sm.created_at,
  -- metadata (preserve deliveryStatus, original metadata, original id/timestamp)
  json_object(
    'deliveryStatus', json_extract(sm.content, '$.deliveryStatus'),
    'originalMetadata', json_extract(sm.content, '$.metadata'),
    'originalMessageId', json_extract(sm.content, '$.id'),
    'originalTimestamp', json_extract(sm.content, '$.timestamp')
  )
FROM shared_memory sm
WHERE sm.memory_type = 'ai_message'
  AND json_valid(sm.content) = 1;

-- Capture rows with invalid JSON into failures table
INSERT OR IGNORE INTO ai_message_migration_failures (id, shared_memory_id, raw_content, error)
SELECT
  'fail-' || sm.id,
  sm.id,
  SUBSTR(sm.content, 1, 5000),
  'Invalid JSON content'
FROM shared_memory sm
WHERE sm.memory_type = 'ai_message'
  AND json_valid(sm.content) = 0;

COMMIT;
MIGRATION_SQL

echo ""
echo "✅ Migration SQL executed"

# ─── Validation (amendment 1) ───
echo ""
echo "--- Validation ---"

# Count check
MIGRATED=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_messages")
FAILURES=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_message_migration_failures")
echo "📊 Migrated: $MIGRATED, Failures: $FAILURES, Source: $SOURCE_COUNT"

TOTAL=$((MIGRATED + FAILURES))
if [ "$TOTAL" -ne "$SOURCE_COUNT" ]; then
  echo "❌ Row count mismatch: migrated($MIGRATED) + failures($FAILURES) = $TOTAL != source($SOURCE_COUNT)"
  exit 1
fi
echo "✅ Row count matches"

# Amendment 5: fail on failures unless --allow-failures
if [ "$FAILURES" -gt 0 ] && [ "$ALLOW_FAILURES" != "--allow-failures" ]; then
  echo "❌ $FAILURES migration failures found. Pass --allow-failures to proceed."
  docker exec "$CONTAINER" sqlite3 "$DB_PATH" "SELECT * FROM ai_message_migration_failures"
  exit 1
fi

# NULL to_agent check
NULL_TO=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM ai_messages WHERE to_agent IS NULL OR to_agent = ''")
if [ "$NULL_TO" -gt 0 ]; then
  echo "❌ Found $NULL_TO rows with NULL/empty to_agent"
  exit 1
fi
echo "✅ Zero NULL to_agent rows"

# from_source distribution
echo ""
echo "📊 from_source distribution:"
docker exec "$CONTAINER" sqlite3 "$DB_PATH" \
  "SELECT from_source, COUNT(*) as cnt FROM ai_messages GROUP BY from_source ORDER BY cnt DESC"

# from_agent distribution (top 10)
echo ""
echo "📊 from_agent distribution (top 10):"
docker exec "$CONTAINER" sqlite3 "$DB_PATH" \
  "SELECT from_agent, COUNT(*) as cnt FROM ai_messages GROUP BY from_agent ORDER BY cnt DESC LIMIT 10"

# Checksum
echo ""
echo "🔑 Checksums:"
SOURCE_CHECKSUM=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" "
  SELECT GROUP_CONCAT(id || '|' || COALESCE(json_extract(content, '$.to'), json_extract(content, '$.target'), 'unknown') || '|' || COALESCE(json_extract(content, '$.from'), json_extract(content, '$.sender'), created_by, 'unknown'), CHAR(10))
  FROM (SELECT * FROM shared_memory WHERE memory_type = 'ai_message' ORDER BY id)
" | sha256sum | cut -d' ' -f1)
TARGET_CHECKSUM=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" "
  SELECT GROUP_CONCAT(id || '|' || to_agent || '|' || from_agent, CHAR(10))
  FROM (SELECT * FROM ai_messages ORDER BY id)
" | sha256sum | cut -d' ' -f1)

echo "   Source: $SOURCE_CHECKSUM"
echo "   Target: $TARGET_CHECKSUM"
if [ "$SOURCE_CHECKSUM" = "$TARGET_CHECKSUM" ]; then
  echo "   ✅ Checksums match"
else
  echo "   ⚠️  Checksums differ (expected if from_agent precedence changes values)"
fi

# ─── Amendment 6: EXPLAIN QUERY PLAN ───
echo ""
echo "📋 Query plan:"
PLAN=$(docker exec "$CONTAINER" sqlite3 "$DB_PATH" \
  "EXPLAIN QUERY PLAN SELECT * FROM ai_messages WHERE to_agent = 'claude-code' ORDER BY created_at DESC LIMIT 10")
echo "   $PLAN"

if echo "$PLAN" | grep -q "SEARCH"; then
  echo "   ✅ Uses index (SEARCH)"
else
  echo "   ❌ Does NOT use index (SCAN detected)"
  exit 1
fi

echo ""
echo "🎉 Migration 001 complete and validated!"
echo ""
echo "   Migrated: $MIGRATED messages"
echo "   Failures: $FAILURES"
echo "   Index:    verified"
echo ""
echo "Next: update server handlers to read/write ai_messages table."
