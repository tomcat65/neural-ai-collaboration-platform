# Pass 2.0 Phase B Implementation Plan: `get_entity_context`

Status: revised after reviewer blocks from `codex` and `claude-code`; resubmission required before implementation.

## Goal

Implement `get_entity_context` as a read-only MCP tool that assembles identity-oriented context from legacy `shared_memory` rows plus the signed Phase A dry-run projection. Phase B must not write to `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, `shared_memory`, `graph_lookup_keys`, sqlite-vec tables, or `neural_audit_log`.

The response must use `phase: "B"` and `identity.id: null` when Phase C has not written persisted identity rows. Dry-run projection data is advisory only and must not introduce fake `ident_proj_*`, `facet_proj_*`, or `edge_proj_*` ids.

## Inputs

Add the ADR Agent Context API input surface to `src/shared/toolSchemas.ts`:

- `query` string, optional when `identityId` is provided. Human entity name, alias, canonical key, or lookup term.
- `identityId` string, optional Phase C persisted identity id. If both `identityId` and `query` are present, `identityId` wins and `query` is recorded for display.
- `tenantId` string, optional; default is request context tenant or `default`.
- `sections` string array, optional; default `["identity", "observations", "relations", "facets", "legacyBootstrap"]`. Supported values are exactly those five section names.
- `observationLimit` number, default 25, max 100.
- `observationOffset` number, default 0.
- `observationKindFilter` string array, optional.
- `relationLimit` number, default 25, max 100.
- `relationOffset` number, default 0.
- `relationTypeFilter` string array, optional. Matches `sourceRelationType` and `semanticRelationType`.
- `facetLimit` number, default 25, max 100.
- `facetOffset` number, default 0.
- `facetTypeFilter` string array, optional. Accepted in Phase B for contract compatibility, but Phase B does not return projected facet items.
- `maxTokens` number, default 8000, minimum 500, maximum 50000. Bounds keep response assembly predictable and prevent oversized context payloads.
- `since` ISO-8601 timestamp, optional. Filters observations and relation rows to those whose recorded/created timestamp is at or after the provided timestamp.
- `includeLegacyEmbedded` boolean, default false.
- `includeFacets` boolean, default true. In Phase B, this controls whether projected facet summary metadata appears in provenance, not `facets.items`.
- `includeCandidates` boolean, default true.
- `includeLegacyRowCounts` boolean, default true.
- `excludeLifecycleStatus` string array, optional. Default is null/no exclusion; closed projects remain retrievable by default.
- `dryRunArtifactPath` string, optional and dev/test-oriented. Production callers should omit this and let the loader select the latest signed valid `pass2_dry_run` audit row.
- `dryRunHash` string, optional and dev/test-oriented. If supplied, it must match a signed `neural_audit_log(operation='pass2_dry_run')` row for the same tenant and artifact.

Either `query` or `identityId` is required.

## Response Shape

Return a JSON object with:

- `schemaVersion: "pass2.entityContext.v1"`
- `phase: "B"`
- `query`, `tenantId`, `resolved`
- `resolution`
  - `matchedAlias`
  - `aliasType`
  - `aliasConfidence`
  - `matchedIdentityIds: []`
  - `candidates`
  - `lifecycleExcluded`
  - `warnings`
  - `proposedIdentity`
- `identity`
  - `id: null`
  - `displayName`
  - `canonicalEntityKey`
  - `entityType`
  - `lifecycleStatus`
  - `lifecycleSource`
  - `status: null`
  - `aliases`
  - `agentBootstrap`
- `observations`
  - `items`
  - `hasMore`
  - `nextOffset`
- `relations`
  - `items`
  - `hasMore`
  - `nextOffset`
- `facets`
  - `items`
  - `hasMore`
  - `nextOffset`
- `legacyBootstrap`
- `legacyRowCounts`
- `warnings`
- `provenance`
  - `schemaVersion`
  - `queryTimestamp`
  - `sourceRows`
  - `dedupedRedundantRepresentations`
  - `appliedDryRunReportHash`
  - `dryRunArtifactPath`
  - `dryRunProjection`
    - `proposedIdentity`
    - `proposedFacets`
    - `proposedLinks`
    - `classification`
    - `warnings`
- `tokenBudget`
  - `maxTokens`
  - `estimatedTokens`
  - `truncatedSections`

## Projection Loading

Create a read-only loader in `MemoryManager`:

1. Resolve artifact path/hash. If neither is supplied, select the latest valid `neural_audit_log` row for `operation='pass2_dry_run'` in the request tenant and use its recorded artifact reference/hash.
2. Parse JSON.
3. Recompute canonical hash using `canonicalDryRunHash(parsedSavedJson)`.
4. Refuse the artifact if the recomputed hash differs from the embedded `canonicalHash`, the selected audit `content_hash`, or a caller-provided `dryRunHash`.
5. Verify the selected hash exists in `neural_audit_log` with `operation='pass2_dry_run'`, the expected `content_hash`, and the same tenant as the request/artifact.
6. Refuse the artifact if artifact `tenantId` differs from request tenant.
7. Build an in-memory map from `canonicalKey` to dry-run group.
8. Never update audit rows or artifact files during Phase B.

The first implementation may read the JSON artifact on each call. Caching can be added later only if it is invalidated by path/hash/tenant and remains read-only.

## Resolution Algorithm

1. If `identityId` is provided and no persisted `entity_identities` row matches in the request tenant, return `resolved: false`, `identity.id: null`, and `PHASE_B_NO_PERSISTED_IDENTITY`; do not enter query normalization.
2. Normalize `query` with the existing canonical entity key logic and lookup variants.
3. Read `graph_lookup_keys` for the normalized variants, tenant-scoped, ordered by existing weight.
4. Join or compare returned lookup rows to legacy `shared_memory` rows. For Phase B projection selection, treat only `canonical_name` and `alias` entity lookup rows as exact identity evidence; ignore `embedded_observation_handle`, `agent_bootstrap_handle`, `derived`, metadata-derived, or other prose handle matches.
5. Find matching Phase A projection groups by canonical key.
6. Treat a projected identity as confident only when all of the following are true:
   - classification/proposed action is `facet_of_identity`/`facet_under_identity` or `single_identity`/`preserve`,
   - no group warning indicates ambiguity, collapse risk, manual review, or tenant mismatch defense-in-depth,
   - lifecycle filters do not exclude it.
7. `single_identity`/`preserve` can be reached only from a signed artifact produced with singleton groups included; the current signed Phase A artifact was generated with singleton groups excluded, so singleton-like matches in that artifact fall through to legacy fallback.
8. If exactly one confident non-excluded projected identity exists, return it as advisory context with `identity.id: null`, `resolved: false`, `PHASE_B_NO_PERSISTED_IDENTITY`, and projection details in `resolution.proposedIdentity`/`provenance.dryRunProjection`.
9. If the projection is `unknown`, `independent_identity`, `manual_review`, or carries warnings such as `NORMALIZATION_COLLAPSES_DISTINCT_RAW_NAMES`, return unresolved candidates and warnings; do not silently pick. `hb-apdas` must remain unresolved/manual-review in Phase B.
10. If multiple candidates exist, return candidates and `AMBIGUOUS_LOOKUP`; do not silently pick.
11. If `excludeLifecycleStatus` removes candidates, return `LIFECYCLE_EXCLUDED_CANDIDATES` and keep excluded candidates in `resolution.lifecycleExcluded`.
12. If an exact canonical-name or alias row exists but the signed dry-run artifact has no matching projection group, return `resolved:false`, `identity.id:null`, `resolution.proposedIdentity:null`, and warnings `EXACT_LOOKUP_PROJECTION_MISMATCH` plus `NO_PROJECTION_MATCH`; do not project any other dry-run group.
13. If no projection exists and there is no exact canonical-name or alias row, fall back to legacy exact/graph lookup and return unresolved candidates/warnings. The no-index fallback scanner must mirror the indexed exact contract by matching only entity `name` and `aliases`, not embedded observations, bootstrap text, metadata, or other derived handles.

## Legacy Entity And Observation Assembly

For all source entity rows in the selected projection group:

- Return source row ids in provenance.
- Surface `agentBootstrap` and aliases from legacy entity content.
- Count embedded inline observations separately from materialized observation rows.
- Fetch materialized observations whose `entityName` normalizes to the canonical key.
- Apply `observationKindFilter` against structured metadata kind plus recognizable observation content kind when metadata is absent.
- Sort observations by row `created_at` descending by default.
- Paginate with `observationLimit` and `observationOffset`.
- Avoid duplicate embedded/materialized prose where a materialized observation row already exists.

## Relations

Read legacy `shared_memory(memory_type='relation')` rows where normalized `from` or `to` matches the selected canonical key or any selected source row raw name.

Return relation items with:

- `edgeId: null`
- `sourceRowId`
- `fromIdentityId: null`
- `toIdentityId: null`
- `unresolvedFromName`
- `unresolvedToName`
- `fromResolutionStatus: "unresolved"`
- `toResolutionStatus: "unresolved"`
- `sourceRelationType`
- `semanticRelationType`
- `mappingConfidence`
- `mappingSource`
- `registryVersion`
- `properties`

Implement ADR registry version `1` exactly:

- `HAS_SUBSYSTEM -> has_part`, confidence `0.95`
- `PART_OF -> part_of`, confidence `1.00`
- `INTEGRATES_WITH -> related_to`, confidence `0.70`
- `DEPENDS_ON -> depends_on`, confidence `1.00`
- `BLOCKS_IMPLEMENTATION_OF -> blocks`, confidence `0.95`
- `REQUIRES_RESOLUTION_OF -> blocked_by`, confidence `0.95`
- `THREATENS_SUCCESS_OF -> risks`, confidence `0.85`
- `REFERENCES -> references`, confidence `1.00`
- `MENTIONS -> mentions`, confidence `0.85`
- `SUCCEEDED_BY -> succeeded_by`, confidence `1.00`
- `PREDECESSOR_OF -> predecessor_of`, confidence `1.00`
- `SUPERSEDES -> supersedes`, confidence `1.00`
- `SUPERSEDED_BY -> superseded_by`, confidence `1.00`

Unmapped relation types return `semanticRelationType: null`, `mappingConfidence: null`, `mappingSource: "unmapped"`, and the verbatim `sourceRelationType`.

## Facets

In Phase B, `facets.items` must remain empty because no persisted facet rows exist yet. The tool returns:

- `facets.items: []`
- `facets.hasMore: false`
- `facets.nextOffset: null`
- warning `PHASE_B_PROJECTED_FACETS_NOT_RETURNED` when matching projected facets exist and `includeFacets` is true.

Projected facets are advisory metadata only under `provenance.dryRunProjection.proposedFacets`. They must not appear as first-class facet items and must not use fake `facet_proj_*` ids.

`facetLimit`, `facetOffset`, and `facetTypeFilter` are accepted and validated for API compatibility, but they have no effect on `facets.items` until Phase C persists facets.

## Lifecycle

Phase B must not infer lifecycle from prose. It may surface lifecycle only from explicit projection or lifecycle assertion observations. If no explicit lifecycle exists, use `unknown`.

The ADR acceptance target requires `houston-blenders-orchestrator` to surface with `lifecycleStatus: "closed"`. Before implementation, verify whether a current `metadata.kind="lifecycle-assertion"` observation exists for `houston-blenders-orchestrator`. If it exists, Phase B must read it and surface `closed`.

If the assertion does not exist, do not infer `closed` from prose. Stop and request an explicit lifecycle assertion via `add_observations` before claiming the Houston worked example passes. That write is separate from Phase B implementation and requires user approval.

For groups without explicit lifecycle assertions:

- lifecycle remains `unknown`.
- `excludeLifecycleStatus: ["closed"]` must be tested with a fixture or existing lifecycle assertion, not by heuristic inference.

Implementation can proceed against fixture-backed lifecycle tests, but live Houston acceptance cannot be claimed until Tommy explicitly approves writing or confirms an existing lifecycle assertion.

## Acceptance Tests

Add focused contract tests in `tests/contract-neural-agent-workflow.test.ts` or a new Phase B contract file:

1. Tool is listed in `tools/list`.
2. `get_entity_context` is read-only by row-count snapshot across exactly these watched tables: `shared_memory`, `graph_lookup_keys`, `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, `neural_vec_index`, `shared_memory_vec`, and `neural_audit_log`.
3. Query for a duplicate canonical key with a confident dry-run projection returns `phase:"B"`, `identity.id:null`, observations, empty `facets.items`, `PHASE_B_NO_PERSISTED_IDENTITY`, projected facets only in `provenance.dryRunProjection.proposedFacets`, and `provenance.appliedDryRunReportHash` equal to the signed audit `content_hash`.
4. Ambiguous/low-confidence projection returns `resolution.candidates` and warning, not a silent best guess.
5. `hb-apdas` returns hard-split/manual-review warnings and candidates.
6. Exact canonical-name/alias lookup whose signed dry-run artifact only contains an unrelated projection group returns `EXACT_LOOKUP_PROJECTION_MISMATCH`, `NO_PROJECTION_MATCH`, and no `proposedIdentity`; this must hold both with `graph_lookup_keys` populated and when the no-index fallback scanner is used.
6. `observationKindFilter` narrows observations without lifecycle filtering.
7. `houston-blenders-orchestrator` surfaces `lifecycleStatus:"closed"` only when backed by an explicit lifecycle assertion; otherwise the test must fail with a missing-fixture/precondition error, not pass as `unknown`.
8. `excludeLifecycleStatus` surfaces `LIFECYCLE_EXCLUDED_CANDIDATES` using a test lifecycle assertion fixture.
9. Relation mapping exposes both source and semantic relation type, including `INTEGRATES_WITH -> related_to` at `0.70`, all ADR registry entries, and unmapped `mappingConfidence:null`.
10. Saved artifact hash mismatch is rejected.
11. Unsigned artifacts are rejected even when internally hash-consistent.
12. Caller-provided artifact/hash is accepted only when backed by a signed audit row.
13. Artifact tenant mismatch is rejected.
14. Cross-tenant fallback paths do not leak rows from another tenant.
15. Response includes ADR `tokenBudget` and `provenance.dedupedRedundantRepresentations`.

## Implementation Order

1. Add `get_entity_context` tool schema and docs generation.
2. Add MemoryManager helpers:
   - latest signed artifact resolver,
   - artifact loader/hash/audit/tenant verifier,
   - projection lookup map,
   - context assembly,
   - relation registry mapping.
3. Wire `_handleToolCall('get_entity_context')`.
4. Add tests with in-memory fixtures and one saved dry-run artifact fixture.
5. Run `npm run typecheck`, focused Vitest, `TMPDIR=/tmp npm run docs:check`, `npm run build`, and `git diff --check`.
6. Deploy only after reviewer sign-off and passing local checks.

## Non-Goals

- No Phase C writes.
- No identity/facet/link table population.
- No lifecycle inference from free text.
- No graph_lookup_keys mutation.
- No relation row rewriting.
- No fake projected ids.
