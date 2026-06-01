<script setup lang="ts">
// Data Steward (Phase 2a, non-destructive). The human custodian console over the
// agent memory store: SEE (Library), PORT (Backups), and AUDIT. Delete/restore/
// import are deferred to 2b (behind their own review). All data comes from the
// server data-management API (/api/data/*), gated by ENABLE_DATA_MANAGEMENT.
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStewardStore } from '@/stores/data-steward'
import { useTheme } from '@/composables/useTheme'
import LibraryPanel from '@/components/data-steward/LibraryPanel.vue'
import BackupsPanel from '@/components/data-steward/BackupsPanel.vue'
import AuditPanel from '@/components/data-steward/AuditPanel.vue'

const store = useDataStewardStore()
const router = useRouter()
const { theme, fontScale, toggleTheme, increaseFontSize, decreaseFontSize } = useTheme()

onMounted(() => {
  store.initialize()
})

function openCommandCenter() {
  router.push({ name: 'CommandCenter' })
}
</script>

<template>
  <div class="steward">
    <header class="topbar">
      <h1 class="title">ENGRAM <span class="sub">Data Steward</span></h1>
      <div class="right">
        <div class="font-controls">
          <button class="ctrl" @click="decreaseFontSize" title="Decrease font size">A&minus;</button>
          <span class="scale">{{ Math.round(fontScale * 100) }}%</span>
          <button class="ctrl" @click="increaseFontSize" title="Increase font size">A+</button>
        </div>
        <button class="ctrl" @click="toggleTheme">
          <span v-if="theme === 'dark'">&#9788; Light</span><span v-else>&#9790; Dark</span>
        </button>
        <button class="cc-link" @click="openCommandCenter">Command Center &rarr;</button>
      </div>
    </header>

    <main class="body">
      <div v-if="store.error" class="error-banner">{{ store.error }}</div>

      <!-- Feature-flag off: graceful disabled state (spec §7). -->
      <div v-if="store.available === false" class="disabled">
        <h2>Data management is disabled</h2>
        <p>
          The custody API (<code>/api/data/*</code>) is gated off. Set
          <code>ENABLE_DATA_MANAGEMENT=1</code> on the server and redeploy to enable
          backup / export / snapshot here.
        </p>
      </div>

      <div v-else-if="store.available === null && store.loading" class="loading">Loading the store…</div>

      <div v-else class="grid">
        <LibraryPanel class="col-lib" />
        <div class="col-side">
          <BackupsPanel />
          <AuditPanel />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.steward { min-height: 100vh; display: flex; flex-direction: column; background: var(--cc-bg); color: var(--cc-text); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 1.1rem; background: var(--cc-surface-1); border-bottom: 1px solid var(--cc-border); flex-wrap: wrap; }
.title { font-family: 'Outfit', sans-serif; font-size: calc(1.05rem * var(--cc-font-scale, 1)); font-weight: 700; letter-spacing: 0.14em; color: var(--cc-green); }
.sub { color: var(--cc-text-muted); font-weight: 500; letter-spacing: 0.06em; }
.right { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.font-controls { display: inline-flex; align-items: center; gap: 0.3rem; }
.scale { font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); min-width: 2.4em; text-align: center; }
.ctrl { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.22rem 0.5rem; border-radius: 4px; cursor: pointer; background: var(--cc-surface-2); color: var(--cc-text-dim); border: 1px solid var(--cc-border); }
.ctrl:hover { border-color: var(--cc-cyan); color: var(--cc-text); }
.cc-link { font-family: 'JetBrains Mono', monospace; font-size: calc(0.66rem * var(--cc-font-scale, 1)); padding: 0.24rem 0.6rem; border-radius: 4px; cursor: pointer; background: var(--cc-cyan-dim); color: var(--cc-cyan); border: 1px solid var(--cc-cyan); }
.body { flex: 1; padding: 1rem 1.1rem 1.6rem; max-width: 1400px; width: 100%; margin: 0 auto; }
.error-banner { background: var(--cc-red-dim); color: var(--cc-red); border: 1px solid var(--cc-red); border-radius: 6px; padding: 0.5rem 0.8rem; margin-bottom: 0.8rem; font-size: calc(0.72rem * var(--cc-font-scale, 1)); }
.disabled { max-width: 640px; margin: 3rem auto; text-align: center; color: var(--cc-text-dim); }
.disabled h2 { font-family: 'Outfit', sans-serif; color: var(--cc-amber); margin-bottom: 0.6rem; font-size: calc(1.1rem * var(--cc-font-scale, 1)); }
.disabled p { line-height: 1.6; font-size: calc(0.8rem * var(--cc-font-scale, 1)); }
.disabled code { color: var(--cc-cyan); }
.loading { text-align: center; color: var(--cc-text-muted); margin: 3rem; }
.grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; align-items: start; }
.col-side { display: flex; flex-direction: column; gap: 1rem; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
</style>
