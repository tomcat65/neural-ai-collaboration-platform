# Story P2: Server Consolidation

## Status: PENDING

## User Story
**As** the neural system maintainer,
**I need** a single server class replacing the two near-duplicate implementations,
**So that** there is one source of truth for all tool handlers, middleware, and HTTP endpoints.

## Acceptance Criteria
1. `src/mcp-http-server.ts` (NetworkMCPServer, 1,059 lines) deleted
2. `UnifiedNeuralMCPServer` renamed to `NeuralMCPServer`
3. Unique functionality from NetworkMCPServer (userTeamTools) folded in or dropped if dead code
4. `src/index.ts` updated to reference `NeuralMCPServer` only
5. All docker-compose files reference the single entry point
6. All imports referencing `mcp-http-server` or `NetworkMCPServer` updated or removed
7. `grep -r "NetworkMCPServer\|mcp-http-server" src/` returns zero results
8. Server starts cleanly: `docker compose up` shows no import errors
9. P0 contract tests pass
10. Consolidated server under 1,200 lines (simulation tools not yet removed — that's P3)

## Technical Notes
- NetworkMCPServer (port 5174) and UnifiedNeuralMCPServer (port 6174) share: Express setup, MCP JSON-RPC, /ai-message, /ai-messages, /health, MessageHub, agent registration
- Unified adds: helmet, cors, auth, rate limiting, observability, readiness probe, metrics
- Check `src/tools/userTeamTools.ts` — if only imported by mcp-http-server.ts, it's dead code after deletion

## Dependencies
- P1 (message migration complete — modifying the server that handles messages)

## Files
- `src/mcp-http-server.ts` (delete)
- `src/unified-neural-mcp-server.ts` (modify — rename class)
- `src/index.ts` (modify)
- `src/tools/userTeamTools.ts` (evaluate — keep or delete)

## File Ownership
- touches: `src/unified-neural-mcp-server.ts`, `src/index.ts`
- deletes: `src/mcp-http-server.ts`, possibly `src/tools/userTeamTools.ts`
- reads: `docker/docker-compose.unified-neural-mcp.yml`

## Wiring Proof
- CLI: `grep -r "NetworkMCPServer\|mcp-http-server" src/` returns empty
- CLI: `docker compose -f docker/docker-compose.unified-neural-mcp.yml up -d && curl http://localhost:6174/health` returns 200
- Regression: P0 contract tests pass
