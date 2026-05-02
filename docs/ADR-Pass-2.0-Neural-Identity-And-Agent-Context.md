# ADR: Pass 2.0 Neural Identity And Agent Context

Status: Draft for agent review

Date: 2026-04-30

Owners: Tomas, codex-desktop, claude-desktop

Related Neural entity: `neural-ai-collaboration`

Canonical Pass 1.x state observation: `c5b2daaa-63ee-4db0-8e7a-859171944378`

## Context

The Neural system currently stores graph data primarily in `shared_memory` rows with `memory_type` values such as `entity`, `observation`, and `relation`. Pass 0 through Pass 1.2 improved exact lookup performance and agent-facing retrieval behavior without changing the underlying identity model.

Those passes exposed a deeper architectural issue. `entity` rows are doing too many jobs at once: they act as identity records, lookup records, bootstrap context, and sometimes context shards. This makes it hard for agents to answer the user workflow, "read entity X and its latest observations," without either missing context or receiving duplicated prose.

The live database inspection on 2026-04-29 found 920 entity rows, 879 unique normalized canonical keys, 12 duplicate canonical-key groups, and 52 entity rows inside those duplicate groups. The largest example is `houston-blenders-orchestrator`, which has 19 `entity` rows with the same canonical key, same type, and same timestamp. This looks like intentional context sharding, not a simple accidental duplicate.

Pass 2.0 is therefore not a cleanup script. It is an identity and context architecture pass.

## Lessons From Pass 1.x

`canonicalEntityKey` is a lookup key, not an identity key. It is useful for resolving human-entered names and aliases, but it is not globally unique.

Inline observations from `create_entities` must be materialized as real observation rows for deterministic agent retrieval, but the legacy embedded `entity.content.observations[]` field must remain readable during transition.

Exact indexed lookup is a successful pattern and should remain fast. The `graph_lookup_keys` path is now critical infrastructure for agent workflows.

Search and context assembly are different products. `search_entities` should remain a search surface; it should not become the full agent context API.

MCP tool schema changes can be stale in existing agent sessions after a server rebuild. Deployment notes must tell agents to refresh/reconnect before relying on newly listed parameters.

Historical backfill must be explicit, dry-run first, tenant-scoped, reviewable, and reversible. Startup mutation is forbidden.

## Decision Summary

Pass 2.0 introduces a new identity layer centered on stable surrogate identity ids (prefixed ULIDs, see §Decisions). It does not use `canonicalEntityKey` as identity.

The phase order is **read-only first, writes last**. Phase A is read-only inventory + dry-run; Phase B is read-only `get_entity_context` over legacy rows + projections; Phase C is the first phase that writes identity, facet, and lookup-identity link rows. Phases D and E follow.

Duplicate canonical-key groups are classified by a multi-signal confidence score (no single rule, including the 60-second clustering rule, is principal). The default classification is `unknown`, and the default action is preserve.

Lifecycle is a first-class, ORTHOGONAL field on identities. Closed projects are NOT filtered by default; agents must opt out explicitly via `excludeLifecycleStatus`.

Decisions, handoffs, corrections, facts, notes, design-principles, lessons-learned, and audit-findings remain observation rows distinguished by `metadata.kind` (controlled vocabulary, see §Controlled Observation Kinds), not new `memory_type` values.

Soft rollback is the default. Hard delete only occurs in an explicit `pass2_cleanup` operation (recorded in `neural_audit_log`) with its own dry-run + reviewer sign-off.

`read_graph` remains a legacy dump. `search_entities` remains search. A new read-only tool `get_entity_context` assembles identity, observations, relations, facets, resolution, lifecycle, warnings, and provenance.

Pass 2.0 uses the locked A2.1 schema: exactly three new tables (`entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`), no SQLite foreign-key pragma change, no identity columns added to generated `graph_lookup_keys`, relations preserved in `shared_memory(memory_type='relation')`, and migration audit recorded through `neural_audit_log`.

## Alternatives Considered

The core architectural question for Pass 2.0 is: **how much new schema does the identity layer actually need?** A code review on 2026-04-30 surfaced that several proposed tables duplicate existing infrastructure. Four alternatives were evaluated.

### A1: 7-Table Companion Layer (Original Proposal — Rejected)

Add `entity_identities`, `entity_aliases`, `entity_context_facets`, `entity_observation_links`, `relation_identity_edges`, `migration_batches`, `migration_batch_items`. Declare FOREIGN KEY constraints. Enable `PRAGMA foreign_keys = ON` system-wide.

**Rationale:** crisp schema where every column carries a single meaning, easy to query for analysis dashboards, static analysis can verify referential integrity, separation of concerns between lookup and identity.

**Costs surfaced by code review:**

Five of the seven tables duplicate existing infrastructure (see comparison below).

`PRAGMA foreign_keys = ON` is a connection-wide change; it affects every query against every table, not just Pass 2.0 ones. The existing schema declares exactly one FOREIGN KEY today (`tasks.parent_task_id REFERENCES tasks(id)`), so the population of latent dangling references in the rest of the schema is unknown. A pragma flip without a soak plan is a known production risk.

New parallel write paths require dual-write logic for the duration of the transition. `create_relations` would have to write to both `shared_memory(memory_type='relation')` and `relation_identity_edges`. Reads have to know to merge or prefer one or the other.

Existing relation vocabulary in live data is freeform UPPER_SNAKE_CASE (`HAS_SUBSYSTEM`, `INTEGRATES_WITH`, `BLOCKS_IMPLEMENTATION_OF`, `THREATENS_SUCCESS_OF`, `REQUIRES_RESOLUTION_OF`, `PART_OF`, `INTEGRATES_WITH`). Forcing a controlled vocabulary onto `relation_identity_edges.relation_type` either re-categorizes existing rows (lossy and judgment-laden) or accepts both styles (defeats the constraint).

### A2: 2-Table Minimal Layer (Original — Now Invalid)

The original A2 proposal extended `graph_lookup_keys` with two new nullable columns (`identity_id`, `last_verified_at`), reusing it as both lookup index and identity-binding store.

**This proposal is invalid.** Code review against `src/unified-server/memory/index.ts:3360` showed `replaceGraphLookupIndexForMemory()` does `DELETE FROM graph_lookup_keys WHERE tenant_id=? AND memory_id=?` then re-inserts generated rows. Any durable identity assertion stored as a column on `graph_lookup_keys` would be wiped on every reindex. The lookup index and the identity-assertion store are different facts with different lifecycles and must not share a row.

A2 is preserved here for record only. The chosen direction is A2.1 below. The original A2 schema (extending `graph_lookup_keys`) is dropped.

### A2.1: 3-Table Minimal Layer (Locked Direction — Both Reviewers Concurred)

A2.1 adds only the three tables that have no safe equivalent in the existing schema: `entity_identities`, `entity_context_facets`, and `entity_lookup_identity_links`. The executable DDL, constraints, indexes, and rollback fields are specified once in §Minimal Schema (A2.1 Locked). This Alternatives section is rationale only; it intentionally avoids carrying a second schema copy.

Ownership boundary: `graph_lookup_keys` answers *"what lookup strings point at this source row?"* and is regenerated freely. `entity_lookup_identity_links` answers *"what stable identity did we resolve this source-row lookup to, at what confidence, by what audit batch?"* and is durable. The two facts have different lifecycles and different owners (the lookup indexer vs the identity resolver). They are joined at read time, not merged into one row.

`entity_identities` upserts via `ON CONFLICT(tenant_id, canonical_key, entity_type) WHERE status='active' DO UPDATE SET …`, mirroring the `agent_registrations` pattern (`PRIMARY KEY (agent_id, tenant_id) … ON CONFLICT DO UPDATE`).

Phase A and Phase C normalize missing source entity types to `'unknown'` before insert or upsert. `entity_type` is non-null so SQLite's `UNIQUE` index and upsert semantics cannot create multiple active `(tenant_id, canonical_key, NULL)` identities.

Soft-deactivation via `status='active'/'deactivated'` plus `WHERE status='active'` on the partial unique index, mirroring the `session_handoffs` pattern (`UNIQUE INDEX idx_session_handoffs_active ON session_handoffs(project_id) WHERE active = 1`).

Identity supersession via `superseded_by` pointer plus `status='superseded'`, mirroring the `agent_identity_changes` pattern that already logs `previous_agent_id → updated_agent_id` transitions.

`key_kind` on `entity_lookup_identity_links` is a denormalized snapshot only. It is captured at link-creation time for inspection and for explaining classification provenance. The lookup indexer can regenerate `graph_lookup_keys` rows with different `key_kind` values; the link's snapshot does not become invalid, but it is no longer authoritative. Resolution is anchored on `(tenant_id, lookup_key, memory_type, memory_id)` and `last_verified_at`, not on stale `key_kind`.

**Reuse existing infrastructure for everything else:**

**Aliases:** existing `graph_lookup_keys` is preserved unchanged as the lookup index. The `key_kind` taxonomy (`canonical_name`, `alias`, `entity_name`, `applies_to`, `embedded_observation_handle`, `agent_bootstrap_handle`, `derived`, `metadata_applies_to`, `relation_from`, `relation_to`, `canonical_fact_handle`) and the `weight` precedence (canonical_name=100, alias=95, entity_name=95, applies_to=85, embedded_observation_handle=70, agent_bootstrap_handle=65, derived=50) remain authoritative for lookup. Resolution to identity is performed by joining `graph_lookup_keys` with `entity_lookup_identity_links` on `(tenant_id, lookup_key, memory_type, memory_id)`. Reindex never wipes identity assertions.

**Observation links:** existing `graph_lookup_keys` rows of `key_kind='entity_name'` (~41,761 rows in live data) plus `metadata.entityName` on observation rows already implement the link from observation to entity. Identity-aware observation queries join through `entity_lookup_identity_links` for the rows where Phase C has populated identity bindings. No `entity_observation_links` table required.

**Relations:** keep `shared_memory.memory_type='relation'` rows unchanged. Endpoint resolution to identity ids happens at read time inside `get_entity_context` via:

```sql
-- pseudocode
SELECT rel.*,
       il_from.identity_id AS from_identity_id,
       il_from.confidence  AS from_confidence,
       il_to.identity_id   AS to_identity_id,
       il_to.confidence    AS to_confidence
FROM shared_memory rel
LEFT JOIN graph_lookup_keys gl_from
  ON gl_from.tenant_id = rel.tenant_id
 AND gl_from.lookup_key = normalize(rel.content->>'$.from')
 AND gl_from.memory_type = 'entity'
LEFT JOIN entity_lookup_identity_links il_from
  ON il_from.tenant_id = gl_from.tenant_id
 AND il_from.lookup_key = gl_from.lookup_key
 AND il_from.memory_type = gl_from.memory_type
 AND il_from.memory_id = gl_from.memory_id
 AND il_from.status='active'
 AND il_from.resolution_status='resolved'
LEFT JOIN graph_lookup_keys gl_to
  ON gl_to.tenant_id = rel.tenant_id
 AND gl_to.lookup_key = normalize(rel.content->>'$.to')
 AND gl_to.memory_type = 'entity'
LEFT JOIN entity_lookup_identity_links il_to
  ON il_to.tenant_id = gl_to.tenant_id
 AND il_to.lookup_key = gl_to.lookup_key
 AND il_to.memory_type = gl_to.memory_type
 AND il_to.memory_id = gl_to.memory_id
 AND il_to.status='active'
 AND il_to.resolution_status='resolved'
WHERE rel.memory_type='relation' AND rel.tenant_id=?
```

Existing freeform `relationType` strings (`HAS_SUBSYSTEM`, `INTEGRATES_WITH`, etc.) are preserved unchanged. The controlled vocabulary becomes a code/config registry that surfaces both `sourceRelationType` (original, unchanged) and `semanticRelationType` (mapped, e.g. `HAS_SUBSYSTEM → has_part`) plus `mappingConfidence`, `mappingSource`, and `registryVersion` in `get_entity_context`. See §Controlled Relation Vocabulary for the registry shape and the migration path to a future per-tenant overlay table.

**Migration log:** reuse `neural_audit_log` for batch tracking. Each Phase A dry-run produces one row with `operation='pass2_dry_run'`, `actor_type='migration'`, `content_hash=<sha256 of dry-run JSON>`, `target_count=<row count>`, `reason=<short summary>`. Each Phase C execute produces one row per affected identity/facet/link with `operation='pass2_phase_c'`, `entity_name=<canonical_key>`, `content_hash=<facet content hash or identity record hash or link tuple hash>`. Rollback is performed by setting `status='deactivated'` on identity, facet, **AND link** rows (per codex: deactivating only identities/facets while leaving links active causes dead identities to surface in lookups), and writing one `neural_audit_log` row with `operation='pass2_rollback'`, `reason=<batch reference>`. The dry-run JSON itself lives on disk; its hash binds the audit log row to the artifact.

**Rationale:** matches every existing convention in the codebase (companion tables, partial-index soft-active, audit log for write history, ON CONFLICT upsert), no system-wide pragma change, no parallel write paths, no controlled-vocabulary fight with existing data, no durable state in regenerated index tables.

**Costs:**

`entity_context_facets.identity_id` and `entity_lookup_identity_links.identity_id` have no enforced FK to `entity_identities.identity_id`. Orphans become possible if migration code is buggy. Mitigated by acceptance tests, by `neural_audit_log` traceability, and by an explicit verification path (see §Acceptance Tests).

Identity-aware queries over relations require a two-table join through `graph_lookup_keys` and `entity_lookup_identity_links` rather than a direct lookup in a dedicated edge table. For `get_entity_context` this is two extra joins per relation endpoint; given typical agent context queries (tens of relations max) the cost is small. Performance budgets (see §Performance Budgets, future addition) will cap candidate fanout and relation traversal so the join cost is bounded.

