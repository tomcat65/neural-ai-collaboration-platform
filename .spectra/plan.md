# SPECTRA Execution Plan — Neural Efficiency Phase 1 (Rev 4)

## Project: shared-memory-mcp
## Level: 3 (Large Feature — multi-phase with cross-model validation)
## Generated: 2026-02-19 (Rev 4: addresses codex Rev3 findings #1–#3)
## Branch: neural-efficiency (from main @ 62de893)
## Agents: claude-code (builder), codex (reviewer), claude-desktop (coordinator)

## Prior Work: Neural Redesign (COMPLETE)
All 8 tasks (000–700) completed on neural-redesign branch, merged to main.
Net result: -1,800 lines, 18 tools, zero data loss. See git log for details.

## Codex Audit Findings Addressed
### Rev 1 (9 findings → all addressed in Rev 2):
- HIGH #1: User identity binding — RequestContext with trusted auth → S2
- HIGH #2: Tenant context at tool boundary — _handleToolCall receives RequestContext → S2
- HIGH #3: session_handoffs uniqueness tenant-scoped — (tenant_id, project_id) unique index → S1
- HIGH #4: user_id predicates — isolation policy defined (tenant=mandatory, user=per-tool) → S2
- MEDIUM #5: Backup gate includes tenants.db + strict parity assertions → S0
- MEDIUM #6: user_id in tool schemas — begin_session/get_agent_context schemas updated → S3
- MEDIUM #7: search_entities dedup by (entity_name, tenant_id) → S5
- LOW #8: Token budget reframed as upgrade → S6
- LOW #9: Tenant naming standardized to 'default' → S1

### Rev 2 (6 findings → all addressed in Rev 3):
- HIGH #1: In-memory cache key leakage — cache keys updated to tenantId:agentId composite → S2
- HIGH #2: Handoff scoping clarified — tenant-scoped only, NOT user-scoped; user_id stamped for audit trail → S2
- MEDIUM #3: Dependency graph corrected — S5 (1300) now blocked by 1000, not just 800 → S5, plan
- MEDIUM #4: New tool registration — explicit schema/list/handler/test registration for get_user_profile + update_user_profile → S3
- MEDIUM #5: userId auth mismatch — JWT callers with mismatched args.userId get 403; agent keys pass through → S3
- LOW #6: Entity name uniqueness — enforce constraint or handle safely in dedup logic → S5

### Rev 3 (3 findings → all addressed in Rev 4):
- MEDIUM #1: Handoff isolation policy contradiction — unified to single model: (tenant_id, project_id) scoped, not agent-scoped → plan, S2
- MEDIUM #2: S4 tool registration AC incomplete — explicit registration AC added for mark_messages_read + archive_messages → S4
- MEDIUM #3: S5 entity uniqueness not actionable on JSON content — mechanism specified: application-level dedup-safe upsert contract (not DB constraint) → S5

## Isolation Policy
- **Tenant isolation: MANDATORY** — every data query includes `WHERE tenant_id = ?`
- **User isolation: PER-TOOL** — user profiles are user-scoped within tenant
- **Messages: TENANT + AGENT scoped** — filtered by (tenant_id, to_agent), NOT user-scoped
- **Handoffs: TENANT + PROJECT scoped** — filtered by (tenant_id, project_id), NOT agent-scoped or user-scoped. Any agent within the tenant can read/write handoffs for a project. user_id is stamped on write for audit trail only.
- **Cache keys: TENANT-AWARE** — all in-memory caches keyed by tenantId:agentId composite
- **Agent definitions: GLOBAL** — register_agent, set_agent_identity, get_agent_status are cross-tenant
- **userId mismatch: REJECTED** — JWT callers providing mismatched args.userId get 403

---

## Task 800: Backup Gate + Baseline [Pre-P1]
- [ ] 800: Backup live DBs, confirm all contract tests pass on main
- AC:
  - Live Docker unified-platform.db backed up with PRAGMA integrity_check = ok
  - Live Docker tenants.db backed up with PRAGMA integrity_check = ok (if exists)
  - Row counts with strict parity: ai_messages, shared_memory, individual_memory, session_handoffs
  - NULL checks on required columns, distribution checks, sample hash verification
  - All existing contract tests pass (baseline + security + session protocol)
  - begin_session token estimate < 4k confirmed
