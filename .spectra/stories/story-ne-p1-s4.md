# NE-P1-S4: mark_as_read + Bulk Archive

## Type: Feature
## Risk: low
## Phase: P1d
## Codex Findings Addressed: Rev3 #2 (tool registration AC incomplete)

## Description
Add mark_as_read tool for ai_messages (single + bulk). Add bulk archive capability to move old messages out of active queries. Currently get_ai_messages supports markAsRead flag on retrieval — this adds explicit mark/archive operations.

## New Tools
1. `mark_messages_read` — mark one or more messages as read by ID, or mark all unread for an agent
   - Args: agentId (required), messageIds (optional array — if omitted, marks all unread)
   - Returns: count of messages marked
2. `archive_messages` — bulk archive messages older than a threshold
   - Args: agentId (required), olderThanDays (required, min 1)
   - Adds archived_at timestamp, excludes from default get_ai_messages queries
   - Archived messages still queryable with includeArchived flag

## Tool Registration (codex Rev3 #2)
Both new tools must be fully registered:
1. **Schema registration**: add to src/shared/toolSchemas.ts with full JSON Schema definitions
2. **Tool listing**: add to tools/list handler so they appear in MCP tool discovery
3. **Handler registration**: add case blocks in _handleToolCall switch
4. **Tenant scoping**: both tools use RequestContext.tenantId for all DB queries
5. **Contract tests**: dedicated test cases for each tool

## Schema Change
```sql
ALTER TABLE ai_messages ADD COLUMN archived_at TEXT;
CREATE INDEX idx_ai_messages_archived ON ai_messages(archived_at);
```

## Acceptance Criteria
- [ ] mark_messages_read registered in toolSchemas.ts + tools/list + _handleToolCall
- [ ] archive_messages registered in toolSchemas.ts + tools/list + _handleToolCall
- [ ] mark_messages_read marks specific messages or all unread
- [ ] archive_messages sets archived_at on old messages
- [ ] get_ai_messages excludes archived by default
- [ ] get_ai_messages with includeArchived=true returns all
- [ ] Both tools are tenant-scoped (via RequestContext)
- [ ] Contract tests for mark + archive operations
- [ ] Contract test verifying tools appear in tools/list response

## Files
- touches: src/unified-neural-mcp-server.ts (handlers + tools/list)
- touches: src/unified-server/memory/index.ts (mark/archive DB methods)
- touches: src/shared/toolSchemas.ts (schema definitions)
- touches: tests/ (new contract tests)
