<script setup lang="ts">
// Overview-first Home (Phase 1). Renders only items that map to the
// ACTION / STATUS / CONTEXT taxonomy (codex gate): Needs-You (ACTION),
// Pulse (STATUS), Project Digest (CONTEXT). Everything raw/unclassified lives
// in the Command Center drill-down. All data comes from the Phase-0 selectors.
import { useRouter } from 'vue-router'
import { useCommandCenterStore } from '@/stores/command-center'
import { useTheme } from '@/composables/useTheme'
import PulseBand from '@/components/command-center/PulseBand.vue'
import NeedsYouQueue from '@/components/command-center/NeedsYouQueue.vue'
import ProjectDigestList from '@/components/command-center/ProjectDigestList.vue'

const store = useCommandCenterStore()
const router = useRouter()
const { theme, fontScale, toggleTheme, increaseFontSize, decreaseFontSize } = useTheme()

function onToggleTestData(e: Event) {
  store.setShowTestData((e.target as HTMLInputElement).checked)
}
function openProject(project: string) {
  store.setActiveProject(project)
  router.push({ name: 'CommandCenter' })
}
function openCommandCenter() {
  router.push({ name: 'CommandCenter' })
}
</script>

<template>
  <div class="home">
    <header class="home-topbar">
      <h1 class="home-title">ENGRAM <span class="home-sub">Overview</span></h1>

      <div class="topbar-right">
        <label class="testdata-toggle" title="Reveal fixtures / test entities (hidden by default)">
          <input type="checkbox" :checked="store.showTestData" @change="onToggleTestData" />
          <span>Test data</span>
        </label>

        <div class="font-controls">
          <button class="ctrl-btn" @click="decreaseFontSize" title="Decrease font size">A&minus;</button>
          <span class="font-scale">{{ Math.round(fontScale * 100) }}%</span>
          <button class="ctrl-btn" @click="increaseFontSize" title="Increase font size">A+</button>
        </div>

        <button class="ctrl-btn" @click="toggleTheme" :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`">
          <span v-if="theme === 'dark'">&#9788; Light</span>
          <span v-else>&#9790; Dark</span>
        </button>

        <button class="cc-link" @click="openCommandCenter">Command Center &rarr;</button>

        <div class="status-dot" :class="{ connected: store.isConnected, error: !store.isConnected && !store.isLoading }">
          <span class="dot"></span>
          <span class="status-text">{{ store.isLoading ? 'LOADING' : store.isConnected ? 'LIVE' : 'OFFLINE' }}</span>
        </div>
      </div>
    </header>

    <main class="home-body">
      <PulseBand class="home-pulse" />

      <div class="home-grid">
        <NeedsYouQueue class="home-action" />
        <ProjectDigestList class="home-context" @open="openProject" />
      </div>

      <p class="home-foot">
        This overview surfaces only what maps to <b>Action</b>, <b>Status</b>, or <b>Context</b>.
        The full message stream, agent roster, inbox and knowledge graph live in the
        <button class="inline-link" @click="openCommandCenter">Command Center</button>.
      </p>
    </main>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--cc-bg);
  color: var(--cc-text);
}
.home-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1.1rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
  flex-wrap: wrap;
}
.home-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(1.05rem * var(--cc-font-scale, 1));
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--cc-cyan);
}
.home-sub {
  color: var(--cc-text-muted);
  font-weight: 500;
  letter-spacing: 0.06em;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}
.testdata-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.font-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.font-scale {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  min-width: 2.4em;
  text-align: center;
}
.ctrl-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.64rem * var(--cc-font-scale, 1));
  padding: 0.22rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  background: var(--cc-surface-2);
  color: var(--cc-text-dim);
  border: 1px solid var(--cc-border);
}
.ctrl-btn:hover {
  border-color: var(--cc-cyan);
  color: var(--cc-text);
}
.cc-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  padding: 0.24rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  background: var(--cc-cyan-dim);
  color: var(--cc-cyan);
  border: 1px solid var(--cc-cyan);
}
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  letter-spacing: 0.08em;
  color: var(--cc-text-muted);
}
.status-dot .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cc-text-muted);
}
.status-dot.connected .dot {
  background: var(--cc-green);
  box-shadow: 0 0 6px var(--cc-green);
}
.status-dot.error .dot {
  background: var(--cc-red);
}
.home-body {
  flex: 1;
  padding: 1rem 1.1rem 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}
.home-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 1rem;
  align-items: start;
}
.home-action,
.home-context {
  max-height: 70vh;
}
.home-foot {
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  line-height: 1.5;
}
.inline-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--cc-cyan);
  font: inherit;
  text-decoration: underline;
}
@media (max-width: 860px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
}
</style>
