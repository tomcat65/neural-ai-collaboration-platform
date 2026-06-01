<script setup lang="ts">
// Project digest — the CONTEXT lens of the overview. Renders the deterministic
// store.projectDigests selector (Phase 0). Project association is a BEST-EFFORT
// heuristic (messages carry no canonical projectId), so it is labeled as such and
// must never be presented as canonical (codex §6 / spec §6).
import { useCommandCenterStore } from '@/stores/command-center'
import type { ProjectDigest } from '@/types/command-center'

const store = useCommandCenterStore()
const emit = defineEmits<{ (e: 'open', project: string): void }>()
</script>

<template>
  <section class="project-digest">
    <header class="sec-header">
      <span class="sec-lens context">CONTEXT</span>
      <span class="sec-title">Projects</span>
      <span
        class="sec-note"
        title="Best-effort: messages carry no canonical project id, so this grouping is inferred from content/agent names. Not authoritative."
      >best-effort</span>
    </header>

    <div class="card-list">
      <button
        v-for="d in store.projectDigests"
        :key="d.project"
        class="pd-card"
        @click="emit('open', d.project)"
      >
        <span class="pd-name">{{ d.project }}</span>
        <span class="pd-stats">
          <span class="pd-stat"><b>{{ d.messageCount }}</b> msgs</span>
          <span class="pd-stat" :class="{ hot: d.unreadCount > 0 }"><b>{{ d.unreadCount }}</b> unread</span>
          <span class="pd-stat"><b>{{ d.knowledgeChanges }}</b> knowledge</span>
        </span>
      </button>

      <div v-if="store.projectDigests.length === 0" class="empty-state">
        No project activity yet
      </div>
    </div>
  </section>
</template>

<style scoped>
.project-digest {
  display: flex;
  flex-direction: column;
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}
.sec-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: var(--cc-surface-2);
  border-bottom: 1px solid var(--cc-border);
}
.sec-lens {
  font-size: calc(0.54rem * var(--cc-font-scale, 1));
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}
.sec-lens.context {
  color: #11151c;
  background: var(--cc-purple);
}
.sec-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(0.82rem * var(--cc-font-scale, 1));
  font-weight: 600;
  color: var(--cc-text);
}
.sec-note {
  margin-left: auto;
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  font-style: italic;
  color: var(--cc-text-muted);
  cursor: help;
  border-bottom: 1px dotted var(--cc-text-muted);
}
.card-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.pd-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  text-align: left;
  background: var(--cc-surface-2);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  padding: 0.55rem 0.65rem;
  cursor: pointer;
  transition: border-color 0.15s;
}
.pd-card:hover {
  border-color: var(--cc-cyan);
}
.pd-name {
  font-size: calc(0.78rem * var(--cc-font-scale, 1));
  font-weight: 600;
  color: var(--cc-green);
}
.pd-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}
.pd-stat {
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}
.pd-stat b {
  color: var(--cc-text-dim);
  font-weight: 700;
}
.pd-stat.hot b {
  color: var(--cc-amber);
}
.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
}
</style>