### A3: Pure Read-Time Assembly (Rejected)

Add zero tables. Compute identity, aliases, facets, and relation resolution at every `get_entity_context` call from `shared_memory` + `graph_lookup_keys` + classification heuristics. Cache aggressively at the response layer.

**Rejected because:**

`identity_id` is non-stable across calls (recomputed each time), so agents cannot bookmark or persist references to identities. This breaks the core Pass 2.0 promise of a stable identity surrogate.

Cleanup of duplicate canonical keys never happens; the system papers over them on every read forever. The 12 dup canonical-key groups remain technical debt indefinitely.

There is no place to record an explicit human or agent decision that overrides heuristic classification (e.g. "no, `hb-apdas` and `hb_apdas` are `independent_identity`, do not merge"). All classification is heuristic forever.

Lifecycle (closed/active/etc.) cannot be asserted; it would have to be heuristically derived from the source row, which means closed-projects-are-first-class-knowledge (§Decisions D3) loses its anchor.

A3 is documented here for completeness only.

### Side-By-Side Comparison

| Dimension | A1: 7-Table Companion | A2: 2-Table (extends graph_lookup_keys) | A2.1: 3-Table (locked) |
|---|---|---|---|
| New database tables | 7 | 2 | 3 |
| Tables duplicating existing infra | 5 (`entity_aliases`/`entity_observation_links`/`relation_identity_edges`/`migration_batches`/`migration_batch_items`) | 0 | 0 |
| Mutates regenerated index table | no | **YES — fatal** (`graph_lookup_keys` is wiped on reindex) | no |
| `PRAGMA foreign_keys` change required | yes (system-wide) | no | no |
| Declared FK constraints on Pass 2.0 tables | yes | no | no (matches existing convention) |
| Parallel write paths during transition | yes (relations dual-write) | no | no |
| Forces controlled relation vocabulary | yes | no | no (registry-based; preserves UPPER_SNAKE_CASE corpus) |
| Active-resolved-link uniqueness enforced | n/a | n/a | **yes** (codex's stricter rule: at most one active resolved link per source-row tuple) |
| Soft-rollback mechanism | new `status='deactivated'` × 5 tables | partial-index × 2 tables | partial-index × 3 tables (matches `session_handoffs` pattern) |
| Migration batch audit trail | new `migration_batches`+`migration_batch_items` | reuse `neural_audit_log` | reuse `neural_audit_log` |
| Schema crispness for analysis dashboards | high | medium | medium-high (link table is dedicated; lookup index is unchanged) |
| Query patterns for `get_entity_context` | direct lookups in dedicated tables | one join through `graph_lookup_keys` | one join from `graph_lookup_keys` to `entity_lookup_identity_links` (additional, but unaffected by reindex) |
| Identity stability across calls | yes | yes | yes |
| Identity stability across reindex | yes | **NO — wiped** | yes |
| Embedding regeneration risk on Phase D | unchanged | unchanged | unchanged |
| `read_graph` legacy shape impact | Pass 2.0 tables invisible | same | same |
| Lines of new migration/DDL code (rough) | ~1500–2000 | ~400–600 | ~600–800 |
| Risk from latent FK orphan-on-pragma | high (system-wide PRAGMA) | none | none |
| Conformity with existing companion-table pattern (`agent_registrations`/`agent_identity_changes`/`session_handoffs`) | partial | full but invalid | full |
| Reversibility | medium | high (but invalid in practice) | high (three new tables isolated; rollback deactivates rows, untouched lookup index remains) |

### Decision: A2.1 Locked

Both round-2 reviewers (codex-desktop, codex) independently concurred on A2.1. Round-2 review was scoped to codex, codex-desktop, and claude-code per Tommy's directive.

A1 is rejected for Pass 2.0. If FK enforcement at the database layer becomes a future requirement, it is a separate ADR with its own soak plan that audits every existing table for latent orphan references before enabling `PRAGMA foreign_keys = ON` system-wide. That work is not part of Pass 2.0.

A2 is rejected as invalid. Putting durable identity state on `graph_lookup_keys` would be wiped on every `replaceGraphLookupIndexForMemory()` call (verified at `src/unified-server/memory/index.ts:3360`).

A3 is rejected on identity stability and lifecycle assertion grounds.

A2.1 is the locked direction. The §Proposed Tables section is replaced by §Minimal Schema below, which captures the three tables (`entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`) plus codex's stricter resolved-link uniqueness rule and the additional indexes for source-row cleanup and audit drilldown. §Decisions D1–D6 are unchanged. §Decisions D7–D10 are added below for the round-2 closures. §Controlled Relation Vocabulary is replaced by a code/config registry that surfaces both `sourceRelationType` and `semanticRelationType` in `get_entity_context` while preserving the existing UPPER_SNAKE_CASE corpus unchanged.

## Identity Model

### Core Invariants

`identity_id` is the stable identity.

`canonicalEntityKey` is a lookup key. Multiple identities may share a canonical key during ambiguity or migration.

Aliases map query text to one or more identities. Alias mappings can be ambiguous.

Context belongs to an identity when the system can resolve it safely. Context that cannot be resolved safely remains attached to its source row and appears in warnings or candidate sections.

Entity row UUIDs from `shared_memory.id` remain source row ids. They are not automatically identity ids.

### Entity Id Decision

Pass 2.0 should use new surrogate identity ids instead of picking one existing row UUID as the winner.

Rationale:

Using an existing row UUID makes one shard the "real" entity and demotes the others. That bakes migration heuristics into identity.

Using `canonicalEntityKey` or a derived key repeats the mistake found in Pass 1.x.

A new surrogate identity id allows existing rows to be preserved as source rows, facets, or unresolved candidates while the identity layer evolves independently.

## Minimal Schema (A2.1 Locked)

The locked schema introduces three companion tables. No FOREIGN KEY constraints are declared (matches existing convention; only `tasks.parent_task_id` declares a FK in the live schema). No `PRAGMA foreign_keys` change is required. Soft-deactivation is enforced via partial unique indexes (matches `session_handoffs`). Migration audit lives in the existing `neural_audit_log` (matches `auditLog()` usage everywhere).

All identity-layer IDs use prefixed ULIDs (§Decisions D1): `ident_<26-char-ulid>`, `facet_<26-char-ulid>`, `ilink_<26-char-ulid>`. `tenant_id` defaults to `'default'` when not supplied (§Tenant Scoping). Every read and write filters by `tenant_id`.

### Table 1: `entity_identities`

The stable identity surrogate. One row per resolved identity per `(tenant_id, canonical_key, entity_type)`. Lifecycle is orthogonal to row status (§Decisions D3).

```sql
entity_identities(
  identity_id          TEXT PRIMARY KEY,                 -- ident_<26-char-ulid>
  tenant_id            TEXT NOT NULL DEFAULT 'default',
  display_name         TEXT NOT NULL,
  canonical_key        TEXT NOT NULL,                    -- normalized lookup key, NOT identity
  entity_type          TEXT NOT NULL DEFAULT 'unknown',
  lifecycle_status     TEXT NOT NULL DEFAULT 'unknown',
                                                          -- active | maintenance | closed | superseded | paused | unknown
                                                          -- ORTHOGONAL to status; NEVER filtered by default in get_entity_context
  status               TEXT NOT NULL DEFAULT 'active',    -- active | deactivated | superseded
  resolution_status    TEXT NOT NULL DEFAULT 'unresolved',
                                                          -- resolved | inferred | unresolved
  confidence           REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_audit_id      TEXT,                              -- references neural_audit_log(id); MANDATORY-by-code-path for migration-created rows
  superseded_by        TEXT,                              -- identity_id pointer when status='superseded'
  created_by           TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  last_verified_at     TEXT,
  deactivated_at       TEXT,
  deactivated_by       TEXT,
  metadata_json        TEXT
);

-- Active-identity uniqueness per (tenant, canonical_key, entity_type).
-- Multiple historic identities may share a canonical_key, but only one may be active at a time.
CREATE UNIQUE INDEX idx_entity_identities_active_canonical
  ON entity_identities(tenant_id, canonical_key, entity_type)
  WHERE status='active';

CREATE INDEX idx_entity_identities_lifecycle  ON entity_identities(tenant_id, lifecycle_status);
CREATE INDEX idx_entity_identities_status     ON entity_identities(status);
CREATE INDEX idx_entity_identities_audit      ON entity_identities(tenant_id, source_audit_id);
```

Upsert pattern (mirrors `agent_registrations`):

```sql
INSERT INTO entity_identities (...)
VALUES (...)
ON CONFLICT(tenant_id, canonical_key, entity_type) WHERE status='active'
DO UPDATE SET
  display_name = excluded.display_name,
  updated_at   = excluded.updated_at,
  last_verified_at = excluded.last_verified_at,
  ...;
```

Missing source entity types MUST be normalized to `'unknown'` before insert or upsert. This keeps `idx_entity_identities_active_canonical` and the `ON CONFLICT` clause effective in SQLite, where nullable columns in a `UNIQUE` index do not collide.

Supersession (mirrors `agent_identity_changes` log pattern): when a new identity replaces an old one, write a `neural_audit_log` row with `operation='pass2_supersede'`, set the old identity's `status='superseded'` and `superseded_by=<new_identity_id>`, and create the new identity row. The lookup index regenerates against the new identity automatically because the unique constraint scopes to `WHERE status='active'`.

### Table 2: `entity_context_facets`

Promotes opaque `shared_memory.content` blobs into structured, queryable facets. One row per `(tenant_id, source_row_id, content_hash)` while active. Source row is preserved unchanged.

```sql
entity_context_facets(
  facet_id             TEXT PRIMARY KEY,                 -- facet_<26-char-ulid>
  tenant_id            TEXT NOT NULL DEFAULT 'default',
  identity_id          TEXT,                              -- nullable until linked
  source_row_id        TEXT NOT NULL,                     -- shared_memory.id
  facet_type           TEXT NOT NULL,                     -- project_identity | tech_stack | tests | ops | ...
  title                TEXT,
  content_hash         TEXT NOT NULL,                     -- sha256 of canonicalized content_json
  content_json         TEXT NOT NULL,
  confidence           REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status               TEXT NOT NULL DEFAULT 'active',    -- active | deactivated
  source_audit_id      TEXT,                              -- references neural_audit_log(id)
  provenance_json      TEXT,
  created_at           TEXT NOT NULL,
  deactivated_at       TEXT,
  deactivated_by       TEXT
);

-- Active facet uniqueness: at most one active facet per (tenant, source_row, content_hash).
CREATE UNIQUE INDEX idx_facets_active_source_hash
  ON entity_context_facets(tenant_id, source_row_id, content_hash)
  WHERE status='active';

CREATE INDEX idx_facets_identity      ON entity_context_facets(identity_id);
CREATE INDEX idx_facets_source_row    ON entity_context_facets(source_row_id);
CREATE INDEX idx_facets_tenant_type   ON entity_context_facets(tenant_id, facet_type);
CREATE INDEX idx_facets_content_hash  ON entity_context_facets(content_hash);
CREATE INDEX idx_facets_audit         ON entity_context_facets(tenant_id, source_audit_id);
```

### Table 3: `entity_lookup_identity_links`

The companion identity-link store that decouples durable identity assertions from the regenerated `graph_lookup_keys` index. Without this table, identity bindings would be wiped on every reindex (verified at `src/unified-server/memory/index.ts:3360`).

Ownership boundary: `graph_lookup_keys` owns *"what lookup strings point at this source row?"* and is regenerated freely. `entity_lookup_identity_links` owns *"what stable identity did we resolve this lookup to, at what confidence, by what audit batch?"* and is durable.

```sql
entity_lookup_identity_links(
  link_id              TEXT PRIMARY KEY,                 -- ilink_<26-char-ulid>
  tenant_id            TEXT NOT NULL DEFAULT 'default',
  lookup_key           TEXT NOT NULL,                     -- matches graph_lookup_keys.lookup_key
  memory_type          TEXT NOT NULL,                     -- entity | observation | relation
  memory_id            TEXT NOT NULL,                     -- shared_memory.id
  key_kind             TEXT,                              -- DENORMALIZED snapshot only; not source of truth
  identity_id          TEXT NOT NULL,
  resolution_status    TEXT NOT NULL DEFAULT 'resolved',
                                                          -- resolved | candidate | ambiguous
  confidence           REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status               TEXT NOT NULL DEFAULT 'active',    -- active | deactivated
  source_audit_id      TEXT,                              -- references neural_audit_log(id); MANDATORY-by-code-path for migration-created rows
  created_by           TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  last_verified_at     TEXT,
  deactivated_at       TEXT,
  deactivated_by       TEXT
);

-- Codex-desktop's necessary uniqueness: no duplicate active link to same identity from same source-row tuple.
CREATE UNIQUE INDEX idx_identity_lookup_links_active_identity
  ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, memory_id, identity_id)
  WHERE status='active';

-- Codex's stricter rule: at most ONE active resolved link per source-row tuple.
-- Multiple candidates allowed only with resolution_status IN ('candidate','ambiguous').
-- Multi-home semantics later require an explicit new resolution_status, not an accidental constraint gap.
CREATE UNIQUE INDEX idx_identity_lookup_links_one_resolved
  ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, memory_id)
  WHERE status='active' AND resolution_status='resolved';

-- Lookup-side query path (resolve a query → identity).
CREATE INDEX idx_identity_lookup_links_lookup
  ON entity_lookup_identity_links(tenant_id, lookup_key, memory_type, status);

-- Identity-side query path (find all source rows linked to identity).
CREATE INDEX idx_identity_lookup_links_identity
  ON entity_lookup_identity_links(tenant_id, identity_id, status);

-- Source-row cleanup / revalidation path (deactivate stale links when source row changes).
CREATE INDEX idx_identity_lookup_links_source_row
  ON entity_lookup_identity_links(tenant_id, memory_type, memory_id, status);

-- Audit drilldown / batch rollback path.
CREATE INDEX idx_identity_lookup_links_audit
  ON entity_lookup_identity_links(tenant_id, source_audit_id);
```

`key_kind` on `entity_lookup_identity_links` is a denormalized snapshot captured at link-creation time. The lookup indexer can regenerate `graph_lookup_keys` rows with different `key_kind` values; the link's snapshot is no longer authoritative but does not become invalid. Resolution is anchored on `(tenant_id, lookup_key, memory_type, memory_id)` plus `last_verified_at`, not on stale `key_kind`.

### Audit Trail (Reuse `neural_audit_log`)

No `migration_batches` table. No `migration_batch_items` table. The existing `neural_audit_log` schema already carries everything needed:

```sql
-- Existing schema in src/unified-server/memory/index.ts:338
neural_audit_log(
  id              TEXT PRIMARY KEY,
  operation       TEXT NOT NULL,        -- pass2_dry_run | pass2_phase_c | pass2_supersede | pass2_rollback | ...
  agent_id        TEXT NOT NULL,
  entity_name     TEXT,                 -- canonical_key for migration ops
  content_hash    TEXT NOT NULL,        -- sha256 of dry-run JSON or affected row content
  flagged         INTEGER NOT NULL DEFAULT 0,
  flag_reason     TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  -- Pass 1.x added columns:
  tenant_id       TEXT DEFAULT 'default',
  actor_type      TEXT,                 -- 'migration' | 'agent' | 'human'
  actor_id        TEXT,
  target_count    INTEGER,
  reason          TEXT
);
```

Migration semantics:

`pass2_dry_run` — one row per dry-run execution. `content_hash` = sha256 of the dry-run JSON artifact (the canonical-form sha256, not including ephemeral fields). `target_count` = number of rows analyzed. `reason` = short human-readable summary. The dry-run JSON itself is stored on disk; its sha256 binds the audit row to the artifact.

`pass2_phase_c` — one row per affected identity, facet, or link. `entity_name` = the canonical key. `content_hash` = sha256 of the row's content (identity row, facet content, or link tuple). `actor_type='migration'`, `actor_id` = migration agent identifier.

`pass2_supersede` — one row when an identity is superseded by another. `entity_name` = old canonical key. `reason` references the new identity_id.

`pass2_rollback` — one row per rolled-back batch. `reason` references the parent batch's content_hash.

Rollback rule: setting `status='deactivated'` on identity, facet, **and link** rows is mandatory. Codex flagged that deactivating only identities/facets while leaving links active would surface dead identities in lookups. Phase C rollback must touch all three tables.

### Hard Rules

No code path may issue `DELETE FROM` against `entity_identities`, `entity_context_facets`, or `entity_lookup_identity_links` outside of an explicit cleanup batch (operation='pass2_cleanup') with its own dry-run + reviewer sign-off.

Migration-created rows in all three tables MUST set `source_audit_id` (mandatory-by-code-path; the column is nullable for manual/dev cases only).

`shared_memory`, `graph_lookup_keys`, and the sqlite-vec embedding tables are NEVER mutated by Phase C. Pass 2.0 tables are additive and isolated; rolling them back leaves the lookup index untouched.

**Tenant scoping:** see §Tenant Scoping below. Every read filters by `tenant_id`. Cross-tenant alias collisions are not collisions.

## Classification Model

Duplicate canonical-key groups must be classified before any identity/facet writes occur.

### Allowed Classifications

`same_identity`: rows describe the same entity and can attach to one identity.

`facet_of_identity`: rows are intentional context slices under one identity.

`shard_context_chunk`: rows are context chunks that should become facets or observations under one identity.

`conflict`: rows use the same lookup key but contain contradictory identity facts.

`independent_identity`: rows share a name but represent different things.

`unknown`: no safe classification.

The default classification is `unknown`. The default action for `unknown` is preserve and surface for manual review.

### Multi-Signal Confidence

Classification is the output of a confidence score over multiple weak signals, never a single rule. No single signal — including the 60-second timestamp clustering — is principal. The dry-run report must record each signal score per row group.

Signals (weights are tuned during Phase A against real data, not pre-committed):

| Signal | Increases confidence in |
|---|---|
| `same_canonical_key` | (precondition for the group existing) |
| `same_entity_type` | `same_identity` / `facet_of_identity` |
| `same_addedBy` (creator agent) | `facet_of_identity` (single agent shard burst) |
| `created_at_within_seconds(N)` | `facet_of_identity` (one transaction window) |
| `same_metadata_source` (e.g. all `create_entities_inline`) | `facet_of_identity` |
| `content_shape_similarity` (matching field set, not values) | `facet_of_identity` |
| `semantic_observation_similarity` (vector cosine over inline obs) | `same_identity` / `facet_of_identity` |
| `differing_entity_type` | `independent_identity` |
| `differing_addedBy` with wide time gap | `independent_identity` |
| `contradictory_identity_observation` (e.g. two `IDENTITY:` rows naming different systems) | `conflict` (HARD FLIP) |
| `normalization_collapses_distinct_raw_names` (raw `entity.content.name` strings differ but normalize to same canonical_key, AND content domains diverge) | `independent_identity` (HARD FLIP) |
| `cross-tenant collision` | `independent_identity` (HARD; always) |

Confidence thresholds:

`confidence >= 0.85` → recommend non-`unknown` classification.

`0.5 <= confidence < 0.85` → recommend `unknown` with the top candidate listed in `proposed_classification_candidates`.

`confidence < 0.5` → `unknown`, no candidate suggested.

The threshold values are first-cut and must be reviewed against the Phase A dry-run on real data.

### Normalization-Collision Signal Detail

The `normalization_collapses_distinct_raw_names` signal addresses the case where `canonicalEntityKey` normalization (slug + lowercase + `_→-`) collapses semantically distinct raw names into a single lookup key. Live-data evidence: under canonical key `hb-apdas`, the database holds:

- 1 row with raw `entity.content.name = 'hb-apdas'`, content about voice/phone transport project
- 3 rows with raw `entity.content.name = 'hb_apdas'`, content about Houston Blenders Autonomous Polyglot Distributor

Normalization collapses both to `hb-apdas`, but they are different projects. Without this signal, the multi-signal score would (incorrectly) favor `facet_of_identity` based on `same_canonical_key` + `same_entity_type` + `created_at_within_seconds`.

Signal definition: when (a) the group's rows have at least two distinct raw `entity.content.name` strings AND (b) `content_shape_similarity` < 0.5 OR `semantic_observation_similarity` < 0.4, the signal triggers and **flips the recommendation toward `independent_identity` regardless of other signal agreement**, similarly to `contradictory_identity_observation`.

If the signal triggers but the rows clearly cluster (e.g. 3 `hb_apdas` rows with high content similarity + 1 `hb-apdas` row with low similarity to those 3), the dry-run should propose splitting the group: one identity for the `hb_apdas` cluster (classification `facet_of_identity`), one separate identity for the `hb-apdas` row (classification `independent_identity`). This split-group output is captured in the dry-run report as `proposedSplit: [{rows:[...], classification:'facet_of_identity'}, {rows:[...], classification:'independent_identity'}]`.

### Hard Rules

The heuristic may recommend; it must not execute. Phase A is read-only.

The 60-second co-creation window is one signal among many. It is not sufficient on its own to recommend `facet_of_identity`. It is also not necessary — facets created days apart with the same agent and metadata source can still recommend `facet_of_identity` if other signals agree.

A single `contradictory_identity_observation` flips the recommendation to `conflict` regardless of other signal agreement.

A single `normalization_collapses_distinct_raw_names` triggering flips the recommendation toward `independent_identity` (or a split-group proposal) regardless of other positive signals.

`unknown` rows must not be silently merged. They surface in `entity_context_facets` with `identity_id=NULL` and in dry-run as `proposed_action='manual_review'`.

## Alias Resolution Semantics

Alias resolution under A2.1 is a join between `graph_lookup_keys` (the existing lookup index, regenerated freely) and `entity_lookup_identity_links` (the durable identity-binding companion table). `graph_lookup_keys` answers *"what lookup strings point at this source row?"*; `entity_lookup_identity_links` answers *"what identity did we resolve that source-row lookup to, at what confidence?"*

When a query maps to multiple `(lookup_key, memory_id)` tuples, ranking determines which identities surface and in what order in `get_entity_context.resolution`.

### Resolution Path

```sql
-- pseudocode
SELECT gl.lookup_key, gl.key_kind, gl.weight, gl.memory_type, gl.memory_id,
       il.identity_id, il.confidence, il.resolution_status, il.last_verified_at
FROM graph_lookup_keys gl
LEFT JOIN entity_lookup_identity_links il
  ON il.tenant_id  = gl.tenant_id
 AND il.lookup_key = gl.lookup_key
 AND il.memory_type = gl.memory_type
 AND il.memory_id  = gl.memory_id
 AND il.status='active'
WHERE gl.tenant_id = ?
  AND gl.lookup_key IN (<normalized query variants>)
ORDER BY gl.weight DESC, il.confidence DESC, gl.created_at DESC
```

Rows with `il.identity_id IS NULL` are unresolved lookups (no Phase C link yet) and surface as `candidates` with `resolution_status='unresolved'`. Rows with `il.identity_id` populated and `il.resolution_status='resolved'` are direct identity matches.

### Lookup Type Precedence (Existing `key_kind` + `weight`)

The existing `graph_lookup_keys.key_kind` taxonomy and `weight` column already implement precedence. Pass 2.0 does not introduce a new precedence table; it reads from these existing columns.

| `key_kind` | weight | meaning |
|---|---:|---|
| `canonical_name` | 100 | normalized `entity.content.name` |
| `alias` | 95 | `entity.metadata.aliases[]` entry |
| `entity_name` | 95 | observation row's `entityName` field |
| `relation_from` / `relation_to` | 90 | relation row endpoint |
| `metadata_applies_to` | 85 | `metadata.appliesTo[]` entry on observation |
| `applies_to` | 85 | observation `appliesTo[]` |
| `embedded_observation_handle` | 70 | handle-like token scraped from inline observation prose |
| `agent_bootstrap_handle` | 65 | handle scraped from `agentBootstrap[]` |
| `derived` | 50 | derived variant (suffix-stripped, etc.) |
| `canonical_fact_handle` | (variable) | handle from structured `metadata.canonicalFact` |

Pass 2.0 adds no new `key_kind` values. Phase C populates `entity_lookup_identity_links` rows pointing at existing `graph_lookup_keys` tuples; it does not invent new lookup keys.

### Confidence And Verification

`entity_lookup_identity_links.confidence` is set at link-creation time. The default initial values follow the lookup-type weight (rescaled to 0.0–1.0):

| Source `key_kind` | Default link confidence |
|---|---:|
| `canonical_name`, `alias`, `entity_name` | `1.00` (when Phase C resolves to a single identity) |
| `metadata_applies_to`, `applies_to` | `0.85` |
| `embedded_observation_handle` | `0.70` |
| `agent_bootstrap_handle` | `0.65` |
| `derived` | `0.50` |
| heuristic / inferred from classification | `0.40–0.85` per signal score |

`last_verified_at` updates whenever a resolution is confirmed by agent or human use (e.g. `get_entity_context` returns the identity, the agent uses it, no correction follows). This is an opt-in update; passive reads do not bump it. The mechanism is captured in §Acceptance Tests.

### Hard Threshold Behavior

Links below `confidence < 0.5` never resolve a query silently. They surface as `candidates` in `get_entity_context.resolution`, never as the matched identity.

Links between `0.5` and `0.85` resolve only when there is exactly one active resolved link for the source-row tuple (enforced by the `idx_identity_lookup_links_one_resolved` partial unique index — multiple resolved links for the same tuple are impossible by constraint).

Links at `>= 0.85` from a single identity resolve directly.

Multiple identities matching the same query at `>= 0.85` (each via their own source-row tuple) still trigger `AMBIGUOUS_LOOKUP` — the constraint prevents per-tuple ambiguity, not cross-tuple ambiguity.

`status='deactivated'` links are excluded from resolution entirely (the partial indexes have `WHERE status='active'`).

### Auto-Population During Phase C

When Phase C creates a new identity, it does NOT mutate `graph_lookup_keys` (which is regenerated by the lookup indexer when source rows change). Instead, Phase C inserts `entity_lookup_identity_links` rows pointing at existing `graph_lookup_keys` tuples that match the identity's source rows.

For each source row that Phase C decides to link to a new identity, the migration code:

1. Reads `graph_lookup_keys` rows for `(tenant_id, memory_id=source_row_id)` to find all lookup keys that already point at the source row.
2. For each `(lookup_key, key_kind, weight)` tuple, inserts one `entity_lookup_identity_links` row with `identity_id = <new identity_id>`, `confidence = <derived from weight or classification>`, `resolution_status='resolved'` if the classification was confident or `resolution_status='candidate'` if multiple identities competed for the same source row.
3. Records the link's creation in `neural_audit_log` with `operation='pass2_phase_c'`, `entity_name=<canonical_key>`, `content_hash=<sha256 of (lookup_key, memory_type, memory_id, identity_id)>`.

Auto-population is deterministic and idempotent: rerunning Phase C against the same dry-run report hash produces the same link rows. The `idx_identity_lookup_links_active_identity` partial unique index prevents duplicate active rows.

Phase C never reads or writes `graph_lookup_keys`. The lookup indexer's `replaceGraphLookupIndexForMemory()` path remains the sole writer for that table.

### Stale-Link Detection

If a source row's content changes such that some lookup keys no longer apply, the lookup indexer regenerates `graph_lookup_keys` rows but does NOT touch `entity_lookup_identity_links`. The `entity_lookup_identity_links` row whose `(lookup_key, memory_id)` no longer has a matching `graph_lookup_keys` row is a stale link.

Stale links are detected by an explicit verification path (a periodic or on-demand check), not by silent boot-time deletion. The verification finds links with no matching `graph_lookup_keys` tuple and either (a) deactivates them with `status='deactivated'` and an audit-log row, or (b) flags them for manual review. This rule is captured in §Acceptance Tests.

A stale link surfacing in `get_entity_context` produces an integrity warning, not a hard failure.

## Tenant Scoping

`tenant_id` defaults to `'default'` when not supplied by the caller. Single-tenant deployments (current state) operate entirely under `'default'`.

Every read and every write filters by `tenant_id`. The identity, alias, facet, observation-link, and relation-edge tables all carry `tenant_id NOT NULL DEFAULT 'default'`.

Cross-tenant alias collisions are not collisions. The `(tenant_id, alias_key, identity_id)` uniqueness constraint scopes to tenant.

Migration batches inherit `tenant_id` from the dry-run report. A single migration batch never spans multiple tenants.

`get_entity_context` accepts an optional `tenantId` input, defaults to `'default'`, and never returns identities from another tenant. There is no admin/cross-tenant view in this ADR; if needed it is a separate tool with its own access policy.

## Agent Context API

Pass 2.0 adds a new tool: `get_entity_context`. It is **read-only** in Phase B and remains read-only by default thereafter. Writes stay in `add_observations` and other dedicated mutation tools.

### Inputs

```json
{
  "query": "string",
  "identityId": "string",
  "tenantId": "default",
  "sections": ["identity", "observations", "relations", "facets", "legacyBootstrap"],
  "observationLimit": 25,
  "observationOffset": 0,
  "observationKindFilter": null,
  "relationLimit": 25,
  "relationOffset": 0,
  "relationTypeFilter": null,
  "facetLimit": 25,
  "facetOffset": 0,
  "facetTypeFilter": null,
  "maxTokens": 8000,
  "since": "ISO-8601 timestamp",
  "includeLegacyEmbedded": false,
  "includeFacets": true,
  "includeCandidates": true,
  "includeLegacyRowCounts": true,
  "excludeLifecycleStatus": null
}
```

Input semantics:

`query` or `identityId` is required. If both are present, `identityId` wins and `query` is recorded for display.

`tenantId` defaults to `'default'`. The response never returns identities from a different tenant.

`observationOffset`, `relationOffset`, `facetOffset` enable per-section pagination. Each section has its own cursor; advancing one does not affect the others.

`observationKindFilter`: array of `metadata.kind` values to restrict observations (e.g. `['lesson-learned']` or `['decision','handoff']`). `null` (default) returns all kinds.

`excludeLifecycleStatus`: optional array of lifecycle values to exclude from candidates and lookup matches (e.g. `['closed','paused']`). **The default is `null` (no exclusion). Closed projects are NOT filtered by default.** This is intentional per §Decisions: closed projects are first-class knowledge and must be retrievable for lessons-learned.

`includeLegacyRowCounts` adds a `legacyRowCounts` diagnostic block to the response (useful during Phase B / Phase C transition).

### Output

```json
{
  "query": "neural-ai-collaboration",
  "tenantId": "default",
  "resolved": true,
  "resolution": {
    "matchedAlias": "neural-ai-collaboration",
    "aliasType": "canonical_name",
    "aliasConfidence": 0.9,
    "matchedIdentityIds": ["ident_01HX..."],
    "candidates": [],
    "warnings": []
  },
  "identity": {
    "id": "ident_01HX...",
    "displayName": "neural-ai-collaboration",
    "canonicalEntityKey": "neural-ai-collaboration",
    "entityType": "system_project",
    "lifecycleStatus": "active",
    "lifecycleSource": "agent-asserted",
    "status": "active",
    "aliases": ["neural", "shared-memory-mcp", "unified-neural-mcp", "neural-mcp"],
    "agentBootstrap": []
  },
  "observations": {
    "items": [
      {
        "id": "observation-row-id",
        "sourceRowId": "<shared_memory.id>",
        "content": "PASS 2.0 DESIGN PRINCIPLE — CLOSED PROJECTS ARE FIRST-CLASS KNOWLEDGE ...",
        "kind": "design-principle",
        "principleName": "closed-projects-are-first-class-knowledge",
        "addedBy": "claude-desktop",
        "timestamp": "2026-04-30T01:51:32Z",
        "recordedAt": "2026-04-30T01:51:32Z",
        "contentHash": "752f6604...",
        "source": "add_observations"
      }
    ],
    "hasMore": true,
    "nextOffset": 25
  },
  "relations": {
    "items": [
      {
        "edgeId": "edge_01HX...",
        "sourceRowId": "<shared_memory.id of legacy relation row>",
        "fromIdentityId": "ident_01HX...",
        "toIdentityId": "ident_01HY...",
        "fromResolutionStatus": "resolved",
        "toResolutionStatus": "resolved",
        "relationType": "depends_on",
        "confidence": 1.0,
        "properties": {}
      }
    ],
    "hasMore": false,
    "nextOffset": null
  },
  "facets": {
    "items": [
      {
        "facetId": "facet_01HX...",
        "sourceRowId": "<shared_memory.id>",
        "facetType": "project_identity",
        "title": "Project identity and goals",
        "contentHash": "sha256:...",
        "content": "...",
        "confidence": 0.91
      }
    ],
    "hasMore": false,
    "nextOffset": null
  },
  "legacyBootstrap": [],
  "legacyRowCounts": {
    "entityRows": 1,
    "embeddedInlineObservations": 8,
    "materializedObservations": 11,
    "legacyRelationRows": 3
  },
  "warnings": [],
  "provenance": {
    "schemaVersion": "2.0-draft",
    "queryTimestamp": "2026-04-30T00:00:00Z",
    "dedupedRedundantRepresentations": 0,
    "sourceRows": ["<shared_memory.id>", "..."],
    "appliedDryRunReportHash": null
  },
  "tokenBudget": {
    "maxTokens": 8000,
    "estimatedTokens": 1200,
    "truncatedSections": []
  }
}
```

### Resolution Block

`resolution` is separate from `identity` because identity describes the resolved entity while resolution describes how the query mapped to that entity (or didn't). This separation makes ambiguity inspectable without mutating the identity shape.

Fields:

`matchedAlias` — the alias_key that matched the query.

`aliasType` — alias_type from §Alias Resolution Semantics.

`aliasConfidence` — 0.0–1.0.

`matchedIdentityIds` — all identity_ids reachable from the matched alias. Single-element when `resolved=true`.

`candidates` — populated when `resolved=false` or when `includeCandidates=true`. Each candidate carries identityId, displayName, canonicalEntityKey, lifecycleStatus, status, confidence, reason.

`warnings` — codes such as `AMBIGUOUS_LOOKUP`, `LOW_CONFIDENCE_ALIAS`, `DEACTIVATED_ALIAS_SKIPPED`, `LIFECYCLE_EXCLUDED_CANDIDATES`, `EXACT_LOOKUP_PROJECTION_MISMATCH`, `NO_PROJECTION_MATCH`.

### Per-Section Cursors

`observations.nextOffset`, `relations.nextOffset`, `facets.nextOffset` are independent. Agents can deep-paginate observations without re-paging relations.

`hasMore` per section is computed as `(offset + items.length) < totalForSection`. Total counts are not returned by default to avoid count-query cost; if needed, agents pass `includeSectionTotals: true` (additive future input).

### Ambiguity Behavior

If a query maps to multiple plausible identities, the tool returns candidates and warnings. It must not silently choose unless the match is unambiguous (single identity at `aliasConfidence >= 0.85`, or all candidates resolve to the same identity).

In Phase B, exact legacy lookup and dry-run projection must agree before the tool surfaces an advisory `proposedIdentity`. Exact lookup uses only canonical entity names and aliases, both through `graph_lookup_keys` and through the no-index fallback scanner; embedded observation, bootstrap, metadata, or other derived handle matches are not identity evidence for projection selection. If an exact canonical-name or alias row exists but the signed Phase A dry-run artifact has no matching projection group, the response returns `resolved:false`, leaves `resolution.proposedIdentity:null`, and emits `EXACT_LOOKUP_PROJECTION_MISMATCH` plus `NO_PROJECTION_MATCH`.

```json
{
  "query": "hb-apdas",
  "tenantId": "default",
  "resolved": false,
  "resolution": {
    "matchedAlias": "hb-apdas",
    "aliasType": "slug_variant",
    "aliasConfidence": 0.7,
    "matchedIdentityIds": [],
    "candidates": [
      {
        "identityId": "ident_01HX...",
        "displayName": "hb_apdas",
        "canonicalEntityKey": "hb-apdas",
        "entityType": "system_architecture",
        "lifecycleStatus": "active",
        "status": "active",
        "confidence": 0.72,
        "reason": "slug_variant alias to system_architecture identity"
      },
      {
        "identityId": "ident_01HY...",
        "displayName": "hb-apdas-test-fixture",
        "canonicalEntityKey": "hb-apdas",
        "entityType": "test_fixture",
        "lifecycleStatus": "closed",
        "status": "active",
        "confidence": 0.55,
        "reason": "shared canonical key under different entity type, lifecycle closed"
      }
    ],
    "warnings": [
      "AMBIGUOUS_LOOKUP: query maps to multiple identities under canonical key 'hb-apdas'"
    ]
  }
}
```

Note that the closed-lifecycle candidate is included by default. An agent that explicitly does not want closed candidates can pass `excludeLifecycleStatus: ['closed']`; the closed candidate would then move to a `lifecycleExcluded` array (still visible, but not in `candidates`) so the agent knows the filter was applied.

### Phase B vs Phase C Behavior

Per §Decisions D8, Phase B does NOT invent fake `ident_proj_*` ULIDs. The Phase B response shape carries `phase: 'B'` and `identity.id: null` for any entity where Phase C has not yet executed. Agents are explicitly told (via response field and via this section) that they MUST NOT persist `identity.id` when `phase='B'` and `id=null` — there is no real identity row behind that response.

In Phase B, `get_entity_context` reads from legacy `shared_memory` rows. The Phase A dry-run **projection** (the proposed identity, classification, facets, signal scores) is surfaced under `resolution.proposedIdentity` and `provenance.dryRunProjection` as advisory metadata, NOT inside the `identity` block. `provenance.appliedDryRunReportHash` records which dry-run report informed the projection.

For entities where Phase C HAS executed, the same `get_entity_context` response carries `phase: 'C'`, `identity.id: <persisted ULID>`, and `provenance.appliedDryRunReportHash: null`. The persisted ULID is the real identity_id; agents may persist and bookmark it.

For entities partially covered (e.g. some lookup keys link to a persisted identity, others are still projection-only), the response carries the persisted identity in `identity` and any unresolved tuples in `resolution.candidates`. The `phase` field reflects the resolution status of the matched identity: `'C'` if the matched identity is persisted, `'B'` if only a projection exists.

Response shape between Phase B and Phase C differs in exactly two fields: `phase` and `identity.id` (null vs persisted). Agents do not branch on phase for normal use; they branch on `identity.id !== null` if they want to persist references.

For Phase-B projected relations: the response surfaces the source `shared_memory(memory_type='relation')` row with its `sourceRowId`, `sourceRelationType`, `semanticRelationType`, and resolved/unresolved endpoint statuses. Endpoints whose lookups have no Phase C link surface with `fromResolutionStatus: 'unresolved'` (or `to`) and the raw `unresolvedFromName` / `unresolvedToName` fields. **No projected `edge_proj_*` ids are returned.** The `edgeId` field is populated only for relations that have a persisted Phase C link backing them.

## Provenance Fields

All migrated or linked context should preserve provenance.

Minimum provenance fields:

`source`: API or migration source such as `create_entities_inline`, `add_observations`, `legacy_entity_observations`, or `identity_migration`.

`sourceRowId`: original `shared_memory.id`.

`identityId`: resolved identity id when known.

`canonicalEntityKey`: lookup key at time of write or migration.

`contentHash`: hash of the content unit.

`createdBy`: original writer.

`createdAt`: original created timestamp.

`migratedBy`: migration actor, when applicable.

`migratedAt`: migration timestamp, when applicable.

`kind`: controlled vocabulary for observation classification. See §Controlled Observation Kinds below.

`status`: `active`, `superseded`, `deprecated`, `conflict`, or `unknown`.

`confidence`: resolution confidence when inferred.

`risk`: migration risk label when inferred.

Original authorship must not be rewritten during migration.

`observedAt` (override): for historical backfills, `metadata.observedAt` overrides row `created_at` for "latest" sorting in `get_entity_context.observations`. When present, the response includes both `timestamp` (from `observedAt`) and `recordedAt` (row `created_at`) so agents can distinguish when a fact was true from when it was recorded.

`identityId` follows the prefixed-ULID convention `ident_<26-char-ulid>`. See §Decisions.

## Controlled Observation Kinds

`metadata.kind` on observation rows is a controlled vocabulary. Agents and migration code emit one of these values; unknown kinds are accepted and written through, but are flagged as `unknown_kind` in dry-run.

| Kind | Use |
|---|---|
| `fact` | atomic factual claim |
| `note` | informational, non-load-bearing |
| `decision` | a locked-in choice with rationale |
| `handoff` | session/agent handoff with state summary |
| `correction` | corrects an earlier observation (must reference `correctsObservationId` in metadata) |
| `state-summary` | periodic snapshot of project/system state |
| `design-principle` | a Tommy-locked or reviewer-locked principle that constrains future design |
| `lesson-learned` | knowledge derived from a closed/superseded project, intended to inform future work (see §Worked Example for the ralph → mike-bot pattern) |
| `audit-finding` | finding from a security/correctness audit, with severity |

`metadata.kind='lesson-learned'` is first-class: closed-project observations carrying this kind surface in `get_entity_context` even when the parent identity has `lifecycle_status='closed'`. Agents can scope a query to lesson-learned observations across closed projects via `kindFilter: ['lesson-learned']`.

`metadata.kind='design-principle'` observations have an additional convention: `metadata.principle_name` (kebab-case unique key within a tenant) so principles can be referenced by name rather than by content match.

## Relation Vocabulary Registry

Existing relation rows in `shared_memory(memory_type='relation')` use freeform UPPER_SNAKE_CASE strings (`HAS_SUBSYSTEM`, `INTEGRATES_WITH`, `BLOCKS_IMPLEMENTATION_OF`, `THREATENS_SUCCESS_OF`, `REQUIRES_RESOLUTION_OF`, `PART_OF`, etc.). Pass 2.0 does NOT migrate or rewrite these rows. The vocabulary fight is avoided by treating controlled relation types as a **read-time mapping registry**, not a database constraint.

The registry is code/config in Pass 2.0. It MAY be promoted to a per-tenant overlay table in a future ADR; the API shape below is designed so that promotion does not change `get_entity_context` output.

### Registry Shape

The registry is a versioned mapping from `sourceRelationType` (the original freeform string in `shared_memory(memory_type='relation').content.relationType`) to a `semanticRelationType` (a controlled-vocabulary token used for analytics, navigation, and reciprocal pairing).

Initial registry (`registryVersion: '1'`):

| `sourceRelationType` | `semanticRelationType` | `mappingConfidence` | Notes |
|---|---|---:|---|
| `HAS_SUBSYSTEM` | `has_part` | 0.95 | parent → subsystem |
| `PART_OF` | `part_of` | 1.00 | subsystem → parent |
| `INTEGRATES_WITH` | `related_to` | 0.70 | weak directional integration; could refine later |
| `DEPENDS_ON` | `depends_on` | 1.00 | (case-insensitive normalization on registry input) |
| `BLOCKS_IMPLEMENTATION_OF` | `blocks` | 0.95 | |
| `REQUIRES_RESOLUTION_OF` | `blocked_by` | 0.95 | reciprocal of `blocks` |
| `THREATENS_SUCCESS_OF` | `risks` | 0.85 | weaker than `blocks` |
| `REFERENCES` | `references` | 1.00 | |
| `MENTIONS` | `mentions` | 0.85 | weaker than `references` |
| `SUCCEEDED_BY` | `succeeded_by` | 1.00 | closed-project lineage; reciprocal `predecessor_of` |
| `PREDECESSOR_OF` | `predecessor_of` | 1.00 | reciprocal of `succeeded_by` |
| `SUPERSEDES` | `supersedes` | 1.00 | identity-level supersession; reciprocal `superseded_by` |
| `SUPERSEDED_BY` | `superseded_by` | 1.00 | |
| (unmapped) | `null` | `null` | unknown relation type; surfaces as-is with `mappingSource='unmapped'` |

`mappingSource` distinguishes registry origin: `'registry-v1'`, `'tenant-overlay'` (future), `'agent-asserted'` (when an agent calls a future override API), `'unmapped'` (no mapping).

### Semantic Vocabulary

The controlled `semanticRelationType` token set:

| `semanticRelationType` | Reciprocal | Meaning |
|---|---|---|
| `succeeded_by` | `predecessor_of` | closed-project lineage (project A retired in favor of B) |
| `predecessor_of` | `succeeded_by` | reciprocal of `succeeded_by` |
| `supersedes` | `superseded_by` | identity-level supersession |
| `superseded_by` | `supersedes` | reciprocal |
| `depends_on` | `dependency_of` | build/runtime/operational dependency |
| `dependency_of` | `depends_on` | reciprocal |
| `part_of` | `has_part` | structural composition |
| `has_part` | `part_of` | reciprocal |
| `blocks` | `blocked_by` | hard blocker |
| `blocked_by` | `blocks` | reciprocal |
| `risks` | `risked_by` | weaker than `blocks` |
| `risked_by` | `risks` | reciprocal |
| `references` | `referenced_by` | explicit citation |
| `referenced_by` | `references` | reciprocal |
| `mentions` | `mentioned_by` | weaker than `references` |
| `mentioned_by` | `mentions` | reciprocal |
| `related_to` | `related_to` | symmetric last-resort grouping |

This vocabulary is for read-time annotation. It does not constrain writes. Agents may continue to write any `relationType` string they want; the registry maps it on read.

### `get_entity_context` Surface

Each relation in `get_entity_context.relations.items[]` carries both fields:

```json
{
  "sourceRowId": "<shared_memory.id>",
  "fromIdentityId": "ident_...",
  "toIdentityId": "ident_...",
  "fromResolutionStatus": "resolved",
  "toResolutionStatus": "resolved",
  "sourceRelationType": "HAS_SUBSYSTEM",
  "semanticRelationType": "has_part",
  "mappingConfidence": 0.95,
  "mappingSource": "registry-v1",
  "registryVersion": "1",
  "properties": { "description": "HB-APDAS voice/phone AI subsystem" }
}
```

`sourceRelationType` is the verbatim string from the underlying `shared_memory` row. It is NEVER rewritten. `semanticRelationType` is the registry-mapped value (or `null` if unmapped). Agents and dashboards can pivot on either field. Lesson-learned navigation (e.g. "find all `succeeded_by` relations from closed projects") uses `semanticRelationType`. Audit and corpus-analysis tasks use `sourceRelationType`.

### Reciprocity And Migration

Pass 2.0 does NOT auto-create reciprocal relation rows in `shared_memory`. Reciprocity is a registry concept: when `get_entity_context` returns a relation, it can also surface the reciprocal as a *derived* edge if the reverse is not explicitly stored. Whether to surface derived reciprocals is a future API decision; the locked behavior for Pass 2.0 is to surface only stored relation rows and tag them with `semanticRelationType` for navigation.

If an agent or human writes a new relation row using `create_relations`, they SHOULD pick a `relationType` string that is in the registry's recognized set. They MAY continue to write freeform strings; those surface in `get_entity_context` with `semanticRelationType=null`, `mappingSource='unmapped'`, and `mappingConfidence=null`. New unmapped types accumulate in observability metrics so the registry can be expanded over time.

### Future Per-Tenant Overlay

If a tenant needs to override or extend the registry, a future ADR may introduce a `relation_vocabulary_overrides` table:

```sql
-- Future, NOT in Pass 2.0
relation_vocabulary_overrides(
  tenant_id          TEXT NOT NULL,
  source_relation_type TEXT NOT NULL,
  semantic_relation_type TEXT,                 -- nullable to explicitly mask a registry mapping
  mapping_confidence REAL,
  reason             TEXT,
  created_by         TEXT,
  created_at         TEXT NOT NULL,
  PRIMARY KEY (tenant_id, source_relation_type)
);
```

The mapping provider in `get_entity_context` would consult the overlay first, then fall back to the registry. Output shape (`sourceRelationType`, `semanticRelationType`, `mappingConfidence`, `mappingSource`, `registryVersion`) does not change; `mappingSource` would distinguish `'tenant-overlay'` from `'registry-v1'`.

This overlay is explicitly out of scope for Pass 2.0. The point of designing the API shape now is to ensure the future overlay is additive.

### Closed-Project Lineage Pattern

The canonical closed-project lineage pattern is:

`<closed-project-identity> --SUCCEEDED_BY--> <successor-identity>` (stored in `shared_memory`; the registry maps to `semanticRelationType='succeeded_by'`)

`<successor-identity> --PREDECESSOR_OF--> <closed-project-identity>` (the reciprocal, also stored)

`<closed-project-identity>.lifecycle_status = 'closed'`

`<closed-project-identity>` retains all observations, including those with `metadata.kind='lesson-learned'`.

`get_entity_context` for either identity surfaces the lineage relation, the lifecycle, and the lesson-learned observations on the closed side, so agents working on the successor can read the predecessor's documented decisions. See §Worked Example.

If neither `SUCCEEDED_BY` nor `PREDECESSOR_OF` rows exist for a closed identity, lineage cannot be navigated. Phase C does not auto-create lineage rows; lineage assertion is an explicit agent/human action via `create_relations`.

## Dry-Run Report Format

The dry-run inventory report is a first-class artifact. It is saved as JSON, hashed (canonical-form `sha256` — see "Canonical Form" below), and that hash becomes the `content_hash` of a `neural_audit_log` row with `operation='pass2_dry_run'`. The same report file is the regression fixture for Phase C tests.

### Canonical Form For Hashing

The dry-run report contains both deterministic content (the proposed identities/facets/links and signal scores) and ephemeral fields (`generatedAt` wall-clock, `tokenBudget.estimatedTokens` if present, `proposedRollbackSnapshot.estimatedBytes` if it depends on filesystem state). To make the canonical-form hash byte-identical across reruns of the same input snapshot, hashing operates on a stripped projection:

`canonicalForm(report) = report` minus `generatedAt`, minus `tokenBudget.estimatedTokens`, minus `proposedRollbackSnapshot.estimatedBytes`, with object keys sorted lexicographically and JSON whitespace normalized.

The full report (including ephemeral fields) is what the operator reads. The canonical form is what the audit log stores. Phase C verifies a live report's canonical-form hash matches the recorded `content_hash` before executing.

The report has three layers: a top-level summary, a per-group classification with signal scores, and a per-row evidence table. Phase C may not execute without all three layers being present and reviewed.

```json
{
  "schemaVersion": "2.0-dry-run",
  "tenantId": "default",
  "generatedAt": "2026-04-30T00:00:00Z",
  "snapshotRef": {
    "shared_memory_row_count": 9821,
    "entity_row_count": 920,
    "observation_row_count": 7314,
    "relation_row_count": 194,
    "graph_lookup_keys_row_count": 12048
  },
  "summary": {
    "entityRows": 920,
    "canonicalKeys": 879,
    "duplicateCanonicalKeys": 12,
    "rowsInDuplicateGroups": 52,
    "inlineObservationsEmbedded": null,
    "inlineObservationsMaterialized": null,
    "inlineObservationCountsComputed": false,
    "relations": 194,
    "unresolvedRelations": 0
  },
  "groups": [
    {
      "canonicalEntityKey": "houston-blenders-orchestrator",
      "rowCount": 19,
      "recommendedClassification": "facet_of_identity",
      "classificationConfidence": 0.91,
      "risk": "medium",
      "signals": {
        "same_canonical_key": true,
        "same_entity_type": true,
        "same_addedBy": true,
        "created_at_within_seconds": 0,
        "same_metadata_source": true,
        "content_shape_similarity": 0.94,
        "semantic_observation_similarity": 0.78,
        "differing_entity_type": false,
        "contradictory_identity_observation": false
      },
      "proposedIdentity": {
        "displayName": "houston-blenders-orchestrator",
        "entityType": "project",
        "lifecycleStatus": "closed",
        "lifecycleSource": "agent-asserted"
      },
      "proposedRelationsToAdd": [
        {
          "relation_type": "succeeded_by",
          "to_canonicalKey": "mike-bot",
          "confidence": 1.0,
          "source": "agent-asserted"
        }
      ],
      "rows": [
        {
          "sourceRowId": "<shared_memory.id>",
          "createdBy": "unified-neural-mcp-server",
          "createdAt": "2026-02-01 03:34:46",
          "entityType": "project",
          "contentHash": "sha256:...",
          "contentSize": 4612,
          "firstObservationExcerpt": "PROJECT IDENTITY: ralph is the closed first-attempt voice agent for Houston Blenders ...",
          "observationCount": 8,
          "relationEndpointCount": 2,
          "metadataSource": "create_entities_inline",
          "proposedAction": "facet_under_identity",
          "proposedFacetType": "project_identity",
          "proposedFacetTitle": "Project identity and goals",
          "warnings": []
        }
      ],
      "proposedFacets": [],
      "proposedObservationLinks": [],
      "relationRemaps": [],
      "warnings": []
    }
  ],
  "unresolvedRelationEndpoints": [],
  "executionPlan": {
    "requiresHumanApproval": true,
    "wouldWriteRows": 0,
    "wouldUpdateRows": 0,
    "wouldDeleteRows": 0,
    "wouldRebuildLookupKeys": false,
    "proposedRollbackSnapshot": {
      "kind": "sqlite-file-copy",
      "destinationPath": "/app/data/snapshots/<batch_id>.sqlite",
      "estimatedBytes": 18000000
    }
  }
}
```

### Per-Row Evidence Requirements

Every row in a duplicate-canonical-key group **must** appear in the `rows[]` array. The fields below are mandatory:

`sourceRowId` — `shared_memory.id`.

`createdBy` — original `created_by` (or whichever field carries authorship).

`createdAt` — original timestamp.

`entityType` — `entity.content.type`.

`contentHash` — `sha256` of canonicalized content JSON.

`firstObservationExcerpt` — first 200 characters of the first inline observation, suitable for human review.

`observationCount` — count of inline observations on that row.

`relationEndpointCount` — number of relations referencing this entity row by name.

`metadataSource` — value of `metadata.source` (e.g. `create_entities_inline`, `add_observations`).

`proposedAction` — one of: `preserve` | `link_to_identity` | `facet_under_identity` | `manual_review`.

`proposedFacetType` and `proposedFacetTitle` — present iff `proposedAction='facet_under_identity'`.

`warnings` — per-row warnings (e.g. `CONTRADICTORY_IDENTITY_OBSERVATION`, `WIDELY_SEPARATED_TIMESTAMPS`).

### Hard Rules

Dry-run makes no domain data mutations. Row counts for `shared_memory`, `graph_lookup_keys`, `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, sqlite-vec embedding tables, and any other domain table are byte-identical before and after a dry-run.

The only permitted write during dry-run is one `neural_audit_log` row with `operation='pass2_dry_run'` and `content_hash=<canonical-form sha256>`.

The report file's canonical-form `sha256` is the `neural_audit_log.content_hash` for the `pass2_dry_run` row. Phase C refuses to execute if the live canonical-form hash drifts from the recorded hash.

Re-running the dry-run against the same database snapshot produces a byte-identical report. If it does not, the dry-run tool has hidden state — fail loud.

## Worked Example: `houston-blenders-orchestrator` (closed) → `mike-bot` (active)

This worked example is a forcing function: the ADR is implementation-ready only if this end-to-end flow is internally consistent. It also exercises the closed-projects-are-first-class-knowledge principle (Tommy, 2026-04-29) — see the `metadata.kind='design-principle'` observation `e0c6dca9-30d2-40fd-9ce5-0fd5e3fe8537` on `neural-ai-collaboration`.

### Current State (Pass 1.x)

Direct live DB inspection (2026-04-29) found 19 `shared_memory` rows with:

`memory_type = 'entity'`

`content.name = 'houston-blenders-orchestrator'`

`content.type = 'project'`

`created_at = '2026-02-01 03:34:46'`

The 19 rows look like context shards from a single creation transaction. Example facet themes include project identity, tech stack, file structure, prompt assets, qualification logic, Firestore collections, test scenarios, environment variables, working components, blocked items, sales contacts, and server startup instructions.

The pre-existing `dedupAndFilter()` layer in `search_entities` (`src/unified-neural-mcp-server.ts:1830`) collapses those 19 rows to one user-visible result by deduping entity-type results on `canonicalEntityName.toLowerCase()`. Live verification on 2026-04-30: query `{searchType:'exact', query:'houston-blenders-orchestrator', limit:50}` returned `preDeduplicationCount: 41 → returnedResults: 23` with `redundantRepresentationCount: 0`. The Pass 1.2 redundant-representation suppression (which only fires when an entity is matched solely via `embedded_observation_handle` and a materialized observation twin exists) did NOT fire for this query. The 19→1 collapse is the older, broader entity-name dedupe.

That means consumers have not been seeing the sharded richness for direct canonical-name queries either. Either the sharding is dead weight (and the existing dedupe is correctly hiding what should never have been written that way), or the current search API has been hiding intended context. Pass 2.0 resolves the ambiguity by promoting the shards to first-class facets under one identity, while leaving `search_entities`' compact 1-row response shape unchanged. Agents needing the full faceted response call `get_entity_context`.

`houston-blenders-orchestrator` is a **closed** project. It was the first-attempt voice agent prototype for Houston Blenders. It was succeeded by `mike-bot`, the current production voice agent. Closing did not invalidate the project's knowledge — territory definitions, lead qualification logic, distributor-packet design, quiet-hours notifications, and the original prompt assets all directly informed `mike-bot`'s design and remain useful for any analogous Ascend-stack project.

### Phase A: Dry-Run Output (Read-Only)

Phase A produces a dry-run JSON with the houston group at confidence 0.91 and recommended classification `facet_of_identity`. Phase A writes nothing.

```json
{
  "canonicalEntityKey": "houston-blenders-orchestrator",
  "rowCount": 19,
  "recommendedClassification": "facet_of_identity",
  "classificationConfidence": 0.91,
  "risk": "medium",
  "signals": {
    "same_canonical_key": true,
    "same_entity_type": true,
    "same_addedBy": true,
    "created_at_within_seconds": 0,
    "same_metadata_source": true,
    "content_shape_similarity": 0.94,
    "semantic_observation_similarity": 0.78,
    "differing_entity_type": false,
    "contradictory_identity_observation": false
  },
  "proposedIdentity": {
    "displayName": "houston-blenders-orchestrator",
    "canonicalEntityKey": "houston-blenders-orchestrator",
    "entityType": "project",
    "lifecycleStatus": "closed",
    "lifecycleSource": "agent-asserted-closed-2026-04-29"
  },
  "proposedRelationsToAdd": [
    {
      "relation_type": "succeeded_by",
      "to_canonicalKey": "mike-bot",
      "confidence": 1.0,
      "source": "agent-asserted",
      "reciprocal": "predecessor_of"
    }
  ],
  "rows": [
    {
      "sourceRowId": "<row-uuid-1>",
      "createdBy": "unified-neural-mcp-server",
      "createdAt": "2026-02-01 03:34:46",
      "entityType": "project",
      "contentHash": "sha256:abc...",
      "contentSize": 4612,
      "firstObservationExcerpt": "PROJECT IDENTITY: ralph (houston-blenders-orchestrator) is a voice agent for ...",
      "observationCount": 8,
      "relationEndpointCount": 2,
      "metadataSource": "create_entities_inline",
      "proposedAction": "facet_under_identity",
      "proposedFacetType": "project_identity",
      "proposedFacetTitle": "Project identity and goals",
      "warnings": []
    }
    // ... 18 more row entries
  ],
  "proposedObservationLinks": [
    // links from existing materialized observations on the 19 rows to the proposed identity
  ],
  "warnings": []
}
```

`lifecycleStatus: 'closed'` is asserted in the dry-run. Phase A does not infer lifecycle automatically — the agent reviewer must annotate it (or the dry-run input must include a lifecycle assertion file). If lifecycle is not asserted, the dry-run defaults to `'unknown'` and Phase C creates the identity with `lifecycle_status='unknown'`. An agent or human can then `update` the lifecycle in a later operation (out of scope for this ADR).

`mike-bot` is referenced by canonical key, not identity_id, because Phase A runs before any identity rows exist. Under A2.1, lineage relations live in `shared_memory(memory_type='relation')` rows, not in a dedicated edge table. Phase C resolves the canonical key against `graph_lookup_keys` joined with `entity_lookup_identity_links` at read time. If the resolution is ambiguous or missing at the time `get_entity_context` reads, the relation surfaces with `toResolutionStatus='unresolved'` and `unresolved_to_name='mike-bot'` in the response — no write is required to record the unresolved state.

Phase A makes no domain data mutations: row counts in `shared_memory`, `graph_lookup_keys`, `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, and the sqlite-vec embedding tables are byte-identical before and after. Phase A may write exactly one `neural_audit_log` row (the `pass2_dry_run` audit entry whose `content_hash` is the canonical-form sha256 of the dry-run JSON artifact). That single audit row is the artifact-hash binding required by Phase C to verify the dry-run report later.

### Phase B: Read-Only Context Before Phase C Has Executed

In Phase B (before Phase C has written any rows for this entity), `get_entity_context({"query":"houston-blenders-orchestrator"})` reads only the existing `shared_memory` legacy rows. The response carries `phase: 'B'` and `identity.id: null` per §Decisions D8 — there is no persisted identity_id to return, and the ADR forbids inventing fake `ident_proj_*` ids. The Phase A dry-run *projection* (the proposed identity, classification, facets, signal scores) is surfaced under `resolution.proposedIdentity` and `provenance.dryRunProjection` as advisory metadata that agents must NOT persist.

```json
{
  "query": "houston-blenders-orchestrator",
  "tenantId": "default",
  "phase": "B",
  "resolved": false,
  "resolution": {
    "matchedAlias": "houston-blenders-orchestrator",
    "aliasType": "canonical_name",
    "aliasConfidence": 0.9,
    "matchedIdentityIds": [],
    "candidates": [],
    "warnings": ["PHASE_B_NO_PERSISTED_IDENTITY: dry-run projection available but Phase C has not executed for this canonical key"],
    "proposedIdentity": {
      "displayName": "houston-blenders-orchestrator",
      "canonicalEntityKey": "houston-blenders-orchestrator",
      "entityType": "project",
      "lifecycleStatus": "closed",
      "lifecycleSource": "agent-asserted-closed-2026-04-29",
      "classificationConfidence": 0.91,
      "fromDryRunReportHash": "sha256:dry-run-report-hash-here"
    }
  },
  "identity": {
    "id": null,
    "displayName": "houston-blenders-orchestrator",
    "canonicalEntityKey": "houston-blenders-orchestrator",
    "entityType": "project",
    "lifecycleStatus": "closed",
    "lifecycleSource": "agent-asserted-closed-2026-04-29",
    "status": null,
    "aliases": ["houston-blenders-orchestrator", "ralph", "hb-voice-v1"],
    "agentBootstrap": []
  },
  "observations": {
    "items": [
      // legacy observation rows for this canonical key — surfaced unchanged
      {
        "id": "<obs-row-id>",
        "sourceRowId": "<shared_memory.id>",
        "content": "LESSON LEARNED: distributor packet PDF should pre-fill territory ZIP from caller area code ...",
        "kind": "lesson-learned",
        "addedBy": "claude-desktop",
        "timestamp": "2026-02-15T18:22:00Z",
        "recordedAt": "2026-02-15T18:22:00Z",
        "contentHash": "sha256:...",
        "source": "add_observations"
      }
      // ... more observations, NOT filtered by lifecycle
    ],
    "hasMore": true,
    "nextOffset": 25
  },
  "relations": {
    "items": [
      {
        "edgeId": null,
        "sourceRowId": "<shared_memory.id of legacy SUCCEEDED_BY relation row>",
        "fromIdentityId": null,
        "toIdentityId": null,
        "unresolvedFromName": "houston-blenders-orchestrator",
        "unresolvedToName": "mike-bot",
        "fromResolutionStatus": "unresolved",
        "toResolutionStatus": "unresolved",
        "sourceRelationType": "SUCCEEDED_BY",
        "semanticRelationType": "succeeded_by",
        "mappingConfidence": 1.0,
        "mappingSource": "registry-v1",
        "registryVersion": "1",
        "properties": {}
      }
    ],
    "hasMore": false,
    "nextOffset": null
  },
  "facets": {
    "items": [],
    "hasMore": false,
    "nextOffset": null
  },
  "legacyBootstrap": [],
  "legacyRowCounts": {
    "entityRows": 19,
    "embeddedInlineObservations": 152,
    "materializedObservations": 87,
    "legacyRelationRows": 4
  },
  "warnings": [
    "PHASE_B_NO_PERSISTED_IDENTITY: identity.id is null because Phase C has not executed; do NOT persist or bookmark identity.id",
    "PHASE_B_PROJECTED_FACETS_NOT_RETURNED: 19 facets are projected by the dry-run but not returned in the response shape; see provenance.dryRunProjection.proposedFacets for advisory metadata"
  ],
  "provenance": {
    "schemaVersion": "2.0-draft",
    "queryTimestamp": "2026-04-30T00:00:00Z",
    "dedupedRedundantRepresentations": 0,
    "sourceRows": ["<row-uuid-1>", "..."],
    "appliedDryRunReportHash": "sha256:dry-run-report-hash-here",
    "dryRunProjection": {
      "proposedIdentity": "houston-blenders-orchestrator (project, closed, conf=0.91)",
      "proposedFacets": "<19 facets — see Phase A dry-run report rows[]>",
      "proposedLinks": "<N lookup-identity link rows — see Phase A dry-run report>"
    }
  }
}
```

The Phase-B response uses NO `ident_proj_*`, `edge_proj_*`, or `facet_proj_*` ids. Identity-typed fields are explicitly `null` when no persisted identity exists. The dry-run projection is advisory metadata that agents must not persist as identity references. Lifecycle (`closed`) is surfaced from the projection so closed-projects-are-first-class-knowledge (§Decisions D3) still applies — agents see the lifecycle even before Phase C has executed.

Once Phase C executes for `houston-blenders-orchestrator`, the same query returns `phase: 'C'` and `identity.id` populated with the persisted ULID, plus the 19 facets in `facets.items[]` and the relation with `edgeId` populated where a Phase C link backs the endpoint resolution.

If the agent explicitly does not want closed candidates (e.g. an automated triage flow), it can pass `excludeLifecycleStatus: ['closed']`. The houston identity (or its projection) then moves out of the candidates set and into `resolution.lifecycleExcluded`, with a `LIFECYCLE_EXCLUDED_CANDIDATES` warning.

### Phase C: Persisted Migration

Phase C executes the same projections as durable rows. Under A2.1, three tables receive writes; relations stay in `shared_memory`; audit lives in `neural_audit_log`.

`entity_identities` gains one row: `identity_id=ident_<ulid>`, `canonical_key=houston-blenders-orchestrator`, `entity_type=project`, `lifecycle_status=closed`, `status=active`, `resolution_status=inferred`, `confidence=0.91`, `source_audit_id=<id of pass2_dry_run audit row>`.

`entity_context_facets` gains 19 rows, one per source `shared_memory` entity row. `identity_id` points to the new identity. `facet_type` is inferred from the first observation. `confidence=0.91`. `content_hash` matches the dry-run. `source_audit_id` references the Phase C `pass2_phase_c` audit row.

`entity_lookup_identity_links` gains rows pointing at the existing `graph_lookup_keys` tuples for the 19 source rows. For each `(lookup_key, key_kind, weight)` tuple in `graph_lookup_keys` matching the 19 source `memory_id` values, Phase C inserts one link row with `identity_id=<new identity_id>`, `confidence` derived from the lookup weight, `resolution_status='resolved'` (single confident classification), `status='active'`.

Lineage relations: if a `SUCCEEDED_BY` row exists in `shared_memory(memory_type='relation')` from `houston-blenders-orchestrator → mike-bot`, no Phase C write is required for the lineage — it already lives as a legacy relation row. The registry maps it to `semanticRelationType='succeeded_by'` at read time. If the lineage row does NOT yet exist, an explicit `create_relations` call (separate from Phase C) records it; Phase C does not auto-create lineage rows.

`neural_audit_log` gains one row with `operation='pass2_phase_c'` per affected identity/facet/link. The first audit row (the one that "owns" the batch) carries `entity_name=houston-blenders-orchestrator`, `target_count=<count of all rows written>`, `reason='Phase C: identity + 19 facets + N links'`, `content_hash=<sha256 of the dry-run canonical form>` linking it back to the Phase A artifact.

`shared_memory`, `graph_lookup_keys`, and the sqlite-vec embedding tables are not modified by Phase C.

### Phase C Agent Context Response

After Phase C, `get_entity_context` for `houston-blenders-orchestrator` returns the same response shape as Phase B but with persisted identity_ids and `provenance.appliedDryRunReportHash: null`. Agents do not need to branch on phase.

### Search Behavior

`search_entities({"query": "houston-blenders-orchestrator"})` continues to return the identity-oriented result first and is not inflated with all 19 facets. Agents needing the full faceted shape call `get_entity_context`. This division of responsibility between `search_entities` (fast lookup) and `get_entity_context` (assembly) is preserved across all phases.

### Closed-Project Knowledge Surfacing

A canonical query for the principle "what did ralph teach us?" looks like:

```
get_entity_context({
  "query": "houston-blenders-orchestrator",
  "observationKindFilter": ["lesson-learned"],
  "observationLimit": 50
})
```

This returns ralph's lesson-learned observations regardless of lifecycle status. The agent doing the work on `mike-bot` (or any future analogous Ascend-stack project) calls this query to retrieve documented decisions on territories, lead qualification, distributor packets, and quiet-hours notifications.

### Phase C Rollback

Phase C rollback for this batch:

Sets `entity_identities` row to `status='deactivated'` with `deactivated_at` and `deactivated_by` recorded.

Sets all 19 `entity_context_facets` rows to `status='deactivated'`.

Sets ALL `entity_lookup_identity_links` rows pointing at the rolled-back identity to `status='deactivated'`. Codex flagged this as mandatory: deactivating the identity and facets while leaving links active would surface dead identities in lookups via the `graph_lookup_keys` join.

Lineage relations in `shared_memory(memory_type='relation')` are NOT rewritten or deactivated by Phase C rollback. They are legacy data, not a Phase C artifact. If a relation references the rolled-back identity, the read-time join in `get_entity_context` will surface that endpoint with `resolution_status='unresolved'` once the link is deactivated — which is the correct behavior.

Writes one `neural_audit_log` row with `operation='pass2_rollback'`, `entity_name=houston-blenders-orchestrator`, `reason='Rollback of pass2_phase_c batch <content_hash>'`, `target_count=<count of deactivated rows>`.

`shared_memory` is untouched. `graph_lookup_keys` is untouched. Embeddings are untouched. The system reverts to Pass 1.x behavior for this canonical key.

Soft-rollback is the default. Hard-deletion of these rows is only allowed in an explicit `pass2_cleanup` operation that has its own dry-run report and reviewer sign-off.

## Migration Plan

The phase order is **read-only first, writes last**. No identity, facet, or lookup-identity link writes happen before the read-only context API has been deployed and observed against legacy rows. This is a hard ordering constraint.

### Phase A: Read-Only Inventory And Dry-Run

Scope: classify the 12 duplicate canonical-key groups and 52 rows surfaced on 2026-04-29.

Goal: produce a row-level dry-run report, save it as a versioned JSON artifact, and review it before any write code is merged.

Implementation: a read-only inventory/inspect tool (e.g., `inspect_identity_candidates`) that scans `shared_memory`, computes proposed classifications/confidences, emits the dry-run report defined in §Dry-Run Report Format, and writes nothing to `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, `graph_lookup_keys`, `shared_memory`, the sqlite-vec embedding tables, or any other domain table. The single `neural_audit_log` row recording the dry-run artifact hash (per §Decisions D7) is the only write Phase A is permitted to make.

Exit criteria: dry-run report reviewed and signed off by at least two reviewer agents. Phase B may not proceed without a stored dry-run report whose hash matches the report ingested by Phase B.

### Phase B: Read-Only Agent Context Over Legacy Rows

Scope: implement `get_entity_context` as a read-only assembly over existing `shared_memory` rows plus the Phase A dry-run *projections*.

Goal: prove that context retrieval works end-to-end without requiring identity/facet table writes. Surface lifecycle, candidates, warnings, and per-section cursors against today's live data.

Behavior: `get_entity_context` reads (a) legacy `entity` rows, (b) materialized observation rows, (c) relation rows, and (d) Phase A projections held in memory or in a read-only projection store. It returns the full Pass 2.0 response shape including the `resolution` block, candidates, lifecycle, and warnings. No row is created or updated in any identity table.

Exit criteria: acceptance tests in §Acceptance Tests pass against legacy data using projections only. Reviewer agents confirm the Houston worked-example response shape is satisfied.

### Phase C: Identity, Facet, And Link Writes

Scope: same 12 duplicate canonical-key groups and 52 rows from Phase A.

Goal: persist identities, facets, and lookup-identity links so the Phase A projections become first-class queryable rows. Lineage relations remain in `shared_memory(memory_type='relation')` and are NOT rewritten.

Constraints:

No source row deletion. No mutation of existing `shared_memory` rows. No mutation of existing `graph_lookup_keys` rows. All writes go to the three new identity-layer tables (`entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`) plus `neural_audit_log` audit entries with `operation='pass2_phase_c'` referencing the dry-run canonical-form hash. Soft-rollback is the default (`status='deactivated'` rather than DELETE).

Idempotency: re-running Phase C against the same dry-run canonical-form hash must produce zero net changes. The `idx_identity_lookup_links_active_identity` and `idx_identity_lookup_links_one_resolved` partial unique indexes prevent duplicate active links; `idx_facets_active_source_hash` prevents duplicate active facets; `idx_entity_identities_active_canonical` prevents duplicate active identities per `(tenant, canonical_key, entity_type)`.

Exit criteria: rollback rehearsed against a copy of production data; identity/facet/link rows visible to `get_entity_context` produce the same response shape as Phase B projections did.

### Phase D: Universal Inline Observation Materialization

Backfill historical `entity.content.observations[]` entries into materialized observation rows for entities outside the duplicate-canonical-key set.

Dry-run first. Batch execute with idempotency and rollback metadata. Reuses the §Dry-Run Report Format and `neural_audit_log` (no separate migration_batches table). See §Decisions D9 for embedding regeneration constraints (forced regeneration; opt-in; resumable; rate-limited; never a startup side effect).

### Phase E: Deprecation And Cleanup

Document `entity.content.observations[]` as legacy/bootstrap-only.

Keep it readable for backwards compatibility.

New writes use `add_observations` (or a future structured write path).

A scheduled cleanup job may eventually deactivate redundant inline entity rows that are fully covered by materialized observations and identity facets, but only via dry-run + reviewed batch (operation='pass2_cleanup' in `neural_audit_log`).

## Relation Read-Time Resolution

Under A2.1, relations are NOT migrated. They remain in `shared_memory(memory_type='relation')` rows with their original freeform `relationType` strings (`HAS_SUBSYSTEM`, `INTEGRATES_WITH`, etc.). Pass 2.0 resolves endpoints to identities at READ time inside `get_entity_context`, joining `graph_lookup_keys` with `entity_lookup_identity_links` for each endpoint.

Per-endpoint resolution states surfaced in the response:

`resolved`: the endpoint's lookup key has exactly one active resolved link in `entity_lookup_identity_links`. The response carries `fromIdentityId` (or `toIdentityId`).

`ambiguous`: the endpoint's lookup key has multiple active candidate links (`resolution_status='candidate'` or `'ambiguous'`). The response carries `unresolvedFromName` (or `unresolvedToName`) and lists the candidate identities.

`unresolved`: the endpoint's lookup key has no active link (Phase C has not run for this entity, or it is genuinely unknown). The response carries the raw name only.

`inferred`: a confident heuristic resolution exists but was not promoted to `resolved` (e.g. cosine similarity threshold). The response includes a warning so agents can override.

Reciprocity: §Relation Vocabulary Registry surfaces both `sourceRelationType` and `semanticRelationType` per relation row. Reciprocal-pair semantics (`succeeded_by` ↔ `predecessor_of`, etc.) are a registry concept; whether to surface a derived reciprocal edge when the reverse is not stored in `shared_memory` is a future API decision. Pass 2.0 only surfaces stored relation rows.

The Phase A dry-run report lists relation endpoints whose lookup keys do NOT resolve to exactly one identity, so reviewers can choose between (a) recording an explicit assertion that two distinct entities share a name, (b) merging the entities, or (c) leaving the endpoint unresolved indefinitely. None of these actions are taken by Phase C automatically.

## Embeddings And Indexing

Verified by code review (2026-04-30): the vector index is keyed by `vector_rowid` (auto-assigned by sqlite-vec at insert), with `embedding_json` cached redundantly in `vec_index` per `memory_id`. **There is no content-hash-based reuse layer today.**

Phase D backfill therefore creates new observation rows that force new embedding generation. See §Decisions D9 for the regeneration policy (forced, opt-in, audited, resumable, rate-limited, never a startup side effect).

`graph_lookup_keys` continues to index source rows (memory_id-keyed), regenerated by `replaceGraphLookupIndexForMemory()` whenever a source row changes. Identity lookup is performed at read time by joining `graph_lookup_keys` with `entity_lookup_identity_links`. Pass 2.0 does not change `graph_lookup_keys` schema or write paths.

## Transition And Compatibility

Existing tools remain stable.

`read_graph` remains legacy.

`search_entities` remains search.

`get_entity_context` is additive and versioned by response `schemaVersion`.

Agent sessions may need reconnect or tool refresh after deployment to see new tool schemas.

During migration, writes should preserve legacy rows and add identity/facet mappings rather than rewriting source data in place.

## Rollback

Every Phase C execute requires:

Full DB snapshot id or verified backup reference.

`pass2_phase_c` `neural_audit_log.id` (the audit row that "owns" the batch).

Dry-run canonical-form `content_hash` (linking back to the Phase A artifact).

List of inserted identity, facet, and link row ids (recorded in audit-log rows or in a side log; the rows themselves are queryable by `source_audit_id`).

Rollback operation that deactivates the rows created by the batch (sets `status='deactivated'` on identities, facets, AND links — codex flagged that all three must be deactivated together).

No original source row deletion in Phase A, Phase B, or Phase C.

Soft rollback (`status='deactivated'`) is the default. Hard delete is only allowed in an explicit `pass2_cleanup` operation with its own dry-run + reviewer sign-off.

Rollback must be tested in a non-production database before Phase C is executed against live data.

## Acceptance Tests

### Identity And Context

`get_entity_context` for `neural-ai-collaboration` returns the Pass 1.x state-summary observation, the Pass 2.0 next-action observation, and the closed-projects-are-first-class-knowledge design-principle observation, without duplicate embedded/materialized prose.

`get_entity_context` for `houston-blenders-orchestrator` returns one identity with `lifecycleStatus='closed'`, 19 facets, any stored `SUCCEEDED_BY` relation row mapped to `semanticRelationType='succeeded_by'`, and lesson-learned observations — all surfaced by default (no lifecycle filter).

`get_entity_context` for `houston-blenders-orchestrator` with `excludeLifecycleStatus: ['closed']` excludes the identity from `candidates` and surfaces a `LIFECYCLE_EXCLUDED_CANDIDATES` warning rather than silently returning empty.

`get_entity_context` for `mike-bot` returns any reciprocal `PREDECESSOR_OF` relation row mapped to `semanticRelationType='predecessor_of'`, allowing successor-side navigation to predecessor knowledge. If the reciprocal row does not exist in `shared_memory`, the response surfaces only the inbound `SUCCEEDED_BY` from `houston-blenders-orchestrator → mike-bot` (no derived edges in Pass 2.0).

`get_entity_context` for an ambiguous canonical key returns candidates and warnings in `resolution.candidates`, not a silent best guess.

`observationKindFilter: ['lesson-learned']` returns only lesson-learned observations across the resolved identity, including from closed lifecycle.

`get_entity_context` works BEFORE Phase C writes have occurred for an entity. With no rows in `entity_lookup_identity_links` for the queried lookup, the response falls back to legacy exact lookup, surfaces `identity.id=null` and `phase='B'`, and lists candidates/warnings rather than failing.

### Schema And Constraints

`idx_identity_lookup_links_one_resolved` prevents two active resolved links for the same `(tenant_id, lookup_key, memory_type, memory_id)`. Attempting to insert a second active resolved link for the same source-row tuple fails with a UNIQUE constraint violation. Multiple active candidate (`resolution_status IN ('candidate','ambiguous')`) links for the same tuple are allowed.

`idx_facets_active_source_hash` prevents duplicate active facets for `(tenant_id, source_row_id, content_hash)`.

`idx_entity_identities_active_canonical` prevents two active identities for the same `(tenant_id, canonical_key, entity_type)`.

`CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))` rejects out-of-range confidence on insert.

Reindex boundary: calling `replaceGraphLookupIndexForMemory()` for a source row deletes/regenerates `graph_lookup_keys` rows for that source row but does NOT delete `entity_lookup_identity_links` rows. Identity assertions survive reindex.

Stale-link detection: a verification path (periodic or on-demand) finds links whose `(lookup_key, memory_type, memory_id)` no longer has a matching `graph_lookup_keys` row and either deactivates the link with an audit-log row, or surfaces it for manual review. Stale links surfacing in `get_entity_context` produce an integrity warning, not a hard failure.

### Dry-Run And Migration

Dry-run for duplicate canonical groups does not mutate `shared_memory`, `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`, `graph_lookup_keys`, the sqlite-vec embedding tables, or any other table aside from inserting one `pass2_dry_run` row in `neural_audit_log`. Row counts on all other tables are byte-identical before and after.

Re-running the dry-run against the same database snapshot produces a byte-identical canonical-form report (canonical-form `sha256` matches across reruns; the full report's `generatedAt` and other ephemeral fields differ but are stripped for hashing).

Dry-run report includes per-row evidence (`rows[]`) for every duplicate-canonical-key group, with all mandatory fields populated: `sourceRowId`, `createdBy`, `createdAt`, `entityType`, `contentHash`, `firstObservationExcerpt`, `observationCount`, `relationEndpointCount`, `metadataSource`, `proposedAction`. For groups where `normalization_collapses_distinct_raw_names` triggered, the dry-run includes `proposedSplit: [...]` describing the recommended sub-groups.

Phase A is read-only beyond the single `pass2_dry_run` audit row. Phase C execute is idempotent against a fixed dry-run canonical-form hash. Re-execution produces zero net changes (no duplicate active rows in any of the three Pass 2.0 tables, due to the partial unique indexes).

Phase C refuses to execute if the live canonical-form report hash drifts from the recorded `content_hash` in the `pass2_dry_run` audit row.

Phase C rollback (soft) reverses identity, facet, AND link rows to `status='deactivated'` together. Deactivating only identities/facets without links would surface dead identities in lookups; the rollback acceptance test verifies that all three tables' active-row counts return to pre-batch values.

### Cursors, Resolution, And Schema

Per-section cursors work independently: paging `observations` does not advance `relations` or `facets`. Each section's `nextOffset` is consistent with its own `items.length`.

Links below `confidence < 0.5` never resolve a query silently; they appear only in `resolution.candidates`.

Per-endpoint relation resolution: `fromResolutionStatus` and `toResolutionStatus` are set independently per relation row. When one endpoint resolves and the other does not, the response carries the resolved `identity_id` plus the unresolved raw name plus a warning.

Multiple distinct identities matching the same query (each via their own source-row tuple) trigger `AMBIGUOUS_LOOKUP`. Multiple resolved links for the SAME source-row tuple are impossible by constraint (`idx_identity_lookup_links_one_resolved`).

`sourceRelationType` and `semanticRelationType` are both surfaced for every relation in `get_entity_context.relations.items[]`. `sourceRelationType` matches the verbatim `shared_memory.content.relationType` value. `semanticRelationType` is the registry-mapped value (or `null` for unmapped types). `mappingConfidence`, `mappingSource`, and `registryVersion` are present.

### Compatibility And Operations

`search_entities` exact/default indexed lookup remains comparable to Pass 1.2 timing for common queries. (Performance budget: p50/p95 targets to be set against benchmarks; placeholder until measured.)

`read_graph` legacy shape remains unchanged. The three new Pass 2.0 tables are NOT included in `read_graph` output. Consumers that need identity/facet/link state call `get_entity_context`.

Relation endpoints with ambiguous or absent identity links surface as `ambiguous` or `unresolved` in `resolution_status` rather than guessed.

No `PRAGMA foreign_keys` change is required by Pass 2.0. The system continues to operate without FK enforcement (matching existing convention).

Cross-tenant isolation: identities, facets, and links from one tenant never appear in another tenant's `get_entity_context` response. Fallback paths (legacy exact lookup, candidate enumeration) all filter by `tenant_id`. A leak-test agent reading from `tenant=A` while another tenant's data exists under `tenant=B` returns zero rows from B's identity layer.

New MCP tool schemas include reconnect/refresh deployment notes (Pass 1.2 caveat: stale schemas in already-open agent sessions).

## Decisions

The reviewers (codex, codex-desktop) and Tommy converged on these design choices during the 2026-04-29 → 2026-04-30 ADR review. They are no longer open questions.

### D1: Identity ID Format

Identity ids use prefixed ULIDs: `ident_<26-char-ulid>`.

Rationale: ULIDs sort chronologically, prefix `ident_` makes ids self-describing in logs and dry-run reports, fixed length supports stable column widths. Aliases, facets, links, edges, batches, and batch items follow the same prefix convention (`alias_`, `facet_`, `link_`, `edge_`, `batch_`, `bitem_`).

### D2: Latest-Observation Timestamp Semantics

`get_entity_context` sorts observations by row `created_at` DESC by default.

`metadata.observedAt` is an optional ISO-8601 override that takes precedence over `created_at` for sorting and for the `timestamp` field in the response.

When `observedAt` is present, the response carries both `timestamp` (= `observedAt`) and `recordedAt` (= row `created_at`), so agents can distinguish when a fact was true from when it was recorded. Historical backfills must set `metadata.observedAt` explicitly.

### D3: Closed Projects Are First-Class Knowledge

`lifecycle_status` is a first-class field on `entity_identities`, ORTHOGONAL to row status, classification, and resolution_status.

`get_entity_context` does NOT filter by lifecycle by default. Closed projects surface fully with their lifecycle label visible.

Optional `excludeLifecycleStatus` input lets callers scope to specific lifecycles. Excluded candidates surface in `resolution.lifecycleExcluded` with a `LIFECYCLE_EXCLUDED_CANDIDATES` warning, never silently disappear.

Source: Tommy, 2026-04-29 ADR review. Captured as `metadata.kind='design-principle'` observation `e0c6dca9-30d2-40fd-9ce5-0fd5e3fe8537` on `neural-ai-collaboration` with `principle_name='closed-projects-are-first-class-knowledge'`.

### D4: Soft Rollback Is The Default

No code path may issue `DELETE FROM` against any of the three Pass 2.0 tables (`entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`) outside of an explicit `pass2_cleanup` operation (recorded in `neural_audit_log`) that has its own dry-run report and reviewer sign-off.

Phase C rollback uses `status='deactivated'` plus `deactivated_at`/`deactivated_by`. `shared_memory` is never deleted.

### D5: Phase Order Is Read-Only First

Phase A (read-only inventory + dry-run) and Phase B (read-only `get_entity_context` over legacy rows + projections) ship before Phase C (identity, facet, and lookup-identity link writes). Phase D (universal inline backfill) and Phase E (deprecation/cleanup) follow.

The phase letters in this ADR are a hard contract: an implementation that creates identity rows before Phase B is deployed deviates from the architecture.

### D6: Writes Stay In Existing Tools

`get_entity_context` is read-only. Mutations remain in `add_observations`, `create_entities`, `create_relations`, and any future structured write tools. Agents that need to write call those tools, not the context API.

A future ADR may revisit this if a "context-aware write" pattern emerges, but Pass 2.0 does not scope it.

### D7: A2.1 Three-Table Minimal Schema (Locked Round-2 Architecture)

Pass 2.0 adds exactly three tables: `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`. No FOREIGN KEY constraints are declared. No `PRAGMA foreign_keys = ON` change is required. Migration audit reuses `neural_audit_log` (no `migration_batches` or `migration_batch_items` tables). Relations remain in `shared_memory(memory_type='relation')` with read-time identity resolution. Aliases are resolved at read time by joining `graph_lookup_keys` (existing, regenerated freely) with `entity_lookup_identity_links` (new, durable). The relation vocabulary is a code/config registry, not a database constraint.

Source: round-2 review by codex-desktop (message `fe2897ef-6ce6-407d-96ca-d0a666da76d3`) and codex (message `a3a89875-684d-43d2-b4c8-893427bfbc7a`), both 2026-04-30. The reindex-wipe finding at `src/unified-server/memory/index.ts:3360` (`replaceGraphLookupIndexForMemory()` does `DELETE FROM graph_lookup_keys WHERE tenant_id=? AND memory_id=?` then re-inserts) was load-bearing for rejecting the original A2 proposal. See §Alternatives Considered.

### D8: Phase B Identity ID Discipline (No Fake ULIDs)

Phase B (read-only `get_entity_context` over legacy rows) does NOT invent identity_ids that look like `ident_<ULID>`. The original ADR draft proposed projected `ident_proj_<...>` ids derived deterministically from the dry-run report hash; this is dropped because:

(a) it pollutes the ULID namespace with non-real ids, and

(b) agents that bookmark a Phase-B id and call back after Phase C has executed would 404 on a different real ULID.

Phase B response shape:

When Phase A has run and a dry-run projection is available but Phase C has not executed, the response carries `phase: 'B'` and `identity.id: null`, and surfaces the canonical_key + classification candidate in the `resolution` block. Agents are explicitly told (via response field and via §Agent Context API documentation) not to persist `identity.id` when `phase='B'` and `id=null`.

When Phase C has executed for a given canonical_key, the response uses the persisted `identity_id` and carries `phase: 'C'`. The shape difference is exactly two fields: `phase` and `identity.id`. Agents do not branch on phase for normal use.

### D9: Embedding Regeneration For Phase D (Forced, Audited, Resumable)

Confirmed by code review: sqlite-vec virtual table rows are keyed by auto-assigned `vector_rowid`; embedding cache (`embedding_json`) lives in `vec_index` per `memory_id`, not per content hash. There is no content-hash-based embedding reuse layer today.

Pass 2.0 closes this question as: **Phase D requires explicit, resumable, rate-limited embedding regeneration. A content-hash reuse layer is future work and is NOT a Pass 2.0 precondition.**

Phase D constraints:

- Opt-in batch run (operator-initiated; not automatic).
- Audited: every batch produces a `neural_audit_log` row with `operation='pass2_phase_d'`, `target_count=<row count>`, `content_hash=<sha256 of input set>`.
- Resumable after partial failure: each materialized observation row records its embedding generation status; a Phase D rerun against the same input set skips already-embedded rows.
- Rate-limited: configurable max embeddings per minute, configurable concurrency.
- Never a startup side effect: no boot-time embedding regeneration.

Phase D is gated on Phase C completion plus operator approval. A future ADR may add content-hash reuse to amortize cost; until then, Phase D is the canonical path.

### D10: Lifecycle Assertion Mechanism

`lifecycle_status` on `entity_identities` is set at identity creation time. It is NEVER inferred heuristically from source row content; it is asserted explicitly by an agent or human.

Mechanism: a `metadata.kind='lifecycle-assertion'` observation, written via `add_observations`, with the following shape:

```json
{
  "entityName": "<canonical_key>",
  "kind": "lifecycle-assertion",
  "metadata": {
    "lifecycle_status": "closed",
    "lifecycle_source": "tommy-asserted-2026-04-29",
    "appliesTo": ["<canonical_key>"],
    "rationale": "Optional human-readable explanation"
  },
  "contents": ["<canonical_key> lifecycle_status set to closed by ..."]
}
```

The Phase A dry-run tool reads `lifecycle-assertion` observations for each canonical_key in the duplicate-canonical-key set. If multiple assertions exist, the most recent (by `created_at`, or by `metadata.observedAt` override) wins. If no assertion exists, the proposed identity ships with `lifecycle_status='unknown'` and Phase C creates the row with `lifecycle_status='unknown'`. An assertion can be added later (the row is updated via `ON CONFLICT … DO UPDATE` or via a `pass2_supersede` operation if the lifecycle change is significant).

Future addition (out of scope for Pass 2.0): a dedicated `assert_lifecycle({entityName, lifecycle_status, rationale})` tool. For now, the `add_observations` path with `kind='lifecycle-assertion'` is the canonical mechanism.

## Open Questions

Should facet summaries be generated during Phase C migration (cheaper read, larger batch cost) or lazily during context reads (smaller migration, slower first read)? Reviewer input welcome.

What is the maximum token budget default for `get_entity_context`? The current placeholder is `8000`; reviewer input on a real-world default is welcome.

Should source row compaction happen only in response rendering, or should compact summaries be stored as facet metadata for repeated reads?

What are the performance budget targets for `get_entity_context` and the Phase A dry-run on live-size data? Codex flagged this in round-2; specific targets (p50/p95 latency per section, max candidate fanout, max relation traversal depth) are still to be set against benchmarks rather than guessed.

## Next Steps

Both round-2 reviewers (codex, codex-desktop) have signed off on A2.1 with codex's stricter resolved-link uniqueness rule. Lock is in place.

Implement Phase A (read-only inventory tool + dry-run report producer) and run the dry-run against live data. Produce a versioned dry-run JSON artifact whose canonical-form sha256 will be referenced by the first `neural_audit_log` row with `operation='pass2_dry_run'`.

Then implement Phase B (read-only `get_entity_context` over legacy rows + Phase A projections, per §D8). Acceptance tests in §Acceptance Tests must pass against live data using projections only.

Do not implement Phase C (writes to `entity_identities`, `entity_context_facets`, `entity_lookup_identity_links`) before reviewers have signed off on a Phase A dry-run report whose hash will be referenced by the first `pass2_phase_c` audit row.

Round-2 review messages: `fe2897ef-6ce6-407d-96ca-d0a666da76d3` (codex-desktop, 2026-04-30T02:49:46Z) and `a3a89875-684d-43d2-b4c8-893427bfbc7a` (codex, 2026-04-30T03:18:29Z). Round-1 messages `c8bf0f3b` and `e688e6a3` are superseded.
