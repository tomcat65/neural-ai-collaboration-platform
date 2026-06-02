// Data Steward store (Phase 2a — non-destructive). Wraps the server's
// data-management API (/api/data/*) for the human custodian console: SEE
// (entity prefixes), back up (logical export + full-DB snapshots), and audit.
//
// NON-DESTRUCTIVE ONLY: no retire/delete, no import, no full-DB restore here —
// those land in 2b-server / 2b-ui behind their own review (see
// docs/PLAN-Dashboard-Redesign-Phase-2-Data-Steward.md). Calls go through the
// dashboard's nginx proxy, which injects x-api-key.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ExportPreview {
  namePrefix?: string | null
  entityNames: string[]
  counts: { entities: number; observations: number; relations: number }
}
export interface Snapshot {
  snapshotId: string
  filename: string
  sizeBytes: number
  createdAt: string
  label: string
  location: string
  locationId?: string
  locationLabel?: string
}
/** A durable server-side Trash entry (metadata only — the backup payload is never listed). */
export interface TrashEntry {
  trashId: string
  retiredAt: string
  reason: string | null
  entityNames: string[]
  counts: { entities: number; observations: number; relations: number }
  restoredAt: string | null
}
/** A logical backup payload — the JSON produced by "Download backup" / the export API. */
export interface LogicalBackup {
  schemaVersion: number
  counts?: { entities: number; observations: number; relations: number }
  entities?: unknown[]
  observations?: unknown[]
  relations?: unknown[]
  [k: string]: unknown
}
export interface BackupLocation {
  id: string
  path: string
  label: string
  writable: boolean
  freeBytes?: number | null
  totalBytes?: number | null
}
// Audit rows are tolerant of shape (server schema may vary).
export interface AuditEntry {
  action?: string
  actor?: string
  details?: string
  at?: string
  [k: string]: unknown
}

/** Thrown when /api/data/* reports the feature flag is off. */
export class DataMgmtDisabled extends Error {
  constructor() {
    super('data management disabled')
    this.name = 'DataMgmtDisabled'
  }
}

export type Selection = { namePrefix?: string; entityNames?: string[] }

function selectionQuery(sel: Selection): string {
  if (sel.namePrefix) return `namePrefix=${encodeURIComponent(sel.namePrefix)}`
  return `entityNames=${encodeURIComponent((sel.entityNames || []).join(','))}`
}

