<script setup lang="ts">
// Danger Zone (PORT — full-DB restore). The nuclear option: replace the ENTIRE live
// database with a chosen snapshot. The server integrity-checks the snapshot, saves a
// pre-restore safety backup, then closes / copies / reopens the DB (briefly offline).
// Gated by a typed RESTORE confirmation and quarantined from the safe panels.
import { ref, computed } from 'vue'
import { useDataStewardStore, type Snapshot } from '@/stores/data-steward'
import ConfirmDialog from '@/components/data-steward/ConfirmDialog.vue'

const store = useDataStewardStore()
const target = ref<Snapshot | null>(null)
const result = ref<{ restoredFrom: string; preRestoreBackup: string } | null>(null)

const restoring = computed(() => store.busy === 'restore-db')

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

async function confirmRestore() {
  if (!target.value) return
  try {
    result.value = await store.restoreSnapshot(target.value.snapshotId)
  } catch {
    /* surfaced via store.error */
  } finally {
    target.value = null
  }
}
</script>

<template>
  <section class="panel danger">
    <header class="panel-head">
      <span class="lens">DANGER</span>
      <span class="title">Restore entire database</span>
      <span class="count">{{ store.snapshots.length }} snapshot{{ store.snapshots.length === 1 ? '' : 's' }}</span>
    </header>

    <p class="warn">
      Restoring replaces the <b>entire live store</b> with the chosen snapshot. A pre-restore
      safety backup is saved first, and the store is briefly offline during the swap (connected
      agents may see errors for a moment).
    </p>

    <div v-if="result" class="result">
      ✓ Restored from <code>{{ result.restoredFrom }}</code>. Your previous state was saved as
      <code>{{ result.preRestoreBackup }}</code> in Backups — restore that to undo.
    </div>

    <ul class="snap-list">
      <li v-for="s in store.snapshots" :key="s.snapshotId" class="snap">
        <div class="snap-info">
          <span class="snap-name" :title="s.filename">{{ s.label }}</span>
          <span class="snap-meta">{{ fmtDate(s.createdAt) }} · {{ s.filename }}</span>
        </div>
        <button class="restore-btn" :disabled="!!store.busy" @click="target = s">Restore entire DB</button>
      </li>
      <li v-if="store.snapshots.length === 0" class="empty">No snapshots to restore from — create one in Backups first.</li>
    </ul>

    <ConfirmDialog
      :open="!!target"
      tone="danger"
      title="Restore the entire database?"
      message="This REPLACES the whole live store with this snapshot. It cannot be undone except by restoring the auto-saved pre-restore backup. The store goes briefly offline during the swap."
      confirm-word="RESTORE"
      confirm-label="Restore entire DB"
      :busy="restoring"
      @confirm="confirmRestore"
      @cancel="target = null"
    >
      <div v-if="target" class="dlg-body">
        <div class="dlg-snap">{{ target.label }}</div>
        <div class="dlg-meta">{{ target.filename }} · {{ fmtDate(target.createdAt) }}</div>
      </div>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--cc-surface-1); border: 1px solid var(--cc-red); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel.danger { box-shadow: inset 0 0 0 1px var(--cc-red-dim); }
.panel-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--cc-red-dim); border-bottom: 1px solid var(--cc-red); }
.lens { font-size: calc(0.54rem * var(--cc-font-scale, 1)); font-weight: 800; letter-spacing: 0.12em; padding: 0.1rem 0.35rem; border-radius: 3px; color: #fff; background: var(--cc-red); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.82rem * var(--cc-font-scale, 1)); font-weight: 600; color: var(--cc-red); }
.count { margin-left: auto; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.warn { margin: 0; padding: 0.55rem 0.8rem; font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); line-height: 1.5; border-bottom: 1px solid var(--cc-border); }
.warn b { color: var(--cc-red); }
.result { margin: 0.5rem 0.6rem 0; padding: 0.5rem 0.6rem; border: 1px solid var(--cc-green); background: var(--cc-green-dim, transparent); border-radius: 5px; font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); }
.result code { color: var(--cc-green); font-family: 'JetBrains Mono', monospace; }
.snap-list { list-style: none; margin: 0; padding: 0.5rem 0.6rem; overflow-y: auto; max-height: 280px; display: flex; flex-direction: column; gap: 0.35rem; }
.snap { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.55rem; border: 1px solid var(--cc-border); border-radius: 5px; background: var(--cc-surface-2); }
.snap-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.snap-name { font-weight: 600; color: var(--cc-text); font-size: calc(0.74rem * var(--cc-font-scale, 1)); }
.snap-meta { font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.restore-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; background: var(--cc-red-dim); color: var(--cc-red); border: 1px solid var(--cc-red); white-space: nowrap; flex-shrink: 0; }
.restore-btn:disabled { opacity: 0.5; cursor: default; }
.restore-btn:hover:not(:disabled) { filter: brightness(1.2); }
.empty { padding: 0.6rem 0.5rem; color: var(--cc-text-muted); font-size: calc(0.7rem * var(--cc-font-scale, 1)); font-style: italic; text-align: center; }
.dlg-body { display: flex; flex-direction: column; gap: 0.25rem; }
.dlg-snap { font-weight: 700; color: var(--cc-text); font-size: calc(0.78rem * var(--cc-font-scale, 1)); }
.dlg-meta { font-family: 'JetBrains Mono', monospace; font-size: calc(0.66rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); word-break: break-word; }
</style>
