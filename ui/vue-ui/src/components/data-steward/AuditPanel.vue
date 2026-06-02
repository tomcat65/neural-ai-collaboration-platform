<script setup lang="ts">
// Audit. Reads /admin/audit-log (separate ENABLE_ADMIN_ENDPOINTS gate). Degrades
// gracefully when unavailable. Consecutive identical actions are collapsed into one
// row (e.g. graph_export ×42) so the log reads as activity, not a wall of duplicates.
import { computed } from 'vue'
import { useDataStewardStore } from '@/stores/data-steward'
import type { AuditEntry } from '@/stores/data-steward'

const store = useDataStewardStore()

function actionOf(e: AuditEntry): string {
  return String(e.action ?? e['operation'] ?? e['event'] ?? '—')
}
function whenOf(e: AuditEntry): string {
  const s = String(e.at ?? e['created_at'] ?? e['timestamp'] ?? '')
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
function actorOf(e: AuditEntry): string {
  return String(e.actor ?? e['userId'] ?? e['apiKeyId'] ?? '')
}
function tone(action: string): string {
  const a = action.toLowerCase()
  if (/(retire|purge|restore|import|delete|trash)/.test(a)) return 'warn'
  if (/(snapshot|export|backup)/.test(a)) return 'calm'
  return 'plain'
}

const grouped = computed(() => {
  const out: Array<{ action: string; count: number; actor: string; when: string }> = []
  for (const e of store.auditEntries) {
    const action = actionOf(e)
    const actor = actorOf(e)
    const last = out[out.length - 1]
    if (last && last.action === action && last.actor === actor) last.count++
    else out.push({ action, count: 1, actor, when: whenOf(e) })
  }
  return out
})
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="lens">AUDIT</span>
      <span class="title">Activity</span>
      <span v-if="store.auditAvailable" class="count">{{ store.auditEntries.length }} events</span>
    </header>

    <div v-if="store.auditAvailable === false" class="unavailable">
      Audit log unavailable — enable admin endpoints (and the <code>/admin</code> proxy) to view it.
      The custody actions still work without it.
    </div>

    <ul v-else class="audit-list">
      <li v-for="(g, i) in grouped" :key="i" class="row">
        <span class="chip" :class="tone(g.action)">{{ g.action }}</span>
        <span v-if="g.count > 1" class="mult">×{{ g.count }}</span>
        <span v-if="g.actor" class="actor">{{ g.actor }}</span>
        <span class="when">{{ g.when }}</span>
      </li>
      <li v-if="grouped.length === 0" class="empty">No activity yet.</li>
    </ul>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--cc-surface-1); border: 1px solid var(--cc-border); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--cc-surface-2); border-bottom: 1px solid var(--cc-border); }
.lens { font-size: calc(0.54rem * var(--cc-font-scale, 1)); font-weight: 800; letter-spacing: 0.12em; padding: 0.1rem 0.35rem; border-radius: 3px; color: #11151c; background: var(--cc-amber); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.82rem * var(--cc-font-scale, 1)); font-weight: 600; color: var(--cc-text); }
.count { margin-left: auto; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.unavailable { padding: 0.8rem; color: var(--cc-text-muted); font-size: calc(0.72rem * var(--cc-font-scale, 1)); line-height: 1.5; font-style: italic; }
.unavailable code { font-style: normal; color: var(--cc-amber); }
.audit-list { list-style: none; margin: 0; padding: 0.45rem; overflow-y: auto; max-height: 360px; display: flex; flex-direction: column; gap: 0.2rem; }
.row { display: flex; align-items: center; gap: 0.45rem; padding: 0.3rem 0.4rem; border-radius: 6px; font-size: calc(0.68rem * var(--cc-font-scale, 1)); }
.row:hover { background: var(--cc-surface-2); }
.chip { font-family: 'JetBrains Mono', monospace; font-size: calc(0.6rem * var(--cc-font-scale, 1)); padding: 0.12rem 0.42rem; border-radius: 5px; background: var(--cc-surface-2); border: 1px solid var(--cc-border); color: var(--cc-text-dim); white-space: nowrap; }
.chip.warn { color: var(--cc-amber); background: var(--cc-amber-dim); border-color: transparent; }
.chip.calm { color: var(--cc-cyan); background: var(--cc-cyan-dim); border-color: transparent; }
.mult { font-size: calc(0.6rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); font-weight: 700; }
.actor { color: var(--cc-text-dim); font-size: calc(0.62rem * var(--cc-font-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { margin-left: auto; color: var(--cc-text-muted); font-size: calc(0.6rem * var(--cc-font-scale, 1)); white-space: nowrap; }
.empty { color: var(--cc-text-muted); font-style: italic; padding: 0.6rem; text-align: center; }
</style>