export const useDataStewardStore = defineStore('data-steward', () => {
  // null = unknown (not probed yet); true = enabled; false = ENABLE_DATA_MANAGEMENT off.
  const available = ref<boolean | null>(null)
  const prefixes = ref<string[]>([])
  const preview = ref<ExportPreview | null>(null)
  const snapshots = ref<Snapshot[]>([])
  const locations = ref<BackupLocation[]>([])
  const auditEntries = ref<AuditEntry[]>([])
  const trash = ref<TrashEntry[]>([]) // durable server-side Trash (2b)
  // null = unknown; false = /admin/audit-log unreachable (admin endpoints/proxy off).
  const auditAvailable = ref<boolean | null>(null)
  const loading = ref(false)
  const busy = ref<string | null>(null) // label of an in-flight write (e.g. 'snapshot')
  const error = ref<string | null>(null)

  // GET that detects the disabled feature flag (403 DATA_MANAGEMENT_DISABLED).
  async function getJSON<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (res.status === 403) {
      let code = ''
      try {
        code = ((await res.clone().json()) as { code?: string })?.code || ''
      } catch {
        /* non-JSON 403 */
      }
      if (code === 'DATA_MANAGEMENT_DISABLED') {
        available.value = false
        throw new DataMgmtDisabled()
      }
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    if (available.value === null) available.value = true
    return (await res.json()) as T
  }

  // Mutating call (POST/DELETE) with the same disabled-flag detection as getJSON,
  // surfacing the server's error message (e.g. 404 "Trash entry not found").
  async function sendJSON<T>(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 403) {
      let code = ''
      try {
        code = ((await res.clone().json()) as { code?: string })?.code || ''
      } catch {
        /* non-JSON 403 */
      }
      if (code === 'DATA_MANAGEMENT_DISABLED') {
        available.value = false
        throw new DataMgmtDisabled()
      }
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`
      try {
        const j = (await res.clone().json()) as { error?: string }
        if (j?.error) msg = j.error
      } catch {
        /* non-JSON error body */
      }
      throw new Error(msg)
    }
    return (await res.json()) as T
  }

  async function fetchPrefixes(): Promise<void> {
    const data = await getJSON<{ prefixes: string[] }>('/api/data/entity-prefixes')
    prefixes.value = (data.prefixes || []).filter(Boolean)
  }

  async function fetchSnapshots(): Promise<void> {
    const data = await getJSON<{ snapshots: Snapshot[] }>('/api/data/snapshots')
    snapshots.value = data.snapshots || []
  }

  async function fetchLocations(): Promise<void> {
    const data = await getJSON<{ locations: BackupLocation[] }>('/api/data/backup-locations')
    locations.value = data.locations || []
  }

  /** Audit log lives at /admin/audit-log (separate ENABLE_ADMIN_ENDPOINTS gate).
   *  Degrades gracefully: any failure → auditAvailable=false (spec §6 / codex B3). */
  async function fetchAudit(): Promise<void> {
    try {
      const res = await fetch('/admin/audit-log?limit=100')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      const rows = Array.isArray(data) ? data : data.entries || data.auditLog || data.logs || []
      auditEntries.value = rows as AuditEntry[]
      auditAvailable.value = true
    } catch {
      auditEntries.value = []
      auditAvailable.value = false
    }
  }

  /** Count-only preview of a logical export (no payload). */
  async function exportPreview(sel: Selection): Promise<void> {
    preview.value = await getJSON<ExportPreview>(
      `/api/data/export?${selectionQuery(sel)}&preview=true`
    )
  }

  /** Download the full logical backup (entities+observations+relations) as JSON. */
  async function downloadExport(sel: Selection): Promise<void> {
    busy.value = 'export'
    error.value = null
    try {
      const res = await fetch(`/api/data/export?${selectionQuery(sel)}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `engram-export-${(sel.namePrefix || 'selection').replace(/[^a-z0-9_-]/gi, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      error.value = e?.message || 'export failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  /** Create a full-DB snapshot (server-side online .backup), then refresh the list. */
  async function createSnapshot(label?: string): Promise<Snapshot> {
    busy.value = 'snapshot'
    error.value = null
    try {
      const res = await fetch('/api/data/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || 'manual' }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const snap = (await res.json()) as Snapshot
      await fetchSnapshots()
      return snap
    } catch (e: any) {
      error.value = e?.message || 'snapshot failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  // ---- 2b: destructive Trash lifecycle (delete → trash → restore / purge) ----

  /** List the durable server-side Trash (metadata only — no payloads). */
  async function fetchTrash(): Promise<void> {
    const data = await getJSON<{ trash: TrashEntry[] }>('/api/data/trash')
    trash.value = data.trash || []
  }

  /**
   * Retire (soft-delete) explicit entity NAMES. The server writes a verified Trash
   * entry BEFORE hard-deleting, so this is recoverable via restoreTrash(). Refreshes
   * the Library + Trash views and clears the stale preview on success.
   */
  async function retire(
    entityNames: string[],
    reason?: string
  ): Promise<{ trashId: string; counts: { entities: number; observations: number; relations: number }; deleted: number }> {
    busy.value = 'retire'
    error.value = null
    try {
      const result = await sendJSON<{
        trashId: string
        counts: { entities: number; observations: number; relations: number }
        deleted: number
      }>('/api/data/retire', 'DELETE', { entityNames, reason })
      await Promise.all([fetchTrash(), fetchPrefixes()])
      preview.value = null
      return result
    } catch (e: any) {
      error.value = e?.message || 'retire failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  /** Restore a trashed set by trashId (re-imports its stored backup atomically). */
  async function restoreTrash(trashId: string): Promise<void> {
    busy.value = 'restore:' + trashId
    error.value = null
    try {
      await sendJSON('/api/data/trash/' + encodeURIComponent(trashId) + '/restore', 'POST')
      await Promise.all([fetchTrash(), fetchPrefixes()])
    } catch (e: any) {
      error.value = e?.message || 'restore failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  /** Permanently purge a trash entry — its backup is gone for good (no recovery). */
  async function purgeTrash(trashId: string): Promise<void> {
    busy.value = 'purge:' + trashId
    error.value = null
    try {
      await sendJSON('/api/data/trash/' + encodeURIComponent(trashId), 'DELETE')
      await fetchTrash()
    } catch (e: any) {
      error.value = e?.message || 'purge failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  // ---- 2b-ui.2: PORT-in (logical import) + full-DB restore Danger Zone ----

  /**
   * Import a logical backup (entities+observations+relations) into the live store.
   * Additive — the server uses INSERT OR IGNORE, so existing ids are skipped (never
   * overwritten). Refreshes the Library + Trash on success.
   */
  async function importBackup(backup: LogicalBackup): Promise<Record<string, unknown>> {
    busy.value = 'import'
    error.value = null
    try {
      const result = await sendJSON<Record<string, unknown>>('/api/data/import', 'POST', backup)
      // Best-effort refresh — a refresh failure must not mask a successful import.
      try {
        await Promise.all([fetchPrefixes(), fetchTrash()])
      } catch {
        /* best-effort refresh — the import already succeeded */
      }
      return result
    } catch (e: any) {
      error.value = e?.message || 'import failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  /**
   * Restore the ENTIRE database from a snapshot (the nuclear option). The server
   * integrity-checks the snapshot, saves a pre-restore safety backup, then closes /
   * copies / reopens the DB in-process (the store is briefly offline during the swap).
   * Because the whole store is replaced, we re-initialize every view on success.
   * Returns { restoredFrom, preRestoreBackup } so the UI can surface the safety backup.
   */
  async function restoreSnapshot(
    snapshotId: string
  ): Promise<{ restoredFrom: string; preRestoreBackup: string; refreshFailed: boolean }> {
    busy.value = 'restore-db'
    error.value = null
    try {
      const result = await sendJSON<{ restoredFrom: string; preRestoreBackup: string }>(
        '/api/data/snapshots/' + encodeURIComponent(snapshotId) + '/restore',
        'POST',
        { confirm: true }
      )
      // The restore itself has SUCCEEDED here. The post-swap refresh is BEST-EFFORT:
      // during the brief offline/reopen window a refresh GET can transiently fail. That
      // must NOT mask the successful restore or hide the preRestoreBackup undo handle —
      // so we always return the restore result, and report refreshFailed SEPARATELY so
      // the UI can show a "restored, but the views may be stale — reload" notice instead
      // of a failed-restore error.
      let refreshFailed = false
      try {
        await Promise.all([fetchPrefixes(), fetchSnapshots(), fetchLocations(), fetchTrash(), fetchAudit()])
      } catch {
        refreshFailed = true
      }
      return { ...result, refreshFailed }
    } catch (e: any) {
      error.value = e?.message || 'restore failed'
      throw e
    } finally {
      busy.value = null
    }
  }

  /** Initial load — probes the feature flag and loads the non-destructive views. */
  async function initialize(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await fetchPrefixes() // probes availability (may set available=false)
      await Promise.all([fetchSnapshots(), fetchLocations(), fetchAudit(), fetchTrash()])
    } catch (e: any) {
      if (e instanceof DataMgmtDisabled) {
        // available is already false → the view shows the disabled state.
      } else {
        error.value = e?.message || 'failed to load data management'
      }
    } finally {
      loading.value = false
    }
  }

  return {
    // state
    available,
    prefixes,
    preview,
    snapshots,
    locations,
    auditEntries,
    trash,
    auditAvailable,
    loading,
    busy,
    error,
    // actions
    initialize,
    fetchPrefixes,
    fetchSnapshots,
    fetchLocations,
    fetchAudit,
    exportPreview,
    downloadExport,
    createSnapshot,
    fetchTrash,
    retire,
    restoreTrash,
    purgeTrash,
    importBackup,
    restoreSnapshot,
  }
})