- Files: backup output only
- Verify: integrity_check + row counts + parity assertions + test pass
- Risk: low
- Status: **PENDING**

---

## Task 900: Users Table + Schema Extensions [P1a]
- [ ] 900: Create users table, add tenant_id/user_id to ai_messages + session_handoffs, backfill, fix handoff uniqueness
- AC:
  - users table created (id, tenant_id, display_name, timezone, locale, date_format, units, working_hours, last_seen_tz, prefs_version, created_at, updated_at)
  - ai_messages has tenant_id + user_id columns with index
  - session_handoffs has tenant_id + user_id columns with index
  - session_handoffs unique constraint updated: (tenant_id, project_id) WHERE active=1
  - All existing rows backfilled with tenant_id='default' (standardized naming)
  - Bootstrap user 'tommy' created (timezone=America/Chicago, locale=en-US)
  - Migration is idempotent (safe to re-run)
  - Zero data loss — parity assertions: row counts match, no NULLs in tenant_id post-backfill
  - All existing contract tests still pass
- Files:
  - creates: src/migrations/002-users-tenant-columns.ts
  - touches: src/unified-server/memory/index.ts
- Verify: `docker exec unified-unified-neural-mcp-1 sqlite3 /app/data/unified-platform.db "SELECT COUNT(*) FROM users"` >= 1
- Risk: **high** (schema migration on live data)
- Blocked-by: 800
- Status: **PENDING**

---

## Task 1000: RequestContext + Tenant-Scoped Tool Handlers [P1b]
- [ ] 1000: Introduce trusted RequestContext, wire tenant_id into all data-touching handlers, fix cache keys
- AC:
  - RequestContext interface: { tenantId, userId, timezone, apiKeyId } — built by auth middleware
  - _handleToolCall(name, args, context: RequestContext) — signature updated
  - All data-touching handlers use context.tenantId (NOT args) for DB queries
  - In-memory cache keys updated to tenantId:agentId composite (no cross-tenant leakage)
  - Handoffs are tenant-scoped only; user_id stamped for audit trail, NOT used as query predicate
  - Agent tools (register, identity, status) remain global
  - Legacy API keys: tenantId='default', userId=null
  - X-User-Id header only accepted when ENABLE_DEV_HEADERS=1 (dev mode only)
  - Tool args CANNOT override trusted tenant/user context
  - Contract tests pass (default tenant implicitly)
  - New test: cross-tenant isolation (tenant1 data invisible to tenant2)
  - New test: args cannot spoof tenant context
  - New test: cache isolation (tenant1 cached data not returned for tenant2)
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/unified-server/memory/index.ts, src/middleware/security.ts
  - creates: tests/contract-tenant-isolation.test.ts
- Verify: `npx vitest run tests/contract-tenant-isolation.test.ts`
- Risk: **high** (affects all tool read/write paths + cache layer)
- Blocked-by: 900
- Status: **PENDING**

---

## Task 1100: User Profile + Timezone Utility [P1c]
- [ ] 1100: Add get_user_profile/update_user_profile tools, timezone handling, HOT tier user block
- AC:
  - X-User-Timezone header parsed and stored as last_seen_tz
  - get_user_profile: registered in toolSchemas.ts + tools/list + _handleToolCall
  - update_user_profile: registered in toolSchemas.ts + tools/list + _handleToolCall
  - get_user_profile returns user record (tenant-scoped via RequestContext)
  - update_user_profile updates prefs, bumps prefs_version, enforces ownership
  - JWT user callers: args.userId mismatch → 403 rejection
  - Agent service key callers: args.userId accepted (acts on behalf)
  - No userId anywhere: HOT tier omitted, no error
  - begin_session includes HOT tier user block when userId provided (schema updated)
  - get_agent_context includes HOT tier user block when userId provided (schema updated)
  - Tool schemas in toolSchemas.ts updated for all 4 tools
  - Timestamp formatting utility available
  - Contract tests for new tools + userId mismatch rejection
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/unified-server/memory/index.ts
  - touches: src/shared/toolSchemas.ts
  - touches: tests/
