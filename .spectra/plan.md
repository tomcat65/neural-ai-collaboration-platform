# SPECTRA Execution Plan — Neural Redesign

## Project: shared-memory-mcp
## Level: 3 (Large Feature — multi-phase with cross-model validation)
## Generated: 2026-02-18
## Agents: claude-code (builder), codex (reviewer), claude-sonnet (coordinator)

## Preservation Target: 2,535 rows (shared_memory=2,533, individual_memory=2)

---

## Task 000: SQLite Backup Gate [Pre-P0]
- [x] 000: Verified backup of live Docker DB to host
- AC:
  - Backup pulled from Docker container (not stale host copy)
  - PRAGMA integrity_check = ok
  - Row counts match: shared_memory=2,533, individual_memory=2
  - Backup at /mnt/d/Backups/Neural/unified-platform.db.backup-live-20260218-142758
- Files: backup output only
- Verify: `sqlite3 /mnt/d/Backups/Neural/unified-platform.db.backup-live-20260218-142758 "SELECT COUNT(*) FROM shared_memory"` = 2533
- Risk: low
- Status: **DONE**

---

## Task 100: Baseline Contract Tests [P0]
- [x] 100: Create contract tests for all 15 real tools against live server
- AC:
  - tests/contract-baseline.test.ts exercises all 15 keep tools
  - Round-trip tests: create_entities→search_entities, send→get messages, register→status
  - All tests pass against current server
  - Response time baselines logged
- Files:
  - creates: tests/contract-baseline.test.ts, vitest.config.ts
  - touches: package.json
- Verify: `npx vitest run tests/contract-baseline.test.ts`
- Risk: low
- Max-iterations: 3
- Blocked-by: 000
- Status: **DONE** — 14/14 tests passing

---

## Task 200: ai_messages Table Migration [P1]
- [x] 200: Create ai_messages table, migrate 1,299 messages, update handlers
- AC:
  - New ai_messages table with 3 indexes (to_agent, from_agent, type)
  - 1,299/1,299 rows migrated, 0 failures (actual count higher than estimated)
  - All 6 codex amendments implemented:
    1. Validation beyond count (NULL checks, checksum, distribution)
    2. Idempotency guard (legacy_shared_memory_id UNIQUE, INSERT OR IGNORE)
    3. from_agent precedence (json.from > json.sender > created_by > unknown)
    4. Single transaction with rollback
    5. Malformed payload capture (ai_message_migration_failures table)
    6. Cutover gate (EXPLAIN QUERY PLAN confirms SEARCH using index)
  - storeMessage()/getMessages() in MemoryManager
  - send_ai_message + get_ai_messages handlers updated
  - /ai-message and /ai-messages HTTP endpoints updated
  - shared_memory rows untouched (zero data loss)
  - 14/14 P0 contract tests pass
- Files:
  - creates: src/migrations/001-ai-messages-table.ts, scripts/run-migration-001.sh
  - touches: src/unified-server/memory/index.ts, src/unified-neural-mcp-server.ts
- Verify: `docker exec unified-unified-neural-mcp-1 sqlite3 /app/data/unified-platform.db "SELECT COUNT(*) FROM ai_messages"` >= 1299
- Risk: **high** (data migration)
- Blocked-by: 100
- Status: **DONE** — committed 6d8a968

---

## Task 300: Server Consolidation [P2]
- [x] 300: Delete mcp-http-server.ts, rename to NeuralMCPServer
- AC:
  - src/mcp-http-server.ts deleted (1,059 lines removed)
  - src/tools/userTeamTools.ts deleted (dead code, only imported by deleted file)
  - Class renamed UnifiedNeuralMCPServer → NeuralMCPServer
  - hub-integration.ts updated — removed NetworkMCPServer import
  - src/index.ts, unified-server/index.ts, cross-platform/windows-wsl-bridge.ts references cleaned
  - Zero grep results for NetworkMCPServer or mcp-http-server in src/
  - Server starts cleanly, TypeScript compiles with no errors
  - 14/14 P0 contract tests pass
- Files:
  - deletes: src/mcp-http-server.ts, src/tools/userTeamTools.ts, src/tools/ (empty dir)
  - touches: src/unified-neural-mcp-server.ts, src/index.ts, src/message-hub/hub-integration.ts, src/unified-server/index.ts, src/cross-platform/windows-wsl-bridge.ts
