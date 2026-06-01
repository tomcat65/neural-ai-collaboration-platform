<script setup lang="ts">
// Backups (PORT). Create + list full-DB snapshots (one self-contained .db file,
// vectors included) and show backup locations + free space. Snapshot is a safe,
// non-destructive write. (Restore is a destructive op — deferred to 2b-ui.)
import { ref } from 'vue'
import { useDataStewardStore } from '@/stores/data-steward'

const store = useDataStewardStore()
const label = ref('')

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
</style>
