# Pass 2.0 Phase C Implementation Plan: Identity, Facet, And Link Writes

Status: production-enable gate patch in progress after successful guarded deploy and copied-DB rollback rehearsal. Production execution still requires the fresh exact-scope Tommy approval observation to be recorded and the gate patch to be reviewed/deployed before any live Phase C write run.

## Current Gates

Human authorization for Phase C write planning is recorded in Neural observation `eaa3bd13-7f16-46d2-b6e3-f7737957dc3b`.

Phase B is live-accepted and independently verified. The final live acceptance observation is `841d6281-e4a1-402b-89e0-28219be2f6d7`.

The Phase A signed dry-run artifact is `/app/data/pass2-dry-runs/pass2-dry-run-default-d76284fd30f7cecb.json`, canonical hash `d76284fd30f7cecb7a0483234e821903b3d3441aac689fef836c64adbd0b9336`, audit row `c036932d-652a-457e-9a1e-79a0ac52c112`.

This plan does not authorize live execution by itself. Production execution is allowed only when the tool validates an operator-controlled environment switch, an exact dry-run hash binding, operator-pinned evidence observation IDs, a fresh `production_execute_approval` observation for the exact dry-run hash and scope, required reviewer PASS observations, and recorded rollback rehearsal evidence for the same hash.

## Goal

Implement Phase C so the Phase A projections become durable identity-layer rows while preserving Phase B response shape and the legacy data boundary.

Phase C writes only to:

- `entity_identities`
- `entity_context_facets`
- `entity_lookup_identity_links`
- `neural_audit_log` with `operation='pass2_phase_c'` or `operation='pass2_rollback'`

Phase C never mutates `shared_memory`, `graph_lookup_keys`, sqlite-vec tables, or relation rows. Lineage remains legacy `shared_memory(memory_type='relation')` data.

## Scope

The production scope is the same 12 duplicate canonical-key groups and 52 source rows from the approved Phase A artifact.

Execution eligibility is narrower than artifact presence. A group is executable only when all of these are true:

- For the current signed production artifact, `classification='facet_of_identity'`, `proposedAction='facet_under_identity'`, and group `warnings=[]`.
- Every source row has mandatory row evidence properties. `metadataSource` remains mandatory as a property, but `null` is valid explicit evidence that the original source row lacked `metadata.source`; plan output should surface `PHASE_C_METADATA_SOURCE_NULL` as a note, not a skip reason.
- Every row has `rows[].proposedAction='facet_under_identity'`.
- The group has no warning requiring manual review, hard split, tenant mismatch defense, contradictory identity evidence, or ambiguous independent identity handling.
- The live canonical-form hash of the artifact matches the recorded `pass2_dry_run` audit `content_hash`.

`single_identity`/`preserve` groups are not executable for the current production artifact because singleton groups were not included. They become eligible only if a future signed artifact explicitly includes singleton groups and the reviewed Phase C plan is updated to cover them.

Groups that fail eligibility are skipped and reported as `manualReviewRequired`; Phase C must not silently choose a winner.

## Schema Work

Add idempotent schema creation to the database initialization path for exactly three tables:

- `entity_identities`
- `entity_context_facets`
- `entity_lookup_identity_links`

The DDL must match ADR lines 233-386:

- No foreign keys.
- No `PRAGMA foreign_keys` change.
- Prefixed ULIDs only: `ident_<26-char-ulid>`, `facet_<26-char-ulid>`, `ilink_<26-char-ulid>`.
- `tenant_id` defaults to `default`, and every read/write filters by tenant.
- `idx_entity_identities_active_canonical` enforces one active identity per `(tenant_id, canonical_key, entity_type)`.
- `idx_entity_identities_lifecycle`, `idx_entity_identities_status`, and `idx_entity_identities_audit` are created for lifecycle filtering, active-row filtering, and audit drilldown.
- `idx_facets_active_source_hash` enforces one active facet per `(tenant_id, source_row_id, content_hash)`.
- `idx_facets_identity`, `idx_facets_source_row`, `idx_facets_tenant_type`, `idx_facets_content_hash`, and `idx_facets_audit` are created for identity assembly, source-row validation, type filtering, content-hash checks, and audit drilldown.
- `idx_identity_lookup_links_active_identity` prevents duplicate active links to the same identity from the same lookup tuple.
- `idx_identity_lookup_links_one_resolved` prevents more than one active resolved identity for the same `(tenant_id, lookup_key, memory_type, memory_id)` tuple.
- `idx_identity_lookup_links_lookup`, `idx_identity_lookup_links_identity`, `idx_identity_lookup_links_source_row`, and `idx_identity_lookup_links_audit` are created for query resolution, identity-side assembly, stale-link detection, and rollback drilldown.

