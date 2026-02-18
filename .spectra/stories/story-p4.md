# Story P4: Weaviate Search Scoring Fix

## Status: PENDING

## User Story
**As** an agent searching the neural knowledge graph,
**I need** search results scored by actual relevance instead of Math.random(),
**So that** the most relevant entities appear first in results.

## Acceptance Criteria
1. `search_entities` searchScore based on actual match quality — not Math.random()
2. Scoring: exact name match = 1.0, partial name match = 0.8, content/observation match = 0.6
3. `semanticSimilarity` populated from Weaviate's actual cosine distance when available, null when not
4. `read_graph` relation graphWeight = 1.0 (static) or derived from real metadata
5. Results sorted by score descending
6. Graceful degradation to SQLite LIKE scoring when Weaviate unavailable
7. P0 contract tests pass
8. Deterministic ordering: same query = same result order

## Technical Notes
- Weaviate confirmed running with `t2v-transformers` module
- `src/memory/weaviate-client.ts` has `searchMemories()` returning results with distance scores
- After P3 removes simulation tools, the only remaining Math.random calls are in search/graph scoring
- Fake scoring locations in unified-neural-mcp-server.ts (post-P3 line numbers will differ):
  - searchScore: Math.random() * 0.5 + 0.5
  - semanticSimilarity: Math.random() * 0.4 + 0.6
  - graphWeight: Math.random() * 0.5 + 0.5
  - averageConnectivity: Math.random() * 5 + 2
  - graphDensity: Math.random() * 0.3 + 0.1

## Dependencies
- P3 (simulation tools removed — remaining Math.random calls are only in kept tools)

## Files
- `src/unified-neural-mcp-server.ts` (modify — fix scoring in search_entities, read_graph)
- `src/memory/weaviate-client.ts` (read — understand distance score format)

## File Ownership
- touches: `src/unified-neural-mcp-server.ts`
- reads: `src/memory/weaviate-client.ts`

## Wiring Proof
- CLI: `grep -c "Math.random" src/unified-neural-mcp-server.ts` = 0
- CLI: Search for same term twice via API — verify identical result ordering
- Integration: Weaviate semantic results include real distance scores