- Risk: medium
- Blocked-by: 200
- Status: **DONE**

---

## Task 400: Tool Registry Trim [P3]
- [x] 400: Remove 17 simulation tools and dead code
- AC:
  - 17 simulation tools removed from tools/list and handlers
  - tools/list returns exactly 15 tools (added set_agent_identity + search_nodes)
  - Zero Math.random() in tool handlers (replaced with deterministic scoring)
  - simulateAdvancedMemoryIntegration() deleted (+ 3 call sites)
  - 6 dead directories removed (autonomous/, consensus/, multi-provider/, ml/, selection/, conflict/)
  - 9 simulation helper methods deleted
  - Server 1,556 lines (down from 2,773 = -1,217 lines)
  - P0 contract tests: 14/14 passing
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/shared/toolSchemas.ts, tests/contract-baseline.test.ts
  - deletes: src/autonomous/ (2 files), src/consensus/ (16 files), src/multi-provider/ (2 files+subdir), src/ml/ (4 files), src/selection/ (1 file), src/conflict/ (2 files)
- Verify: `curl -s http://localhost:6174/api/tools | jq length` = 15
- Risk: medium
- Max-iterations: 3
- Blocked-by: 300
- Status: **DONE**

---

## Task 500: Weaviate Search Scoring [P4]
- [x] 500: Replace Math.random() scores with real relevance scoring
- AC:
  - searchScore based on match quality (exact=1.0, partial=0.8, content=0.6) — done in P3
  - semanticSimilarity = null (Weaviate not wired into search path; client has _additional.score ready for future use)
  - graphWeight = 1.0 static — done in P3
  - Deterministic ordering: results sorted by searchScore descending
  - P0 contract tests: 14/14 passing
  - `grep -c "Math.random" src/unified-neural-mcp-server.ts` = 0
- Files:
  - touches: src/unified-neural-mcp-server.ts
  - reads: src/memory/weaviate-client.ts
- Risk: low
- Max-iterations: 2
- Blocked-by: 400
- Status: **DONE**

---

## Task 600: Drop Redis + Neo4j [P5]
- [ ] 600: Remove Redis and Neo4j from code and Docker infra
- AC:
  - redis-client.ts and neo4j-client.ts deleted
  - All Redis/Neo4j imports removed from MemoryManager
  - Docker compose: only neural-mcp + weaviate + t2v-transformers
  - package.json: ioredis and neo4j-driver removed
  - /ready and /health endpoints cleaned
  - grep for redis|neo4j in src/*.ts returns zero
  - P0 contract tests pass
- Files:
  - deletes: src/memory/redis-client.ts, src/memory/neo4j-client.ts
  - touches: src/unified-server/memory/index.ts, src/unified-neural-mcp-server.ts, src/observability/index.ts, docker/docker-compose.unified-neural-mcp.yml, package.json
- Verify: `grep -ri "redis\|neo4j" src/ --include="*.ts" | grep -v "//"` returns empty
- Risk: medium
- Max-iterations: 3
- Blocked-by: 500

---

## Task 700: README Truth-Sync [P6]
- [ ] 700: Update docs to reflect actual system state
- AC:
  - README lists 15 tools generated from toolSchemas.ts
  - No references to autonomous/consensus/multi-provider
  - Docker section matches simplified compose
  - EXAMPLES_OF_USE.md cleaned
- Files:
  - creates: scripts/generate-tool-docs.ts
  - touches: README.md, EXAMPLES_OF_USE.md
  - reads: src/shared/toolSchemas.ts
- Verify: `grep -c "execute_ai_request\|start_autonomous_mode" README.md` = 0
- Risk: low
- Max-iterations: 2
- Blocked-by: 600

---

## Summary

| Task | Phase | Risk | Est. Lines Changed | Blocked By |
|------|-------|------|-------------------|------------|
| 000 | Pre-P0 | low | +50 | — |
| 100 | P0 | low | +300 | 000 |
| 200 | P1 | **high** | +150, ~100 mod | 100 |
| 300 | P2 | medium | -1059, ~30 mod | 200 |
| 400 | P3 | medium | -900, ~50 mod | 300 |
| 500 | P4 | low | ~30 mod | 400 |
| 600 | P5 | medium | -500, ~100 mod | 500 |
| 700 | P6 | low | ~200 mod | 600 |

**Net: ~2,500 lines deleted, ~700 added = -1,800 lines**