`CHECK` constraints must reject confidence values outside `0..1`.

## MCP Tool

Add a guarded MCP tool named `execute_pass2_phase_c`.

Inputs:

- `action`: required enum, one of `plan`, `execute`, `rollback`, `verify`.
- `tenantId`: optional, default `default`.
- `dryRunHash`: required for all actions except a purely diagnostic `plan`; production execution must use `d76284fd30f7cecb7a0483234e821903b3d3441aac689fef836c64adbd0b9336`.
- `dryRunArtifactPath`: optional; when `dryRunHash` is supplied, resolve by that exact signed hash rather than "latest". A latest signed artifact may be selected only for a diagnostic `plan` call without `dryRunHash`.
- `canonicalKeys`: optional allowlist for test or canary runs. Production all-groups execution omits this or supplies the full approved set.
- `approvalObservationId`: required for production `execute`. The current planning authorization `eaa3bd13-7f16-46d2-b6e3-f7737957dc3b` is explicitly insufficient for production execute. Production execute must require a fresh observation whose row creator is in `PHASE_C_TRUSTED_APPROVAL_AGENTS` and whose metadata has `kind:"production_execute_approval"`, `phase:"Phase C"`, `productionExecuteApproved:true`, `approvedBy` in `PHASE_C_TRUSTED_APPROVERS`, `action:"execute_pass2_phase_c"`, and the exact `dryRunHash`; optional `scopeHash` or `canonicalKeys` must match the requested scope.
- Operator switch and pinned evidence IDs: production execute also requires `PHASE_C_PRODUCTION_EXECUTE_ENABLED=true`, `PHASE_C_PRODUCTION_DRY_RUN_HASH=<exact approved hash>`, `PHASE_C_PRODUCTION_APPROVAL_OBSERVATION_ID=<approval observation id>`, `PHASE_C_ROLLBACK_REHEARSAL_OBSERVATION_ID=<rehearsal observation id>`, and `PHASE_C_REVIEWER_PASS_OBSERVATION_IDS=codex=<id>,claude-code=<id>` in the running server environment.
- Reviewer PASS: production execute also requires one operator-pinned `phase_c_reviewer_pass` observation for each reviewer in `PHASE_C_REQUIRED_REVIEWERS` (default `codex,claude-code`), with the row creator matching the claimed reviewer and bound to the exact dry-run hash/scope.
- Evidence attribution: reviewer PASS and approval observations must be written through `add_observations` with top-level `agentId` set to the intended row creator. The gate validates `shared_memory.created_by`, not only JSON metadata, so hand-editing `created_by` is not an approved production evidence path.
- `requireRollbackRehearsal`: boolean, default true for `execute`.
- `executionMode`: optional enum, one of `test`, `rehearsal`, `production`. Test writes require an in-memory DB. Rehearsal writes require an explicit non-production DB. Production writes require `executionMode:"production"` plus the approval and rollback-evidence gates.
- `ownerAuditId`: returned by `execute`; unique `pass2_phase_c` owner audit row id for a group or batch.
- `rollbackOwnerAuditId`: required for `rollback`; this is the unique owner audit id, not the owner `content_hash`.
- `deactivatedBy`: optional actor id for rollback, default `codex-desktop`.

Behavior:

- `plan` performs all validation and returns exact would-write counts, skipped groups, existing active rows, watched-table counts, non-blocking evidence notes such as `PHASE_C_METADATA_SOURCE_NULL`, and audit linkage without writing.
- `execute` performs the same validation, then writes in one transaction only for in-memory test databases, explicit non-production rehearsal databases, or the production DB when the operator switch, fresh approval, reviewer PASS, and rollback-evidence gates validate.
- `rollback` soft-deactivates identity, facet, and link rows from a Phase C batch in one transaction. The current implementation accepts rollback only in test or rehearsal contexts.
- `verify` checks that persisted rows match the dry-run artifact and owner audit rows. `get_entity_context` persisted-shape verification is covered by contract tests.

## Artifact And Audit Validation

Reuse the Phase B dry-run artifact loader and canonical hashing helper.

Before any write, Phase C must:

1. Parse the artifact.
2. Recompute canonical-form hash.
3. Verify the hash equals the caller `dryRunHash`.
4. Verify a tenant-matching `neural_audit_log(operation='pass2_dry_run')` row exists with `content_hash` equal to the canonical hash.
5. Verify the artifact has the three required layers: summary, group classification/signals, and per-row evidence.
6. Verify every duplicate-group source row has mandatory row evidence fields. `metadataSource:null` satisfies field presence and means the source row had no `metadata.source`.
7. Verify source row ids still exist in `shared_memory` with unchanged content hashes.
8. Snapshot row counts for watched tables before writes.

