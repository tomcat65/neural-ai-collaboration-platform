<script setup lang="ts">
// Backups (PORT). Create + list full-DB snapshots (one self-contained .db file,
// vectors included), show backup locations + free space, and IMPORT a logical backup
// JSON (additive — INSERT OR IGNORE, existing ids skipped). Snapshot + import are
// non-destructive. (Full-DB restore is the nuclear op — see the Danger Zone panel.)
import { ref } from 'vue'
import { useDataStewardStore, type LogicalBackup } from '@/stores/data-steward'
import ConfirmDialog from '@/components/data-steward/ConfirmDialog.vue'

const store = useDataStewardStore()
const label = ref('')

// Logical import (upload a previously-downloaded backup JSON).
const fileInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<LogicalBackup | null>(null)
const importError = ref<string | null>(null)
const importResult = ref<string | null>(null)

function fmtBytes(n?: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}
function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
async function snapshotNow() {
  try {
    await store.createSnapshot(label.value.trim() || 'manual')
    label.value = ''
  } catch {
    /* surfaced via store.error */
  }
}

function pickFile() {
  importError.value = null
  importResult.value = null
  fileInput.value?.click()
}
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text()) as LogicalBackup
    if (!parsed || typeof parsed.schemaVersion !== 'number') {
      importError.value = 'Not a valid backup file (missing schemaVersion).'
      return
    }
    pendingImport.value = parsed
  } catch {
    importError.value = 'Could not parse that file as JSON.'
  }
}
function importCounts(b: LogicalBackup): string {
  const c = b.counts
  return c
    ? `${c.entities ?? 0} entities, ${c.observations ?? 0} observations, ${c.relations ?? 0} relations`
    : 'logical backup'
}
async function confirmImport() {
  if (!pendingImport.value) return
  try {
    const r = await store.importBackup(pendingImport.value)
    const ins = (r.inserted ?? {}) as Record<string, number>
    const skip = (r.skipped ?? {}) as Record<string, number>
    const skipped = (skip.entities ?? 0) + (skip.observations ?? 0) + (skip.relations ?? 0)
    const errs = (r.errors ?? []) as string[]
    importResult.value =
      `Imported ${ins.entities ?? 0} entities, ${ins.observations ?? 0} observations, ${ins.relations ?? 0} relations` +
      (skipped ? ` (${skipped} skipped as already present)` : '') +
      (errs.length ? ` · ${errs.length} row error(s)` : '') +
      '.'
  } catch {
    /* surfaced via store.error */
  } finally {
    pendingImport.value = null
  }
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="lens">PORT</span>
      <span class="title">Backups</span>
      <span class="count">{{ store.snapshots.length }} snapshot{{ store.snapshots.length === 1 ? '' : 's' }}</span>
    </header>

    <div class="actions">
      <input v-model="label" class="label-in" type="text" placeholder="label (e.g. pre-prune)" />
      <button class="snap-btn" :disabled="store.busy === 'snapshot'" @click="snapshotNow">
        {{ store.busy === 'snapshot' ? 'Snapshotting…' : 'Snapshot now' }}
      </button>
    </div>

    <div class="import-row">
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-file" @change="onFile" />
      <button class="import-btn" :disabled="!!store.busy" @click="pickFile">Import backup (JSON)…</button>
      <span v-if="importError" class="import-msg err">{{ importError }}</span>
      <span v-else-if="importResult" class="import-msg ok">{{ importResult }}</span>
    </div>

    <ul class="snap-list">
      <li v-for="s in store.snapshots" :key="s.snapshotId" class="snap">
        <span class="snap-name" :title="s.filename">{{ s.label }}</span>
        <span class="snap-meta">{{ fmtBytes(s.sizeBytes) }} · {{ fmtDate(s.createdAt) }} · {{ s.locationLabel || s.location }}</span>
      </li>
      <li v-if="store.snapshots.length === 0" class="empty">No snapshots yet — create one to back up the whole store.</li>
    </ul>

    <div class="locations">
      <div class="loc-title">Locations</div>
      <div v-for="l in store.locations" :key="l.id" class="loc">
        <span>{{ l.label }}</span>
        <span class="loc-free">{{ fmtBytes(l.freeBytes) }} free{{ l.writable ? '' : ' · read-only' }}</span>
      </div>
    </div>

    <ConfirmDialog
      :open="!!pendingImport"
      tone="normal"
      title="Import this backup?"
      message="Adds these records to the live store. Existing entries with the same id are skipped (never overwritten)."
      confirm-label="Import"
      :busy="store.busy === 'import'"
      @confirm="confirmImport"
      @cancel="pendingImport = null"
    >
      <div v-if="pendingImport" class="dlg-body">
        <div class="dlg-counts">{{ importCounts(pendingImport) }}</div>
        <div class="dlg-schema">schemaVersion {{ pendingImport.schemaVersion }}</div>
      </div>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--cc-surface-1); border: 1px solid var(--cc-border); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--cc-surface-2); border-bottom: 1px solid var(--cc-border); }
