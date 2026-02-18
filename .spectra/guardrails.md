# Neural Redesign — Guardrails

Populated during build phases. Record failures, lessons, and patterns here.

## Learned Patterns
- `translate_path` uses params `path`, `fromPlatform`, `toPlatform` — NOT `sourcePath`/`sourcePlatform`/`targetPlatform`.
- `set_agent_identity` exists in `toolSchemas.ts` and as a case handler but is NOT in the `tools/list` response. It's callable but hidden. Decision: keep as-is for now, add to tools/list in P3 if desired.
- Tool registry currently has 30 tools (not 31 — `search_nodes` is exposed as a legacy alias).

## from_agent Attribution Bug (fixed 78a34a4)
- `from` was optional in send_ai_message schema — callers that omitted it got `from_agent='unified-neural-mcp-server'`
- Now required: `required: ['content', 'from']`
- Handler still falls back gracefully but logs a warning
- When `docker compose up` is run without exporting API_KEY, the container starts but auth fails on all MCP calls — always export API_KEY or use Tommy's `neural-unified-up` script

## P1 Learnings
- Actual ai_message count was 1,299 (not 1,284 as initially estimated from incomplete inventory).
- 1,297 of 1,299 messages have a `from` field in JSON. Only 2 don't (HTTP-origin messages). The `from_agent` precedence chain was still valuable for those 2.
- Node version mismatch between host (NODE_MODULE_VERSION 127) and container (115) prevents running TypeScript with better-sqlite3 on host. Use `docker exec sqlite3` for DB operations.
- Docker heredoc piping to sqlite3 silently fails. Use `docker cp` + `.read` approach instead.
- API_KEY is in `.env` file and gets picked up by Docker compose. Tommy's startup script at `~/bin/neural-unified-up` handles this.
- After rebuild/restart, always verify with `/health` and `tools/list` before running tests.

## P3 Learnings
- Actual simulation tool count was 17 (not 16 as estimated in plan).
- `set_agent_identity` and `search_nodes` added to tools/list to reach target of 15 tools.
- read_graph response structure changed: `statistics.basic.nodeCount` → `statistics.nodeCount` (flat, no nesting).
- Contract test for `get_system_status` replaced with `search_nodes` legacy alias test.
- Tool registry currently has 15 tools in tools/list + `set_agent_identity` case handler (now also in tools/list).

## P5 Learnings
- Deleting redis-client.ts and neo4j-client.ts broke the TypeScript build because 8 dead memory module files still imported them. All 8 were dead code (no active imports). Had to delete the entire cluster: advanced-neural-ai, adaptive-learning, neural-consolidation, enhanced-collaboration, neural-ai-platform, performance-optimization, hierarchical-memory, enterprise-features.
- event-driven-agents/ also dead (imported redis directly). Deleted.
- middleware/security.ts uses `redis` package independently for rate limiting with graceful fallback to memory. This is a separate concern from the core memory system and was intentionally kept.
- observability/metrics.ts has Neo4j metric definitions (NEO4J_CONNECTED, NEO4J_FALLBACK_TOTAL) that are now unused but safe dead code — kept to avoid breaking the metrics interface.
- After removing redis/neo4j from docker-compose, orphaned containers remain from previous runs. Must stop+rm them manually or use `--remove-orphans`.
- `/ready` endpoint no longer includes redis/neo4j in systems — degradation check is now only weaviate-aware.

## Known Risks
- Stale host-side DB (`data/unified-platform.db`, 229 rows) is NOT the live data. Always operate against Docker volume.
- `simulateAdvancedMemoryIntegration()` is a no-op console.log — safe to remove.
- `shared_memory` table stores 5 different types (ai_message, observation, agent_registration, entity, relation) — be careful with WHERE clauses during migration.
- Docker compose project name `unified`, file path `docker/docker-compose.unified-neural-mcp.yml`, ports 6174 (MCP) and 3004 (MessageHub) are hardcoded in Tommy's startup scripts — NEVER change these.
- mcp-shim at `~/projects/mcp-shim/` is a pure passthrough — do not touch it during any phase.
