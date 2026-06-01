<script setup lang="ts">
// Audit. Reads /admin/audit-log (separate ENABLE_ADMIN_ENDPOINTS gate). Degrades
// gracefully: when the endpoint is unavailable it shows a clear note instead of
// erroring, and never blocks the rest of the Steward (spec §6 / codex B3).
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
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="lens">AUDIT</span>
      <span class="title">Activity log</span>
      <span v-if="store.auditAvailable" class="count">{{ store.auditEntries.length }}</span>
    </header>

    <div v-if="store.auditAvailable === false" class="unavailable">
      Audit log unavailable — enable admin endpoints (and the <code>/admin</code> proxy) to view it.
      The custody actions still work without it.
    </div>

    <ul v-else class="audit-list">
      <li v-for="(e, i) in store.auditEntries" :key="i" class="row">
        <span class="act">{{ actionOf(e) }}</span>
        <span class="actor" v-if="actorOf(e)">{{ actorOf(e) }}</span>
        <span class="when">{{ whenOf(e) }}</span>
      </li>
      <li v-if="store.auditEntries.length === 0" class="empty">No audit entries.</li>
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
.audit-list { list-style: none; margin: 0; padding: 0.4rem; overflow-y: auto; max-height: 300px; }
.row { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.28rem 0.4rem; border-bottom: 1px solid var(--cc-border); font-size: calc(0.7rem * var(--cc-font-scale, 1)); }
.act { color: var(--cc-text); font-weight: 600; }
.actor { color: var(--cc-cyan); font-size: calc(0.64rem * var(--cc-font-scale, 1)); }
.when { margin-left: auto; color: var(--cc-text-muted); font-size: calc(0.62rem * var(--cc-font-scale, 1)); white-space: nowrap; }
.empty { color: var(--cc-text-muted); font-style: italic; padding: 0.5rem; }
</style>
