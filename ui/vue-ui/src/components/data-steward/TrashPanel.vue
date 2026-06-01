<script setup lang="ts">
// Trash (CURATE — restore / purge). Lists the durable server-side Trash; each entry
// can be Restored (re-imports its stored backup atomically) or Purged (permanent,
// gated by a typed confirmation). The list carries metadata only — no payloads.
import { ref, computed } from 'vue'
import { useDataStewardStore, type TrashEntry } from '@/stores/data-steward'
import ConfirmDialog from '@/components/data-steward/ConfirmDialog.vue'

const store = useDataStewardStore()
const confirming = ref<{ kind: 'restore' | 'purge'; entry: TrashEntry } | null>(null)

const dialogBusy = computed(() => {
  const c = confirming.value
  return c ? store.busy === `${c.kind}:${c.entry.trashId}` : false
})

function fmt(ts: string): string {
  return (ts || '').replace('T', ' ').replace(/\.\d+/, '').replace('Z', ' UTC').trim() || '—'
}
function names(e: TrashEntry): string {
  const n = e.entityNames || []
  return n.length <= 4 ? n.join(', ') : `${n.slice(0, 4).join(', ')} +${n.length - 4} more`
}

async function confirm() {
  const c = confirming.value
  if (!c) return
  try {
    if (c.kind === 'restore') await store.restoreTrash(c.entry.trashId)
    else await store.purgeTrash(c.entry.trashId)
  } catch {
    /* surfaced via store.error */
  } finally {
    confirming.value = null
  }
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="lens">CURATE</span>
      <span class="title">Trash</span>
      <span class="count">{{ store.trash.length }} entries</span>
    </header>

    <div class="list">
      <div v-for="e in store.trash" :key="e.trashId" class="row">
        <div class="row-main">
          <div class="row-names">{{ names(e) }}</div>
          <div class="row-meta">
            <span><b>{{ e.counts?.entities ?? 0 }}</b> ent</span>
            <span><b>{{ e.counts?.observations ?? 0 }}</b> obs</span>
            <span><b>{{ e.counts?.relations ?? 0 }}</b> rel</span>
            <span class="when">{{ fmt(e.retiredAt) }}</span>
            <span v-if="e.reason" class="reason">“{{ e.reason }}”</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="act restore" :disabled="!!store.busy" @click="confirming = { kind: 'restore', entry: e }">Restore</button>
          <button class="act purge" :disabled="!!store.busy" @click="confirming = { kind: 'purge', entry: e }">Purge</button>
        </div>
      </div>
      <div v-if="store.trash.length === 0" class="empty">Trash is empty — retired entities land here, recoverable until purged.</div>
    </div>

    <ConfirmDialog
      :open="!!confirming"
      :tone="confirming?.kind === 'purge' ? 'danger' : 'normal'"
      :title="confirming?.kind === 'purge' ? 'Purge permanently?' : 'Restore from Trash?'"
      :message="confirming?.kind === 'purge'
        ? 'This deletes the stored backup for good — there is no recovery after purging.'
        : 'This re-imports the stored backup into the live store and removes the Trash entry.'"
      :confirm-word="confirming?.kind === 'purge' ? 'PURGE' : undefined"
      :confirm-label="confirming?.kind === 'purge' ? 'Purge' : 'Restore'"
      :busy="dialogBusy"
      @confirm="confirm"
      @cancel="confirming = null"
    >
      <div v-if="confirming" class="dlg-body">
        <div class="dlg-names">{{ (confirming.entry.entityNames || []).join(', ') }}</div>
        <div class="dlg-counts">
          {{ confirming.entry.counts?.entities ?? 0 }} entities ·
          {{ confirming.entry.counts?.observations ?? 0 }} observations ·
          {{ confirming.entry.counts?.relations ?? 0 }} relations
        </div>
      </div>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--cc-surface-1); border: 1px solid var(--cc-border); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--cc-surface-2); border-bottom: 1px solid var(--cc-border); }
.lens { font-size: calc(0.54rem * var(--cc-font-scale, 1)); font-weight: 800; letter-spacing: 0.12em; padding: 0.1rem 0.35rem; border-radius: 3px; color: #11151c; background: var(--cc-red); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.82rem * var(--cc-font-scale, 1)); font-weight: 600; color: var(--cc-text); }
.count { margin-left: auto; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.list { padding: 0.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; }
.row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.55rem; border: 1px solid var(--cc-border); border-radius: 6px; background: var(--cc-surface-2); }
.row-main { min-width: 0; flex: 1; }
.row-names { font-size: calc(0.74rem * var(--cc-font-scale, 1)); color: var(--cc-text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-meta { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.2rem; font-size: calc(0.64rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.row-meta b { color: var(--cc-text-dim); font-weight: 700; }
.row-meta .when { color: var(--cc-text-muted); }
.row-meta .reason { font-style: italic; color: var(--cc-text-dim); }
.row-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
.act { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.28rem 0.55rem; border-radius: 4px; cursor: pointer; border: 1px solid var(--cc-border); background: var(--cc-surface-1); }
.act:disabled { opacity: 0.5; cursor: default; }
.act.restore { color: var(--cc-green); border-color: var(--cc-green); background: var(--cc-green-dim, transparent); }
.act.purge { color: var(--cc-red); border-color: var(--cc-red); background: var(--cc-red-dim); }
.act:hover:not(:disabled) { filter: brightness(1.2); }
.empty { color: var(--cc-text-muted); font-size: calc(0.72rem * var(--cc-font-scale, 1)); font-style: italic; padding: 0.8rem 0.4rem; text-align: center; }
.dlg-body { display: flex; flex-direction: column; gap: 0.4rem; }
.dlg-names { font-family: 'JetBrains Mono', monospace; font-size: calc(0.7rem * var(--cc-font-scale, 1)); color: var(--cc-text); background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; padding: 0.4rem 0.5rem; max-height: 120px; overflow-y: auto; word-break: break-word; }
.dlg-counts { font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
</style>
