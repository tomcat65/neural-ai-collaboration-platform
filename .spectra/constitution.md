# Neural Redesign — Constitution

## Project
Neural shared-memory-mcp system redesign — strip to what it does well, do it excellently.

## Owner
Tommy (TomCat65)

## Initiated
2026-02-18

## Non-Negotiable Constraints

1. **ZERO DATA LOSS.** Every entity, observation, relation, message, agent registration, learning record, and preference in the live SQLite database must survive intact through every phase. Preservation target: 2,535 rows (shared_memory=2,533, individual_memory=2).
2. **Backup gate.** A verified, readable backup of the live Docker volume DB must exist before any schema change. Backup location: `/mnt/d/Backups/Neural/unified-platform.db.backup-live-20260218-142758` (7.2MB).
3. **No drop-and-recreate.** Migrations READ from existing structure, WRITE to new structure. Old data stays until verified.
4. **Post-migration validation.** Row counts must match pre-migration totals exactly.
5. **Weaviate volume preserved.** Do NOT destroy the Weaviate Docker volume at any point.

## Infrastructure Constraints (Do NOT Change)

1. **Docker compose project name:** `unified` — hardcoded in Tommy's startup scripts (`neural-unified-up`, `neural-chatgpt-up.sh`)
2. **Compose file path:** `docker/docker-compose.unified-neural-mcp.yml` — keep filename exactly as-is
3. **MCP port:** `6174` — do not change
4. **Message Hub port:** `3004` — do not change
5. **mcp-shim** (`~/projects/mcp-shim/`) — zero changes needed, pure network passthrough with API key injection. Tool registry changes are invisible to it.

## Architectural Decisions (Locked)

1. **Single server class.** Delete `mcp-http-server.ts` (NetworkMCPServer). Rename `UnifiedNeuralMCPServer` to `NeuralMCPServer`.
2. **Dedicated ai_messages table.** Indexed SQL queries replace 3x LIKE scans on JSON blobs.
3. **15 real tools, 16 simulation tools deleted.** See plan.md for the exact lists.
4. **SQLite primary + Weaviate optional.** Drop Redis and Neo4j entirely (code + docker-compose).
5. **README generated from live tool registry.** No hand-written tool documentation.
6. **Entity/observation/relation normalization deferred to P7.** Current redesign scope is Pre-P0 through P6.

## Live Database Baseline (2026-02-18)

Source: Docker container `unified-unified-neural-mcp-1` at `/app/data/unified-platform.db`
Volume: `unified_unified_neural_data`

### shared_memory table (2,533 rows)
| memory_type | count |
|---|---|
| ai_message | 1,284 |
| observation | 680 |
| agent_registration | 294 |
| entity | 161 |
| relation | 114 |

### Other tables
| table | count |
|---|---|
| individual_memory | 2 |
| tasks | 0 |
| shared_knowledge | 0 |
| consensus_history | 0 |
| project_artifacts | 0 |

### Top message senders (from shared_memory.created_by)
unified-neural-mcp-server(574), claude-desktop(155), claude-cli(128), codex(98), Sally(28), richard-pricing(27)

## Agents
- **claude-code** — builder agent (Cursor/CLI, project root)
- **codex** — outside perspective, architecture review
- **claude-sonnet** — coordinator, Tommy's interface