If any check fails, return a refusal with a machine-readable warning and write nothing.

## Write Algorithm

All execute writes happen inside a single SQLite transaction. The current implementation applies this algorithm only to in-memory test databases and explicit non-production rehearsal databases.

For each executable group:

1. Create or reuse one active identity for `(tenant_id, canonical_key, entity_type)`.
2. Use the artifact `proposedIdentity` and explicit lifecycle assertion data only; do not infer lifecycle from prose.
3. Insert one owner `pass2_phase_c` audit row for the group before domain rows. The owner row uses `content_hash=<dry-run canonical hash>`, `entity_name=<canonical_key>`, and `target_count=<identity + facets + links that will be active after this group>`.
4. Insert or reuse the identity row with `source_audit_id=<owner audit id>`, `resolution_status='inferred'` for ADR Houston-style confident projections, and group classification confidence.
5. For each eligible source row, insert or reuse one facet row with `source_row_id`, `content_hash` from the dry-run row evidence, `content_json` preserving source row content plus migration provenance, and `source_audit_id=<owner audit id>`.
6. Read existing `graph_lookup_keys` rows for each source row id and tenant. This is a read-only lookup tuple scan; Phase C remains a non-writer of `graph_lookup_keys`.
7. For each existing lookup tuple, insert or reuse one identity link with `identity_id`, `lookup_key`, `memory_type`, `memory_id`, `key_kind`, confidence derived from ADR key-kind/weight rules, `resolution_status='resolved'` for confident single-identity groups, and `source_audit_id=<owner audit id>`.
8. Insert one row-level `pass2_phase_c` audit row per newly created identity, facet, and link, with `content_hash` equal to the row content hash or link tuple hash. Row-level audit ids are not the `source_audit_id` on domain rows; the owner audit id is the domain-row rollback and drilldown handle. Row-level audit rows reference the owner audit id in `reason` and, where useful, in row provenance metadata.

Idempotency is mandatory. Re-running `execute` against the same dry-run hash after a completed batch must produce zero net active-row changes and no duplicate active audit/domain rows. Existing matching active rows are treated as verified, not rewritten.

Before inserting a new owner audit row, `execute` checks whether the expected active identity, facet, and link rows already exist with matching `source_audit_id`, dry-run hash provenance, tenant, canonical key, source row ids, content hashes, and lookup tuples. If every expected row already exists and matches, `execute` returns `status:'verified_noop'` and writes no new owner or row-level audit rows.

If an orphan owner audit row exists without the complete matching domain rows, or if active domain rows exist with mismatched `source_audit_id`, content hash, tenant, or identity id, `execute` refuses with `PHASE_C_PARTIAL_OR_MISMATCHED_PRIOR_ATTEMPT`. The operator must run an explicit reviewed rollback or cleanup plan before retrying.

## `get_entity_context` Changes

Update `get_entity_context` so Phase C persisted rows become the preferred path. The current implementation covers the high-confidence single active identity path and ambiguous multi-identity lookup reporting:

1. Query resolution first checks active `entity_lookup_identity_links` joined to `graph_lookup_keys` and `entity_identities`.
2. A single high-confidence resolved identity returns `phase:"C"`, persisted `identity.id`, active persisted facets, and `provenance.appliedDryRunReportHash:null`.
3. Multiple distinct matching identities return `AMBIGUOUS_LOOKUP` candidates.
4. Links below `0.5` remain candidates only.
5. Links from `0.5` to `<0.85` resolve only when exactly one active resolved link exists for the source-row tuple.
6. Deactivated identities, facets, and links are excluded.
7. If no persisted identity path matches, preserve the deployed Phase B projection fallback unchanged.

Phase C context still returns observations from legacy and materialized `shared_memory` rows. Observation filters, pagination, dedupe, lifecycle behavior, since filtering, `observationKindFilter`, and fallback rules must match the Phase B behavior except that the resolved identity id is persisted.

Relations still come from legacy `shared_memory(memory_type='relation')`; endpoint resolution may use active links when present but must not create or mutate relation rows.

## Rollback

Rollback is soft only. It must never delete Phase C rows.

Given a Phase C `rollbackOwnerAuditId`, rollback:

