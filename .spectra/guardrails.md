# Neural Redesign — Guardrails

Populated during build phases. Record failures, lessons, and patterns here.

## Learned Patterns
- `translate_path` uses params `path`, `fromPlatform`, `toPlatform` — NOT `sourcePath`/`sourcePlatform`/`targetPlatform`.
- `set_agent_identity` exists in `toolSchemas.ts` and as a case handler but is NOT in the `tools/list` response. It's callable but hidden. Decision: keep as-is for now, add to tools/list in P3 if desired.
- Tool registry currently has 30 tools (not 31 — `search_nodes` is exposed as a legacy alias).

## P1 Learnings
- Actual ai_message count was 1,299 (not 1,284 as initially estimated from incomplete inventory).
- 1,297 of 1,299 messages have a `from` field in JSON. Only 2 don't (HTTP-origin messages). The `from_agent` precedence chain was still valuable for those 2.
- Node version mismatch between host (NODE_MODULE_VERSION 127) and container (115) prevents running TypeScript with better-sqlite3 on host. Use `docker exec sqlite3` for DB operations.
- Docker heredoc piping to sqlite3 silently fails. Use `docker cp` + `.read` approach instead.
- API_KEY is in `.env` file and gets picked up by Docker compose. Tommy's startup script at `~/bin/neural-unified-up` handles this.
- After rebuild/restart, always verify with `/health` and `tools/list` before running tests.

## Known Risks
- Stale host-side DB (`data/unified-platform.db`, 229 rows) is NOT the live data. Always operate against Docker volume.
- `simulateAdvancedMemoryIntegration()` is a no-op console.log — safe to remove.
- `shared_memory` table stores 5 different types (ai_message, observation, agent_registration, entity, relation) — be careful with WHERE clauses during migration.
- Docker compose project name `unified`, file path `docker/docker-compose.unified-neural-mcp.yml`, ports 6174 (MCP) and 3004 (MessageHub) are hardcoded in Tommy's startup scripts — NEVER change these.
- mcp-shim at `~/projects/mcp-shim/` is a pure passthrough — do not touch it during any phase.
