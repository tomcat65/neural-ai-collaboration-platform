# Story P0: Baseline Contract Tests

## Status: DONE

## User Story
**As** a developer performing the neural redesign,
**I need** contract tests that verify current tool behavior against real data,
**So that** I can detect regressions during each subsequent phase.

## Acceptance Criteria
1. Test file `tests/contract-baseline.test.ts` exercises all 15 "keep" tools against the live server
2. Tests verify: `create_entities` creates and persists, `search_entities` finds it, `add_observations` appends, `create_relations` links, `read_graph` returns valid structure
3. Tests verify: `send_ai_message` stores and `get_ai_messages` retrieves (round-trip)
4. Tests verify: `register_agent` + `get_agent_status` round-trip
5. Tests verify: `record_learning` + `get_individual_memory` round-trip
6. Tests verify: `set_preferences` persists
7. Tests verify: `translate_path` returns correct platform paths
8. All tests pass against the CURRENT server (before any changes)
9. Tests run via `npx vitest run tests/contract-baseline.test.ts`
10. Test results include response time baselines for each tool (logged, not asserted)

## Technical Notes
- Test against live server at port 6174 (docker-compose.unified-neural-mcp.yml)
- Use HTTP POST to `/mcp` endpoint with JSON-RPC format
- Clean up test entities after each test (create with prefix `_test_` and delete/ignore after)
- Do NOT test the 16 simulation tools — they are being deleted

## Dependencies
- Pre-P0 (backup must exist before running tests that write data)

## Files
- `tests/contract-baseline.test.ts` (create)
- `vitest.config.ts` (create if not exists)
- `package.json` (modify — add vitest dev dep)

## File Ownership
- owns: `tests/contract-baseline.test.ts`
- touches: `package.json`
- reads: `src/unified-neural-mcp-server.ts`, `src/shared/toolSchemas.ts`

## Wiring Proof
- CLI: `npx vitest run tests/contract-baseline.test.ts` — all pass
- Integration: Each test does a full HTTP round-trip to the live server, not mocked
