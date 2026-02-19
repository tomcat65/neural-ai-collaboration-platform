# NE-P1-S3: User Profile + Timezone Utility

## Type: Feature
## Risk: medium
## Phase: P1c
## Codex Findings Addressed: Rev1 #6 (user_id ingress underspecified); Rev2 #4 (tool registration incomplete), #5 (userId auth mismatch)

## Description
Add user profile tools (get_user_profile, update_user_profile) and timezone handling. Server reads X-User-Timezone header, updates last_seen_tz, and provides a utility for agents to format timestamps in user's timezone. HOT tier user block added to begin_session/get_agent_context.

## User Identity Binding (codex Rev1 #6, Rev2 #5)
- get_user_profile: uses context.userId from RequestContext (not from args) when querying own profile
- get_user_profile with explicit userId arg: allowed for agent service keys (context.userId=null) to look up users within their tenant
- update_user_profile: ONLY allowed for own profile (context.userId must match) or agent service keys
- Tool schemas updated: begin_session and get_agent_context accept optional `userId` parameter for HOT tier inclusion
- The userId in tool schemas is for data scoping (which user's prefs to load), NOT for auth — auth comes from RequestContext

### userId Mismatch Rule (codex Rev2 #5):
- **JWT user callers** (context.userId is non-null): if args.userId is provided AND differs from context.userId, the request is **REJECTED** with a 403 error. A user cannot impersonate another user.
- **Agent service key callers** (context.userId is null): args.userId is accepted as-is (agents act on behalf of users within their tenant).
- **No userId anywhere** (no JWT, no arg): HOT tier user block is omitted from response. No error.

## New Tool Registration (codex Rev2 #4)
Both new tools must be fully registered:
1. **Schema registration**: add to src/shared/toolSchemas.ts with full JSON Schema definitions
2. **Tool listing**: add to tools/list handler so they appear in MCP tool discovery
3. **Handler registration**: add case blocks in _handleToolCall switch
4. **Contract tests**: dedicated test cases for each tool

## Timezone Rules
- UTC at rest ALWAYS — no timezone in DB timestamps
- Client passes X-User-Timezone header on every request
- Server stores last_seen_tz on user record (informational, from header)
- User can set explicit timezone override via update_user_profile
- Priority: explicit user timezone > last_seen_tz > UTC
- Conversion happens at response/render boundary only

## HOT Tier User Block (kept lean)
```json
{
  "user": {
    "id": "tommy",
    "timezone": "America/Chicago",
    "locale": "en-US",
    "dateFormat": "YYYY-MM-DD",
    "units": "metric",
    "workingHours": {"start": "09:00", "end": "17:00"},
    "prefsVersion": 1
  }
}
```

## New Tools
1. `get_user_profile` — returns user profile (tenant-scoped via RequestContext)
   - Args: userId (optional — defaults to context.userId; required for agent service keys)
   - Returns: full user record
   - Schema: registered in toolSchemas.ts
   - Listed in tools/list
2. `update_user_profile` — update timezone, locale, date_format, units, working_hours
   - Args: fields to update (all optional)
   - Bumps prefs_version on every update
   - Auth: context.userId must match target, or caller is agent service key
   - Schema: registered in toolSchemas.ts
   - Listed in tools/list

## Tool Schema Updates
- begin_session: add optional `userId` param (for HOT tier user block)
- get_agent_context: add optional `userId` param (for HOT tier user block)
- get_user_profile: full schema with userId param
- update_user_profile: full schema with updatable fields
- All schemas registered in toolSchemas.ts

## Acceptance Criteria
- [ ] X-User-Timezone header parsed and stored as last_seen_tz
- [ ] get_user_profile registered in toolSchemas.ts, tools/list, and _handleToolCall
- [ ] update_user_profile registered in toolSchemas.ts, tools/list, and _handleToolCall
- [ ] get_user_profile returns user record (tenant-scoped via RequestContext)
- [ ] update_user_profile updates user prefs, bumps prefs_version
- [ ] update_user_profile enforces ownership (context.userId match or agent key)
- [ ] JWT user callers: args.userId mismatch → 403 rejection
- [ ] Agent service key callers: args.userId accepted (acts on behalf)
- [ ] No userId anywhere: HOT tier omitted, no error
- [ ] begin_session includes HOT tier user block when userId provided (schema updated)
- [ ] get_agent_context includes HOT tier user block when userId provided (schema updated)
- [ ] Timestamp formatting utility available for agents
- [ ] Contract tests for get_user_profile and update_user_profile
- [ ] Contract tests for userId mismatch rejection

## Files
- touches: src/unified-neural-mcp-server.ts (handlers + tools/list)
- touches: src/unified-server/memory/index.ts (user CRUD methods)
- touches: src/shared/toolSchemas.ts (all 4 schema additions/updates)
- touches: tests/ (new contract tests)
