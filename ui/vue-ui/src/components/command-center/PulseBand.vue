<script setup lang="ts">
// Pulse band — the STATUS lens of the overview (codex ACTION/STATUS/CONTEXT gate).
// Pure read of the deterministic store.pulse selector (Phase 0). No new data.
import { computed } from 'vue'
import { useCommandCenterStore } from '@/stores/command-center'

const store = useCommandCenterStore()

const tiles = computed(() => {
  const p = store.pulse
  return [
    { key: 'needsYou',  label: 'Needs you',         value: p.needsYou,         accent: 'var(--cc-red)',    emphasize: p.needsYou > 0 },
    { key: 'unread',    label: 'Unread',            value: p.unread,           accent: 'var(--cc-amber)',  emphasize: false },
    { key: 'agents',    label: 'Active agents',     value: p.activeAgents,     accent: 'var(--cc-green)',  emphasize: false },
    { key: 'threads',   label: 'Threads',           value: p.threads,          accent: 'var(--cc-cyan)',   emphasize: false },
    { key: 'projects',  label: 'Projects',          value: p.projects,         accent: 'var(--cc-purple)', emphasize: false },
    { key: 'knowledge', label: 'Knowledge changes', value: p.knowledgeChanges, accent: 'var(--cc-cyan)',   emphasize: false },
  ]
})
</script>

<template>
  <section class="pulse-band" aria-label="Pulse — system status">
    <article
      v-for="t in tiles"
      :key="t.key"
      class="pulse-tile"
      :class="{ emphasize: t.emphasize }"
      :style="{ '--tile-accent': t.accent }"
    >
      <span class="tile-value">{{ t.value }}</span>
      <span class="tile-label">{{ t.label }}</span>
    </article>
  </section>
</template>

<style scoped>
.pulse-band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.6rem;
}
.pulse-tile {
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-border);
  border-left: 3px solid var(--tile-accent);
  border-radius: 6px;
  padding: 0.7rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.pulse-tile.emphasize {
  border-color: var(--tile-accent);
  box-shadow: 0 0 10px var(--cc-red-dim);
}
.tile-value {
  font-family: 'Outfit', sans-serif;
  font-size: calc(1.9rem * var(--cc-font-scale, 1));
  font-weight: 700;
  color: var(--tile-accent);
  line-height: 1;
}
.tile-label {
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cc-text-muted);
}
</style>