1. Finds active identities whose `source_audit_id` equals the owner audit id.
2. Deactivates those identities with `deactivated_at` and `deactivated_by`.
3. Deactivates all active facets whose `source_audit_id` equals the owner audit id or whose `identity_id` is one of the batch identities.
4. Deactivates all active links whose `source_audit_id` equals the owner audit id or whose `identity_id` is one of the batch identities.
5. Writes one `pass2_rollback` audit row with `target_count=<deactivated identity + facet + link rows>`.
6. Verifies active row counts for the three Phase C tables return to the pre-batch snapshot for that batch.
7. Leaves `shared_memory`, `graph_lookup_keys`, relations, and embeddings untouched.

Rollback rehearsal against a copy of production data is an execute gate. Production `execute` must refuse until rehearsal evidence and fresh production approval are recorded; the current write-tooling slice does not perform production writes.

## Verification

Add tests covering:

1. Table creation and exact partial unique indexes.
2. Confidence `CHECK` constraints.
3. `execute_pass2_phase_c(action:"plan")` writes nothing except no audit rows at all.
4. Execute refuses when the canonical-form hash drifts from the signed `pass2_dry_run` audit row.
5. Execute refuses when row evidence is incomplete.
6. Execute writes identities, facets, links, and `pass2_phase_c` audit rows for a fixture duplicate group.
7. Re-execute against the same hash produces zero net active-row changes.
8. Unique indexes prevent duplicate active identities, facets, and resolved links.
9. `replaceGraphLookupIndexForMemory()` does not delete identity-link rows.
10. `get_entity_context` returns Phase C persisted shape after execute and Phase B fallback after rollback.
11. Rollback deactivates identity, facet, and link rows together.
12. Watched tables `shared_memory`, `graph_lookup_keys`, sqlite-vec tables, and relation rows are unchanged by execute and rollback.
13. Cross-tenant queries cannot see another tenant's identity, facet, or link rows.
14. A stale `entity_lookup_identity_links` row whose `(lookup_key, memory_type, memory_id)` tuple no longer matches a `graph_lookup_keys` row produces an integrity warning in `get_entity_context`, not a hard failure.
15. Post-Phase-C execute, `get_entity_context({ query:"houston-blenders-orchestrator" })` returns `phase:"C"`, a populated `identity.id`, exactly 19 active facets in `facets.items[]`, `lifecycleStatus:"closed"`, `provenance.appliedDryRunReportHash:null`, and any stored `SUCCEEDED_BY` relation mapped to `semanticRelationType:"succeeded_by"`.

Run before review:

- focused Vitest for Phase C contracts
- full `tests/contract-neural-agent-workflow.test.ts`
- `npm run typecheck`
- `TMPDIR=/tmp npm run docs:check`
- `npm run build`
- `git diff --check`

Run before production execute:

- `execute_pass2_phase_c(action:"plan", dryRunHash:<approved hash>)`
- rollback rehearsal against a copied production database
- agent review of plan output
- fresh explicit Tommy execute approval

## Deployment Sequence

1. Implement schema and helper functions.
2. Implement tool in plan mode only, with tests. Completed.
3. Submit plan-mode output to reviewers. Completed for the metadataSource-null gate.
4. Implement execute, verify, and rollback modes behind explicit test/rehearsal gates.
5. Run local verification for the non-production write-tooling slice.
6. Rebuild and deploy.
7. Verify `/api/tools` exposes the new tool.
8. Run live `plan` only against the approved hash.
9. Send live plan output to `codex` and `claude-code`.
10. Set the operator-controlled server environment switch for the exact approved hash, then deploy and verify a pre-approval production `plan` still reports the missing approval/reviewer gates.
11. Record fresh exact-scope Tommy production approval as a trusted `production_execute_approval` observation only when Tommy explicitly authorizes the live production write.
12. Record required reviewer PASS observations for the final gated plan.
13. Run production `plan` with that `approvalObservationId`; `productionExecuteEnabled` must be `true` and `productionGate.enabled` must be `true`.
14. After Tommy confirms that final gated plan, run production `execute`.
15. Immediately run `verify` and `get_entity_context` for `houston-blenders-orchestrator`.
16. After execute and verify complete, preserve rollback instructions and owner audit id in Neural observations as a separate operational documentation step. This `add_observations` call is outside `execute_pass2_phase_c`, not part of execute or rollback, and is not counted as a Phase C migration write.

## Non-Goals

- No deletion from Phase C tables.
- No mutation of legacy source rows.
- No mutation of `graph_lookup_keys`.
- No relation rewrite or lineage auto-creation.
- No lifecycle inference from prose.
- No silent execution of manual-review or ambiguous groups.
- No production execute in the same step as this plan review.
