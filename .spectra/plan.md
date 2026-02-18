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

---

## Task 200: ai_messages Table Migration [P1]
- [ ] 200: Create ai_messages table, migrate 1,284 messages, update handlers
- AC:
  - New ai_messages table with indexes
  - 1,284 rows migrated from shared_memory (exact count match)
  - from_agent from shared_memory.created_by (no "from" in JSON)
  - send_ai_message writes to ai_messages
  - get_ai_messages queries ai_messages with indexed WHERE
  - /ai-message and /ai-messages endpoints updated
  - Old shared_memory rows preserved
  - EXPLAIN QUERY PLAN shows index usage
  - P0 contract tests pass
- Files:
  - creates: src/migrations/001-ai-messages-table.ts, scripts/run-migration.sh
  - touches: src/unified-server/memory/index.ts, src/unified-neural-mcp-server.ts
- Verify: `sqlite3 unified-platform.db "SELECT COUNT(*) FROM ai_messages"` = 1284
- Risk: **high** (data migration)
- Max-iterations: 5
- Blocked-by: 100

---

## Task 300: Server Consolidation [P2]
- [ ] 300: Delete mcp-http-server.ts, rename to NeuralMCPServer
- AC:
  - src/mcp-http-server.ts deleted
  - Class renamed UnifiedNeuralMCPServer → NeuralMCPServer
  - Zero grep results for NetworkMCPServer or mcp-http-server in src/
  - Server starts cleanly
  - P0 contract tests pass
- Files:
  - deletes: src/mcp-http-server.ts
  - touches: src/unified-neural-mcp-server.ts, src/index.ts
- Verify: `grep -r "NetworkMCPServer\|mcp-http-server" src/` returns empty
- Risk: medium
- Max-iterations: 3
- Blocked-by: 200

---

## Task 400: Tool Registry Trim [P3]
- [ ] 400: Remove 16 simulation tools and dead code
- AC:
  - 16 simulation tools removed from schemas and handlers
  - tools/list returns 15 tools
  - Zero Math.random() in tool handlers
  - simulateAdvancedMemoryIntegration() deleted
  - Dead directories removed
  - Server < 900 lines
  - P0 contract tests pass
- Files:
  - touches: src/unified-neural-mcp-server.ts, src/shared/toolSchemas.ts
  - deletes: src/autonomous/, src/consensus/, src/multi-provider/, src/ml/, src/cross-platform/, src/selection/, src/conflict/ (if unused)
- Verify: `curl -s http://localhost:6174/api/tools | jq length` = 15
- Risk: medium
- Max-iterations: 3
- Blocked-by: 300

---

## Task 500: Weaviate Search Scoring [P4]
- [ ] 500: Replace Math.random() scores with real relevance scoring
- AC:
  - searchScore based on match quality (exact=1.0, partial=0.8, content=0.6)
  - semanticSimilarity from Weaviate distance when available
  - graphWeight = 1.0 static
  - Deterministic ordering
  - P0 contract tests pass
- Files:
  - touches: src/unified-neural-mcp-server.ts
  - reads: src/memory/weaviate-client.ts
- Verify: `grep -c "Math.random" src/unified-neural-mcp-server.ts` = 0
- Risk: low
- Max-iterations: 2
- Blocked-by: 400

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
