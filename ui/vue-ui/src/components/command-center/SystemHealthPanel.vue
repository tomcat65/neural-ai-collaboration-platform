<script setup lang="ts">
import { computed } from 'vue'
import { useCommandCenterStore } from '@/stores/command-center'

const store = useCommandCenterStore()

const healthySummary = computed(() => {
  const c = store.systemHealth.containers
  const up = c.filter((x) => x.status === 'healthy').length
  return `${up}/${c.length} up`
})

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function statusClass(status: string): string {
  if (status === 'healthy') return 'dot-green'
  if (status === 'warning') return 'dot-orange'
  if (status === 'error') return 'dot-red'
  return 'dot-muted'
}
</script>

<template>
  <div class="system-health">
    <div class="panel-header">
      <span class="panel-title"><span class="header-icon">&#x1F3D7;&#xFE0F;</span> System Health</span>
      <span class="panel-count">{{ healthySummary }}</span>
    </div>

    <div class="health-body">
      <!-- Container Grid -->
      <div class="container-grid">
        <div
          v-for="c in store.systemHealth.containers"
          :key="c.name"
          class="container-row"
          :class="{ healthy: c.status === 'healthy' }"
        >
          <div class="container-name">
            <span class="status-dot" :class="statusClass(c.status)"></span>
            <span class="cname">{{ c.name }}</span>
          </div>
          <span class="cport">:{{ c.port }}</span>
          <span class="cmem">{{ c.mem }}</span>
          <span class="cuptime">{{ c.uptime }}</span>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <div class="stat-cell">
          <span class="stat-icon">&#x1F4BE;</span>
          <span class="stat-val">{{ store.systemHealth.dbSize }}</span>
          <span class="stat-label">SQLite</span>
        </div>
        <div class="stat-cell">
          <span class="stat-icon">&#x1F52E;</span>
          <span class="stat-val">{{ formatNumber(store.systemHealth.entityCount) }}</span>
          <span class="stat-label">Entities</span>
        </div>
        <div class="stat-cell">
          <span class="stat-icon">&#x1F4E8;</span>
          <span class="stat-val">{{ formatNumber(store.systemHealth.totalMessages) }}</span>
          <span class="stat-label">Messages</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.system-health {
  border-top: 1px solid var(--cc-border);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
}

.panel-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--cc-green);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.header-icon {
  font-size: calc(0.9rem * var(--cc-font-scale, 1));
}

.panel-count {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  background: var(--cc-surface-2);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.health-body {
  padding: 0.35rem;
}

/* ── Container Grid ── */
.container-grid {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.container-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0.4rem;
  align-items: center;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  background: transparent;
  border: 1px solid transparent;
}

.container-row.healthy {
  background: var(--cc-green-glow, rgba(16, 185, 129, 0.06));
  border-color: var(--cc-green-border, rgba(52, 211, 153, 0.1));
}

.container-name {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-green {
  background: var(--cc-green);
  box-shadow: 0 0 5px var(--cc-green-dim, rgba(52, 211, 153, 0.4));
}

.dot-orange {
  background: var(--cc-amber);
  box-shadow: 0 0 5px var(--cc-amber-dim, rgba(251, 191, 36, 0.4));
}

.dot-red {
  background: var(--cc-red);
  box-shadow: 0 0 5px var(--cc-red-dim, rgba(239, 68, 68, 0.4));
}

.dot-muted {
  background: var(--cc-text-muted);
}

.cname {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.68rem * var(--cc-font-scale, 1));
  font-weight: 600;
  color: var(--cc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cport {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.cmem {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.cuptime {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

/* ── Quick Stats ── */
.quick-stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--cc-border);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}

.stat-icon {
  font-size: calc(0.9rem * var(--cc-font-scale, 1));
}

.stat-val {
  font-size: calc(0.85rem * var(--cc-font-scale, 1));
  font-weight: 700;
  color: var(--cc-text);
}

.stat-label {
  font-size: calc(0.52rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
