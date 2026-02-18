# Story P6: README Truth-Sync

## Status: PENDING

## User Story
**As** a developer or AI agent configuring neural as an MCP server,
**I need** documentation to accurately reflect the actual tool registry,
**So that** there is no confusion about what neural can and cannot do.

## Acceptance Criteria
1. `README.md` lists exactly the 15 real tools with accurate descriptions
2. Tool list generated from `src/shared/toolSchemas.ts` — not hand-written
3. Script `scripts/generate-tool-docs.ts` reads toolSchemas and outputs markdown
4. README removes references to: autonomous mode, RAFT consensus, multi-provider AI, cross-platform sync
5. README describes: SQLite primary + optional Weaviate semantic search
6. Docker setup section reflects simplified compose (no Redis, no Neo4j)
7. Configuration section lists only real environment variables
8. `EXAMPLES_OF_USE.md` updated — remove examples of deleted tools
9. `grep -r "execute_ai_request\|start_autonomous_mode\|consensus_vote" docs/ README.md EXAMPLES_OF_USE.md` returns empty

## Technical Notes
- Current README likely overpromises capabilities
- Tool doc generation: import toolSchemas, iterate, output markdown table
- Keep minimal — tool schemas ARE the documentation

## Dependencies
- P5 (all code changes complete — docs reflect final state)

## Files
- `README.md` (modify)
- `EXAMPLES_OF_USE.md` (modify)
- `scripts/generate-tool-docs.ts` (create)
- `docs/MULTI_TENANT_DESIGN.md` (evaluate)
- `docs/MULTI_TENANT_SECURITY.md` (evaluate)

## File Ownership
- owns: `scripts/generate-tool-docs.ts`
- touches: `README.md`, `EXAMPLES_OF_USE.md`
- reads: `src/shared/toolSchemas.ts`

## Wiring Proof
- CLI: `npx ts-node scripts/generate-tool-docs.ts | wc -l` outputs reasonable count
- CLI: `grep -c "execute_ai_request\|start_autonomous_mode" README.md` = 0
- Manual: README tool count matches `curl http://localhost:6174/api/tools | jq length`
