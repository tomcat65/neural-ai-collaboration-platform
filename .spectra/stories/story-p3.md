# Story P3: Tool Registry Trim

## Status: PENDING

## User Story
**As** the neural system,
**I need** the 16 simulation tools removed from the tool registry and their handlers deleted,
**So that** every exposed tool does real work backed by real storage.

## Acceptance Criteria
1. These 16 tools removed from schemas AND case handlers deleted:
   - `execute_ai_request`, `stream_ai_response`, `get_provider_status`, `configure_providers`
   - `start_autonomous_mode`, `configure_agent_behavior`, `set_token_budget`, `trigger_agent_action`
   - `test_connectivity`, `sync_platforms`, `generate_configs`, `configure_system`
   - `submit_consensus_vote`, `get_consensus_status`, `coordinate_agents`, `resolve_conflicts`
2. `src/shared/toolSchemas.ts` — only 15 real tools remain
3. `tools/list` MCP response returns exactly 15 tools
4. `GET /api/tools` returns exactly 15 tools
5. No `Math.random()` calls in tool handlers (fix searchScore/graphWeight in kept handlers)
6. Zero references to removed tool names in source: `grep -r "execute_ai_request\|stream_ai_response\|start_autonomous_mode" src/` returns empty
7. Dead directories removed if empty/unused: `src/autonomous/`, `src/consensus/`, `src/multi-provider/`, `src/ml/`, `src/cross-platform/`, `src/selection/`, `src/conflict/`
8. `simulateAdvancedMemoryIntegration()` method deleted (it's a console.log no-op)
9. Server file under 900 lines after handler removal
10. P0 contract tests pass

## Technical Notes
- Tool schemas in `src/shared/toolSchemas.ts` — single source of truth for definitions
- Each simulation handler is ~40-60 lines (lines 1700-2420 of unified-neural-mcp-server.ts)
- Removing 16 handlers = ~700-900 lines deleted
- `get_agent_status` (KEPT) has Math.random in stats — replace with real DB counts or omit
- `get_system_status` (KEPT) has Math.random in counts — replace with real DB queries
- `search_entities` searchScore (line 1120): replace Math.random with position-based score
- `read_graph` graphWeight (line 1266): replace with 1.0

## Dependencies
- P2 (server consolidated — editing one file, not two)

## Files
- `src/unified-neural-mcp-server.ts` (modify — delete 16 handlers, fix Math.random in kept handlers, delete simulateAdvancedMemoryIntegration)
- `src/shared/toolSchemas.ts` (modify — remove 16 tool schemas)
- `src/autonomous/` (evaluate — delete if unused)
- `src/consensus/` (evaluate — delete if unused)
- `src/multi-provider/` (evaluate — delete if unused)
- `src/ml/` (evaluate — delete if unused)
- `src/cross-platform/` (evaluate — delete if unused)
- `src/selection/` (evaluate — delete if unused)
- `src/conflict/` (evaluate — delete if unused)

## File Ownership
- touches: `src/unified-neural-mcp-server.ts`, `src/shared/toolSchemas.ts`
- deletes: dead directories (after verification)

## Wiring Proof
- CLI: `curl -s http://localhost:6174/api/tools | jq length` = 15
- CLI: `grep -c "Math.random" src/unified-neural-mcp-server.ts` = 0
- CLI: `wc -l src/unified-neural-mcp-server.ts` < 900
- Regression: P0 contract tests pass