- Verify: `npx vitest run` (all suites)
- Risk: medium
- Blocked-by: 1000
- Status: **PENDING**

---

## Task 1200: mark_as_read + Bulk Archive [P1d]
- [ ] 1200: Add mark_messages_read and archive_messages tools
- AC:
  - mark_messages_read marks specific messages or all unread for an agent
  - archive_messages sets archived_at on messages older than N days
  - ai_messages has archived_at column with index
  - get_ai_messages excludes archived by default, includeArchived flag to override
  - Both tools are tenant-scoped (via RequestContext)
  - Both tools registered in toolSchemas.ts + tools/list + _handleToolCall
  - Contract tests for mark + archive operations
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/unified-server/memory/index.ts
  - touches: src/shared/toolSchemas.ts
  - touches: tests/
- Verify: `npx vitest run` (all suites)
- Risk: low
- Blocked-by: 1000
- Status: **PENDING**

---

## Task 1300: search_entities Dedup [P1e]
- [ ] 1300: Deduplicate search_entities results by (entity_name, tenant_id) composite key
- AC:
  - search_entities returns each entity at most once per (name, tenant_id)
  - Highest relevance score wins when deduplicating
  - Source provenance preserved (which backends matched)
  - Dedup happens after tenant scoping (requires task 1000)
  - Entity name uniqueness within tenant: enforce via constraint or safe dedup handling
  - Existing contract tests still pass
  - New test: search returning duplicates now returns unique results
- Files:
  - touches: src/unified-neural-mcp-server.ts or src/unified-server/memory/index.ts
  - touches: tests/
- Verify: `npx vitest run` (all suites)
- Risk: low
- Blocked-by: 1000
- Status: **PENDING**

---

## Task 1400: Token Budget Ceiling Upgrade [P1f]
- [ ] 1400: Upgrade existing truncation to enforce hard token budget with priority-based trimming
- AC:
  - maxTokens parameter accepted (default: 4000) by get_agent_context and begin_session
  - Existing observation cap preserved as baseline (upgraded, not replaced)
  - Truncation follows priority order: identity > handoff > guardrails > observations > messages > summary
  - meta.truncated flag set when ceiling hit
  - meta.sectionsDropped lists what was trimmed
  - tokenEstimate reflects actual returned size (post-truncation)
  - Contract test: large context gets truncated correctly
  - Existing tests still pass (under 4k already)
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/unified-server/memory/index.ts
  - touches: tests/
- Verify: `npx vitest run` (all suites)
- Risk: medium
- Blocked-by: 800
- Status: **PENDING**

---

## Dependency Graph

```
800 (Backup Gate)
 ├── 900 (Users + Schema) ──► 1000 (RequestContext + Tenant Scoping + Cache Fix)
 │                                    ├──► 1100 (User Profile + Timezone)
 │                                    ├──► 1200 (mark_as_read + Archive)
 │                                    └──► 1300 (Search Dedup)
 └── 1400 (Token Budget Upgrade)
```

Tasks 1100, 1200, and 1300 can run in parallel after 1000.
Task 1400 only depends on 800 (independent of multi-tenant work).

---

## Summary

| Task | Phase | Risk | Description | Codex Findings | Blocked By |
|------|-------|------|-------------|----------------|------------|
| 800 | Pre-P1 | low | Backup gate + baseline | Rev1 #5 | — |
| 900 | P1a | **high** | Users table + schema extensions | Rev1 #3, #9 | 800 |
| 1000 | P1b | **high** | RequestContext + tenant scoping + cache fix | Rev1 #1,#2,#4; Rev2 #1,#2 | 900 |
| 1100 | P1c | medium | User profile + timezone | Rev1 #6; Rev2 #4,#5 | 1000 |
| 1200 | P1d | low | mark_as_read + bulk archive | — | 1000 |
| 1300 | P1e | low | search_entities dedup | Rev1 #7; Rev2 #3,#6 | 1000 |
| 1400 | P1f | medium | Token budget ceiling upgrade | Rev1 #8 | 800 |

**7 tasks, 2 high-risk, 18/18 codex findings addressed (9 Rev1 + 6 Rev2 + 3 Rev3)**
