# Neural Redesign — Guardrails

Populated during build phases. Record failures, lessons, and patterns here.

## Learned Patterns
- `translate_path` uses params `path`, `fromPlatform`, `toPlatform` — NOT `sourcePath`/`sourcePlatform`/`targetPlatform`.
- `set_agent_identity` exists in `toolSchemas.ts` and as a case handler but is NOT in the `tools/list` response. It's callable but hidden. Decision: keep as-is for now, add to tools/list in P3 if desired.
- Tool registry currently has 30 tools (not 31 — `search_nodes` is exposed as a legacy alias).

## Known Risks
- Stale host-side DB (`data/unified-platform.db`, 229 rows) is NOT the live data. Always operate against Docker volume.
- `simulateAdvancedMemoryIntegration()` is a no-op console.log — safe to remove.
- Existing ai_message JSON has no `from` field. Use `shared_memory.created_by` column instead.
- `shared_memory` table stores 5 different types (ai_message, observation, agent_registration, entity, relation) — be careful with WHERE clauses during migration.
- Docker compose project name `unified`, file path `docker/docker-compose.unified-neural-mcp.yml`, ports 6174 (MCP) and 3004 (MessageHub) are hardcoded in Tommy's startup scripts — NEVER change these.
- mcp-shim at `~/projects/mcp-shim/` is a pure passthrough — do not touch it during any phase.
