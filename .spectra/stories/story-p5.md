# Story P5: Drop Redis + Neo4j

## Status: PENDING

## User Story
**As** the neural system operator,
**I need** Redis and Neo4j removed from codebase and Docker infrastructure,
**So that** the system runs with only SQLite (primary) + Weaviate (optional) — no unnecessary services.

## Acceptance Criteria
1. `src/memory/redis-client.ts` deleted
2. `src/memory/neo4j-client.ts` deleted
3. All Redis/Neo4j imports removed from `src/unified-server/memory/index.ts`
4. `MemoryManager.initializeAdvancedSystems()` — only initializes Weaviate
5. `MemoryManager.storeInAdvancedSystems()` — only writes to Weaviate
6. `MemoryManager.searchInAdvancedSystems()` — only queries Weaviate
7. `MemoryManager.close()` — only closes Weaviate
8. `MemoryManager.getSystemStatus()` — returns only sqlite + weaviate
9. Redis cache layer removed: no `getCachedSearchResults` / `cacheSearchResults` / `cacheMemory`
10. Docker compose: remove redis, neo4j services and their volumes
11. Remove env vars: `REDIS_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
12. `package.json` — remove `ioredis` and `neo4j-driver` deps
13. `/ready` endpoint no longer checks redis/neo4j
14. `/health` capabilities list cleaned — remove autonomous-agents, consensus-coordination, ml-integration
15. `grep -ri "redis\|neo4j" src/ --include="*.ts"` returns zero (excluding comments)
16. Server starts cleanly with SQLite + Weaviate only
17. P0 contract tests pass
18. Observability: remove redis/neo4j system tracking from `src/observability/index.ts`

## Technical Notes
- Entity data confirmed in SQLite (161 entities, 680 observations, 114 relations in shared_memory) — NO exclusive Neo4j data
- Redis was search cache only — sub-100ms queries on 2,500 rows don't need caching
- Neo4j relationship mapping duplicated by shared_memory relation records
- Weaviate volume MUST be preserved (has semantic embeddings)
- Check `src/memory/types.ts` for Redis/Neo4j type defs to clean up

## Dependencies
- P4 (Weaviate scoring fixed — it's the one we're keeping)

## Files
- `src/memory/redis-client.ts` (delete)
- `src/memory/neo4j-client.ts` (delete)
- `src/unified-server/memory/index.ts` (modify)
- `src/unified-neural-mcp-server.ts` (modify — /ready, /health)
- `src/observability/index.ts` (modify)
- `src/memory/types.ts` (modify if needed)
- `docker/docker-compose.unified-neural-mcp.yml` (modify)
- `package.json` (modify)

## File Ownership
- deletes: `src/memory/redis-client.ts`, `src/memory/neo4j-client.ts`
- touches: `src/unified-server/memory/index.ts`, `src/unified-neural-mcp-server.ts`, `src/observability/index.ts`, `docker/docker-compose.unified-neural-mcp.yml`, `package.json`

## Downtime Protocol
- **Neural goes down** during stack restart after removing Redis/Neo4j services (minutes)
- **Before restart:** post "neural going down for P5 stack change" to Slack `#neural-system`
- **After restart:** verify `/health` returns 200, verify `docker compose config --services` shows only 3 services, post "neural back up" to Slack
- **If restart fails:** all coordination stays on Slack until resolved
- **Fallback memory:** `.spectra/` files on disk (committed to git)

## Wiring Proof
- CLI: `grep -ri "redis\|neo4j" src/ --include="*.ts" | grep -v "//\|/\*"` returns empty
- CLI: `docker compose config --services` lists only neural-mcp, weaviate, t2v-transformers
- CLI: `curl http://localhost:6174/ready` — healthy with sqlite + weaviate only
- Regression: P0 contract tests pass