.lens { font-size: calc(0.54rem * var(--cc-font-scale, 1)); font-weight: 800; letter-spacing: 0.12em; padding: 0.1rem 0.35rem; border-radius: 3px; color: #11151c; background: var(--cc-green); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.82rem * var(--cc-font-scale, 1)); font-weight: 600; color: var(--cc-text); }
.count { margin-left: auto; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.actions { display: flex; gap: 0.4rem; padding: 0.5rem; }
.label-in { flex: 1; padding: 0.4rem 0.55rem; background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; color: var(--cc-text); font-size: calc(0.7rem * var(--cc-font-scale, 1)); }
.label-in:focus { outline: none; border-color: var(--cc-green); }
.snap-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.7rem; border-radius: 4px; cursor: pointer; background: var(--cc-green-dim); color: var(--cc-green); border: 1px solid var(--cc-green); white-space: nowrap; }
.snap-btn:disabled { opacity: 0.6; cursor: default; }
.snap-list { list-style: none; margin: 0; padding: 0 0.5rem; overflow-y: auto; max-height: 260px; }
.snap { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.4rem 0.5rem; border: 1px solid var(--cc-border); border-radius: 5px; background: var(--cc-surface-2); margin-bottom: 0.3rem; }
.snap-name { font-weight: 600; color: var(--cc-text); font-size: calc(0.74rem * var(--cc-font-scale, 1)); }
.snap-meta { font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.empty { padding: 0.6rem 0.5rem; color: var(--cc-text-muted); font-size: calc(0.7rem * var(--cc-font-scale, 1)); font-style: italic; list-style: none; }
.locations { padding: 0.5rem; border-top: 1px solid var(--cc-border); margin-top: auto; }
.loc-title { font-size: calc(0.58rem * var(--cc-font-scale, 1)); text-transform: uppercase; letter-spacing: 0.08em; color: var(--cc-text-muted); margin-bottom: 0.3rem; }
.loc { display: flex; justify-content: space-between; font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); padding: 0.15rem 0; }
.loc-free { color: var(--cc-text-muted); }
.import-row { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.5rem 0.5rem; flex-wrap: wrap; }
.hidden-file { display: none; }
.import-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.7rem; border-radius: 4px; cursor: pointer; background: var(--cc-cyan-dim); color: var(--cc-cyan); border: 1px solid var(--cc-cyan); white-space: nowrap; }
.import-btn:disabled { opacity: 0.6; cursor: default; }
.import-msg { font-size: calc(0.62rem * var(--cc-font-scale, 1)); line-height: 1.4; }
.import-msg.err { color: var(--cc-red); }
.import-msg.ok { color: var(--cc-green); }
.dlg-body { display: flex; flex-direction: column; gap: 0.3rem; }
.dlg-counts { font-weight: 600; color: var(--cc-text); font-size: calc(0.74rem * var(--cc-font-scale, 1)); }
.dlg-schema { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
</style>
