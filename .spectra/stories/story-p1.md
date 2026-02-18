# Story P1: ai_messages Migration

## Status: PENDING

## User Story
**As** the neural messaging system,
**I need** messages stored in a dedicated indexed `ai_messages` table instead of JSON blobs in `shared_memory`,
**So that** message retrieval is O(log n) indexed lookups instead of O(n) full-table LIKE scans.

## Acceptance Criteria
1. New `ai_messages` table created:
   ```sql
   CREATE TABLE ai_messages (
     id TEXT PRIMARY KEY,
     from_agent TEXT NOT NULL,
     to_agent TEXT NOT NULL,
     content TEXT NOT NULL,
     message_type TEXT DEFAULT 'info',
     priority TEXT DEFAULT 'normal',
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     read_at DATETIME,
     metadata TEXT
   );
   ```
2. Indexes: `idx_ai_messages_to(to_agent, created_at DESC)`, `idx_ai_messages_from(from_agent, created_at DESC)`, `idx_ai_messages_type(to_agent, message_type)`
3. Migration reads ALL 1,284 existing messages from `shared_memory WHERE memory_type = 'ai_message'`
4. Field mapping for legacy rows:
   - `from_agent` ← `shared_memory.created_by` (NO "from" field exists in JSON)
   - `to_agent` ← JSON `to` or `target` field
   - `content` ← JSON `message` field
   - `message_type` ← JSON `type` field (default 'info')
   - `created_at` ← `shared_memory.created_at`
   - `id` ← preserve original `shared_memory.id`
5. Post-migration: `SELECT COUNT(*) FROM ai_messages` = 1,284 (exact match)
6. Migration verifies backup exists before running
7. `send_ai_message` handler writes to `ai_messages` instead of `shared_memory`
8. `get_ai_messages` handler queries `ai_messages` with indexed WHERE — no more `memoryManager.search()` LIKE scans
9. `/ai-message` HTTP endpoint writes to `ai_messages`
10. `/ai-messages/:agentId` HTTP endpoint queries `ai_messages`
11. P0 contract tests still pass
12. Old `ai_message` rows in `shared_memory` NOT deleted (kept for safety)

## Technical Notes
- Migration runs inside Docker container against live DB
- Current storage: `memoryManager.store(from, {...}, 'shared', 'ai_message')` → `shared_memory` table
- Current retrieval (lines 469-499): 3 separate `memoryManager.search()` calls with LIKE patterns — replacing this
- JSON content structure: `{"id":"message-<ts>","to":"<agent>","target":"<agent>","message":"<text>","type":"direct","timestamp":"<iso>"}`
- Top senders by `created_by`: unified-neural-mcp-server(574), claude-desktop(155), claude-cli(128), codex(98)
- MemoryManager needs: `storeMessage()` and `getMessages()` methods
- CRITICAL: some messages may have `to` field, some may have `target` field, some may have both — handle all cases

## Dependencies
- Pre-P0 (backup verified)
- P0 (contract tests pass as baseline)

## Files
- `src/migrations/001-ai-messages-table.ts` (create)
- `src/unified-server/memory/index.ts` (modify — add storeMessage/getMessages)
- `src/unified-neural-mcp-server.ts` (modify — update send_ai_message, get_ai_messages, /ai-message, /ai-messages)
- `scripts/run-migration.sh` (create)

## File Ownership
- owns: `src/migrations/001-ai-messages-table.ts`, `scripts/run-migration.sh`
- touches: `src/unified-server/memory/index.ts`, `src/unified-neural-mcp-server.ts`
- reads: backup MANIFEST

## Wiring Proof
- CLI: `sqlite3 unified-platform.db "SELECT COUNT(*) FROM ai_messages"` = 1,284
- CLI: `EXPLAIN QUERY PLAN SELECT * FROM ai_messages WHERE to_agent = 'claude-code' ORDER BY created_at DESC LIMIT 10` shows SEARCH (not SCAN)
- Integration: `send_ai_message` → `get_ai_messages` round-trip < 100ms
- Regression: P0 contract tests pass
