# PLAN — Dashboard Redesign, Phase 2: Data Steward console

Status: **SPEC FOR SIGN-OFF** (codex + Tomás). **No UI is built until this is approved.**
Written per codex pushback `24474897` ("a human-facing destructive/restorative UI needs a
spec + review gate; ENABLE_DATA_MANAGEMENT=1 plus curl-green is not sufficient") and Tomás's
reframe: the dashboard is the **human custodian console** over an agent-owned memory store.

Supersedes PR #31 (closed): its activity overview is rebuilt here as the `/activity` tab,
with the drill-down done right (§8).

**Rev 2** (2026-06-01): revised to clear codex `0f32c9fb` — durable **server-side Trash** (§5),
explicit-`entityNames`-only deletes (§4), full-DB restore pre-snapshot + post-verify (§4/§8),
Audit graceful-when-unavailable (§6), and an interim-status note for the already-live flag (§2.1).

---

## 1. Purpose

Engram is an **agent-owned** memory store. The dashboard is the **human's custodian console**.
Primary jobs, in priority order:
1. **SEE** — a browsable inventory of what's inside.
2. **CURATE** — back up, delete, restore entities (lifecycle control).
3. **PORT** — back up the whole DB and stand Engram up on another machine.

The activity overview (Phase 1: Pulse / Needs-You / Project Digest) is demoted from the
landing page to a secondary `/activity` tab.

---

## 2. Scope

**IN:** a new **Data Steward** surface (primary route `/`) over the server data-management API
(`/api/data/*`), **plus a small server addition: a durable server-side Trash** (§5). Areas:
**Library** (see), **Backups** (snapshot / port), **Trash** (delete + restore), **Import/Export**
(logical), **Audit** (what was done). Router re-org (§8). Rebuild the Phase-1 activity overview
as `/activity` incl. the drill-down fix + regression test.

**OUT (explicitly):** no `retired_at` soft-delete column threaded through the hot read paths
(the Trash is an isolated logical-backup store, §5); no LLM; no broad/prefix delete (§4).
External-drive (D:) snapshots via the API remain a **follow-up** (needs `/host-drives` mounted +
`BACKUP_AUTODISCOVER`); v1 snapshots land in the internal volume and are copy-out-able (per
`BACKUP-AND-RESTORE.md`).

### 2.1 Interim status (this PR is not pure spec) — B4

`ENABLE_DATA_MANAGEMENT=1` is **already live** (commit `8d70f8c`, running now) so the contract
could be verified against the real server (§3). **Interim guardrails until the Steward UI +
server Trash ship and are reviewed:** this is a single-user **local** tool; the only client is
the dashboard, which has **no destructive Steward UI yet**, so the only way to reach a
destructive endpoint is a deliberate operator API/curl call; every op is audit-logged; authz is
the local single-key operator. If preferred, the flag commit can be **reverted now and
re-applied at build time** — offered as an option for Tomás.

---

## 3. Server contract — VERIFIED LIVE

Feature flag `ENABLE_DATA_MANAGEMENT=1` (committed `8d70f8c`, running now). Authz gate: the
**local single-key operator** is authorized once the flag is on. **Every** op writes
`neural_audit_log`. Verified by live curl on 2026-06-01:

| Endpoint | Behavior | Verified |
|---|---|---|
| `GET /api/data/entity-prefixes` | inventory by name-prefix | ✓ returns the full prefix list (incl. fixtures) |
| `GET /api/data/export?namePrefix=\|entityNames=[&preview=true]` | logical JSON: entities+observations+relations; `preview` = counts+names | ✓ `engram` → entities 3 / obs 111 / rel 7 |
| `POST /api/data/import {backup}` | `INSERT OR IGNORE`, server re-embeds vectors | (code-verified; exercised in 2b tests) |
| `DELETE /api/data/retire {entityNames, backupFirst, reason}` | **HARD-deletes** graph rows; auto-exports first; **returns the backup** | (code-verified) |
| `POST /api/data/snapshots {label,locationId,folder}` | online `.backup()` → ONE self-contained `.db` (incl. vectors) | ✓ created 296 MB file, listed |
| `GET /api/data/snapshots` | list (from manifest) | ✓ |
| `POST /api/data/snapshots/:id/move {locationId}` | relocate (e.g., external drive) | (location config required) |
| `POST /api/data/snapshots/:id/restore {confirm:true}` | restore the **whole DB** | (code-verified; danger-zone, §4) |
| `DELETE /api/data/snapshots/:id` | delete a snapshot | (code-verified) |
| `GET /api/data/backup-locations` | locations | ✓ internal volume, 941 GB free |

DB facts: single file `unified-platform.db` (~296 MB, WAL); sqlite-vec embedded → one-file
snapshot = full portable backup incl. vectors; `tenants.db` empty → single file is the store.

---

## 4. UX safety rules (codex gate)

- **Read & backup are always safe** (export, snapshot-create, list, audit) — no confirm.
- **Every destructive/restorative action is gated**: delete (retire), restore (full-DB),
  import, purge-trash, snapshot-delete.
- **Preview before commit, wherever the API allows**: a delete shows the export **preview
  (exact counts of entities/observations/relations to be removed)** before retiring; import
  shows incoming counts before applying; restore shows snapshot metadata + a "this replaces
  the live DB" warning.
- **Typed confirmation** for the heavy/irreversible-ish ones: full-DB restore, purge-trash,
  and any multi-entity retire (type the entity count or the word DELETE).
- **Auto-backup before delete is mandatory** — the UI always sends `backupFirst:true`; the
  returned backup becomes a Trash entry (§5).
- **Delete operates on an explicit, user-selected `entityNames` list ONLY.** There is **no
  prefix/bulk delete action** in v1 — name-prefix is used for *export/preview* only, never to
  delete. (B2)
- **Full-DB restore is quarantined** in a visually distinct "Danger Zone": it (1) takes a
  **pre-restore auto-snapshot** of the current DB first (durable undo), (2) restores, (3) runs
  **post-restore verification** (`PRAGMA integrity_check` + `/health`) and surfaces the result;
  on failure it points the user at the pre-restore snapshot to roll back. (B5)

---

## 5. Delete + restore model — durable server-side Trash (B1)

Per Tomás + codex: client-side localStorage is **not** durable enough to hold the only copy of a
hard-deleted entity. v1 adds a **small, durable, server-side Trash** — its **own server PR with
codex review** (build step 2b-server, §11).

**New server surface (in the data-management module):**
- A `data_trash` store (one table) holding, per trashed set:
  `{ trashId, retiredAt, reason, counts, backup }`, where `backup` is the logical export
  (entities + observations + relations).
- **Atomic retire.** `DELETE /api/data/retire` writes the logical backup into `data_trash`
  **and verifies that write succeeded BEFORE** hard-deleting the live rows. If the trash write
  fails, the retire **aborts** — there is no delete without a persisted backup. (This is codex's
  "backup persistence verified before retire.")
- `GET /api/data/trash` — list entries (metadata + counts; not the full payload).
- `POST /api/data/trash/:id/restore` — re-import the stored backup (`INSERT OR IGNORE`, server
  re-embeds), then remove the entry.
- `DELETE /api/data/trash/:id` — purge (permanent).
- Every trash op writes `neural_audit_log`.

**Why a logical-backup store, not a `retired_at` soft-delete column:** soft-delete would force a
`retired_at IS NULL` filter through every hot read path (broad, risky). A separate trash store is
**isolated** to the data-mgmt module and leaves the read paths untouched. *(Open for codex to
counter-propose soft-delete if it prefers that trade-off.)*

**Dashboard:** Delete → preview counts → confirm → atomic retire. A **Trash** tab lists entries
with **Restore** / **Purge**. No `localStorage` is load-bearing (at most a transient UI cache).

---

## 6. Auditability

Every `/api/data` op writes `neural_audit_log` (`data_export`, `data_import`, `data_retire`,
`trash_*`, `snapshot_create|move|delete|restore`, …). The Steward exposes an **Audit** view
reading `GET /admin/audit-log`. That endpoint is gated by `ENABLE_ADMIN_ENDPOINTS`, which is
**independent** of `ENABLE_DATA_MANAGEMENT`. (B3) If admin endpoints are off (audit endpoint
returns 403/404) while data-management is on, the Audit view shows a clear "audit log
unavailable — enable admin endpoints" state and the rest of the Steward works normally; the
Audit view is never load-bearing for the custody actions.

---

## 7. Feature-flag behavior (graceful degradation)

When `ENABLE_DATA_MANAGEMENT` is **off**, `/api/data/*` returns `403 DATA_MANAGEMENT_DISABLED`.
The Steward **must degrade gracefully**: show a clear "Data management is disabled — set
`ENABLE_DATA_MANAGEMENT=1` and redeploy" state, **not** a crash or a wall of errors. When on,
the local key is authorized. The UI handles both states (tested).

---

## 8. Router re-org + activity rebuild (supersedes #31)

- `/` → **DataSteward** (primary).
- `/activity` → the rebuilt activity overview (Pulse / Needs-You / Project Digest — restored
  from the `engram/dashboard-phase1-home` branch).
- `/command` → CommandCenter (existing drill-down).
- `/brain`, `/stream` → unchanged.

**Drill-down contract (closes codex's #31 blocker):** a project card calls
`router.push({ name: 'CommandCenter', query: { project } })`; `CommandCenter` reads
`route.query.project` on setup and activates that project's tab **before** its immediate
`activeTabName` watcher runs, so the scope ends at the incoming project (not "All Projects").
**Regression test:** `shallowMount(CommandCenter)` with `route.query.project='engram'` →
`store.activeProject === 'engram'`; with no query → `''`.

---

## 9. Acceptance criteria

- **Library:** lists entity prefixes; selecting one shows the export **preview (counts)**;
  "Export" downloads the JSON.
- **Backups:** "Snapshot now" creates a full-DB `.db` (listed with size); restore requires a
  typed confirm and shows the "replaces live DB" warning.
- **Trash:** selecting entities → "Delete" shows the pre-delete preview (counts) → confirm →
  `retire(backupFirst)` → a Trash entry appears → "Restore" re-imports → the entity reappears
  in the Library.
- **Flag off:** the Steward shows the graceful disabled state.
- **Drill-down:** clicking a project on `/activity` lands on `/command` scoped to it (regression test).

---

## 10. Failure modes

- Large retire-backup → file-download Trash fallback (§5).
- Restore of a stale/foreign snapshot → integrity warning (server restore + `PRAGMA integrity_check`).
- Snapshot disk-full / import `schemaVersion` mismatch → surfaced, not swallowed.
- **Deploy note:** a full `neural-unified-up` from clean `main` drops the flag **until `8d70f8c`
  merges**; until then the running container keeps it.

---

## 11. Build order (after sign-off)

- **2a (non-destructive UI):** data-API store module + Library + Snapshots/Export + Audit view
  + graceful-disabled state. Tests. *(No server change.)*
- **2b-server (durable Trash):** the server-side `data_trash` store + atomic retire-into-trash +
  list/restore/purge endpoints (§5), as its **own server PR with codex review**. Tests.
- **2b-ui (destructive UI):** Trash tab (delete→preview→confirm→restore/purge), Import, full-DB
  restore Danger Zone (pre-snapshot + post-verify) — each behind preview + confirm. Tests.
- **2c (re-org):** router re-org + rebuild `/activity` + the drill-down fix + regression test.

---

## 12. Sign-off

- [ ] codex — UX safety (§4), the **server-side Trash design** (§5: isolated logical-backup
  store; atomic retire with persistence verified before delete; list/restore/purge), full-DB
  restore pre-snapshot + post-verify (§4/§8), Audit graceful-when-unavailable (§6), feature-flag
  degradation (§7), drill-down contract (§8), interim guardrails (§2.1).
- [ ] Tomás — go.
