# PLAN — Dashboard Redesign, Phase 2: Data Steward console

Status: **SPEC FOR SIGN-OFF** (codex + Tomás). **No UI is built until this is approved.**
Written per codex pushback `24474897` ("a human-facing destructive/restorative UI needs a
spec + review gate; ENABLE_DATA_MANAGEMENT=1 plus curl-green is not sufficient") and Tomás's
reframe: the dashboard is the **human custodian console** over an agent-owned memory store.

Supersedes PR #31 (closed): its activity overview is rebuilt here as the `/activity` tab,
with the drill-down done right (§8).

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

**IN:** a new **Data Steward** surface (primary route `/`) that consumes the **existing**
server data-management API (`/api/data/*`). Areas: **Library** (see), **Backups** (snapshot /
port), **Trash** (delete + restore), **Import/Export** (logical), **Audit** (what was done).
Router re-org (§8). Rebuild the Phase-1 activity overview as `/activity` incl. the drill-down
fix + regression test.

**OUT (explicitly):** no new server endpoints (the API already exists, §3); no soft-delete
column (Trash uses the auto-backup model, §5); no LLM. External-drive (D:) snapshots via the
API are a **documented follow-up** (needs `/host-drives` mounted + `BACKUP_AUTODISCOVER`);
v1 snapshots land in the internal volume and are copy-out-able (per `BACKUP-AND-RESTORE.md`).

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
- **No broad/bulk deletes** in v1: retire requires an explicit selected `entityNames` list;
  there is **no "delete by prefix"** without first showing a preview + count and a typed confirm.
- **Full-DB restore is quarantined** in a visually distinct "Danger Zone" with a
  "snapshot-now-first" nudge.

---

## 5. Delete + restore model — Trash (no server change)

Delete = `retire(backupFirst:true)`: the server **hard-deletes** the rows and **returns the
logical backup** (entities+observations+relations). The dashboard turns that into a
restorable **Trash**:

- **Durability:** the returned backup JSON is persisted in **localStorage** for typical sizes,
  under a hard cap (≈4 MB). **If the backup exceeds the cap**, the UI instead **auto-downloads
  it as a `.json` file** and records a *file-backed* Trash entry (Restore then asks the user to
  re-select that file). This is the honest limit of the no-server-change model.
- **Restore** = `POST /api/data/import` with the stored backup (re-creates the entities; the
  server re-embeds). `INSERT OR IGNORE` means restore is idempotent.
- **Purge** = forget the Trash entry (delete the localStorage record / the file is the user's).
- **A durable, server-side trash** (a `retired_at` flag or a logical-backup store) is a future
  **server** enhancement, out of scope here.

---

## 6. Auditability

Every `/api/data` op already writes `neural_audit_log` (`data_export`, `data_import`,
`data_retire`, `snapshot_create|move|delete|restore`, …). The Steward exposes an **Audit**
view reading `GET /admin/audit-log` (already gated by `ENABLE_ADMIN_ENDPOINTS=1`, set in the
dev overlay) so the human can see exactly what was done, when, and by which key.

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

- **2a (non-destructive):** data-API store module + Library + Snapshots/Export + Audit view +
  the graceful-disabled state. Tests.
- **2b (destructive):** Trash (retire→restore), Import, full-DB restore Danger Zone — each
  behind preview + confirm. Tests.
- **2c (re-org):** router re-org + rebuild `/activity` + the drill-down fix + regression test.

---

## 12. Sign-off

- [ ] codex — UX safety rules (§4), Trash durability model (§5), feature-flag degradation (§7),
  auditability (§6), drill-down contract (§8), server-contract reading (§3).
- [ ] Tomás — go.
