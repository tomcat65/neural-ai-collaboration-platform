# Bounded Consolidation — Implementation Plan

## Prior Work
- [x] Scaffolding cleanup (commit f401ec5) — un-ignored live production code, deleted dead stubs

## Task 1: Fix message delivery persistence bug
- [x] 1a. Add `updateMessageStatus()` method to MemoryManager for ai_messages-specific updates
- [x] 1b. Update `simulateRealTimeDelivery()` to use new method instead of `memoryManager.update(..., 'shared')`
- [x] 1c. Verify: build passes, delivery status is persisted to ai_messages

## Task 2: Fix readiness + align package.json
- [x] 2a. Fix `/ready` endpoint: return 207 for degraded state instead of `isDegraded ? 200 : 200`
- [x] 2b. Align `package.json` main/start/unified:start to `dist/unified-neural-mcp-server.js`
- [x] 2c. Verify: build passes

## Task 3: Remove synthetic metrics from canonical runtime
- [x] 3a. Replace Math.random()/hardcoded analytics with null (real data kept: totalEvents, activeAgents, memory heap, event counts)
- [x] 3b. Verify: /api/analytics returns only real data or explicit null markers

## Task 4: Truth the docs
- [x] 4a. Update README.md: sqlite-vec, 27 tools, correct architecture, canonical runtime documented
- [x] 4b. Archive docs/curl-answer.md → docs/curl-answer.md.archived
- [x] 4c. Verify: docs match runtime reality

## Task 5: Minimal agent registration upsert
- [x] 5a. Add upsert logic: delete prior registrations for same agentId before inserting
- [x] 5b. Verify: build passes

## Verification Summary
- All 5 tasks: build passes clean (`npm run build`)
- No secrets in any committed files
- No runtime behavior regressions (changes are correctness fixes + doc truth)
- Delivery status now persists to correct table (ai_messages metadata)
- /ready now distinguishes healthy (200) vs degraded (207) vs down (503)
- Analytics returns null for unmeasured metrics instead of fabricated values
- README reflects actual architecture (sqlite-vec, 27 tools, canonical runtime)
- Agent re-registration now updates instead of duplicating
