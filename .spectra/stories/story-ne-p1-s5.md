# NE-P1-S5: search_entities Dedup

## Type: Enhancement
## Risk: low
## Phase: P1e
## Codex Findings Addressed: Rev1 #7 (dedup by name unsafe); Rev2 #3 (dependency graph conflict), #6 (entity name uniqueness not enforced); Rev3 #3 (uniqueness mechanism not actionable)

## Description
Deduplicate search_entities results to return canonical entity records only. Currently the hybrid search can return the same entity multiple times (once from exact match, once from vector similarity, once from graph traversal). Use vectors for ranking/scoring but only return each entity once.

## Dedup Key (codex Rev1 #7, Rev2 #6, Rev3 #3)
- Dedup by (entity_name, tenant_id) composite — NOT by display name alone
- All dedup happens AFTER tenant filtering (search results already tenant-scoped from S2)

### Entity Name Uniqueness Mechanism (codex Rev3 #3)
Entity names in shared_memory are stored inside JSON `content` blobs, NOT as a dedicated column. A simple SQL UNIQUE constraint on (name, tenant_id) is not possible without schema changes. The chosen mechanism is:

**Application-level dedup-safe upsert contract:**
- `create_entities` handler will implement name-based lookup before insert (upsert semantics: if entity with same name exists in tenant, merge observations instead of creating duplicate). Current baseline is plain insert — this upsert behavior is a target requirement for S5.
- search_entities dedup relies on create_entities enforcing same-name uniqueness within a tenant
- Dedup in search is a safety net, NOT the primary uniqueness enforcement
- Add explicit test: calling create_entities twice with same name + tenant produces one entity (not two)
- Future option: if entity volume grows, introduce a dedicated `entities` table with (name, tenant_id) UNIQUE column for O(1) lookup. Not needed at current scale.

## Dependency (codex Rev2 #3)
- This task depends on 1000 (tenant-scoped handlers), NOT just 800
- S5 AC says "dedup happens after tenant scoping" which requires tenant scoping to be implemented first
- Corrected in dependency graph: 1300 blocked-by 1000

## Current Behavior
- search_entities returns results from multiple search backends
- Same entity can appear 2-3x with different relevance scores
- Confusing for consumers, inflates token counts

## Target Behavior
- Deduplicate by (entity_name, tenant_id) composite key
- Keep highest relevance score when merging duplicates
- Merge source tags (e.g., sources: ["exact", "semantic"])
- Return deduplicated array sorted by merged score descending

## Acceptance Criteria
- [ ] search_entities returns each entity at most once per (name, tenant_id)
- [ ] Highest score wins when deduplicating
- [ ] Source provenance preserved (which backends matched)
- [ ] Dedup happens after tenant scoping (requires S2/task 1000)
- [ ] Entity name uniqueness within tenant enforced by application-level upsert in create_entities
- [ ] New test: create_entities with duplicate name + tenant produces one entity (upsert, not duplicate)
- [ ] Existing contract tests still pass
- [ ] New test: search that previously returned duplicates now returns unique

## Files
- touches: src/unified-neural-mcp-server.ts or src/unified-server/memory/index.ts (search + dedup logic)
- touches: tests/ (contract test update)
