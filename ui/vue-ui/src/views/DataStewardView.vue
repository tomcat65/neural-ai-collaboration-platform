<script setup lang="ts">
// Data Steward. The human custodian console over the agent memory store: an overview
// hero, then SEE (Library), CURATE (Trash), PORT (Backups + import), AUDIT, and a
// quarantined DANGER ZONE (full-DB restore). Data from the server data-management API
// (/api/data/*), gated by ENABLE_DATA_MANAGEMENT; overview stats from /api/analytics.
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStewardStore } from '@/stores/data-steward'
import { useTheme } from '@/composables/useTheme'
import OverviewHero from '@/components/data-steward/OverviewHero.vue'
import LibraryPanel from '@/components/data-steward/LibraryPanel.vue'
import TrashPanel from '@/components/data-steward/TrashPanel.vue'
import BackupsPanel from '@/components/data-steward/BackupsPanel.vue'
import AuditPanel from '@/components/data-steward/AuditPanel.vue'
import DangerZonePanel from '@/components/data-steward/DangerZonePanel.vue'

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
      <span class="brand"><span class="brand-dot"></span>engram</span>
      <div class="right">
        <div class="font-controls">
          <button class="ctrl" @click="decreaseFontSize" title="Decrease font size">A&minus;</button>
          <span class="scale">{{ Math.round(fontScale * 100) }}%</span>
          <button class="ctrl" @click="increaseFontSize" title="Increase font size">A+</button>
        </div>
        <button class="ctrl" @click="toggleTheme">
          <span v-if="theme === 'dark'">&#9788; Light</span><span v-else>&#9790; Dark</span>
        </button>
        <button class="cc-link" @click="openCommandCenter">Activity &rarr;</button>
      </div>
    </header>

    <main class="body">
      <div v-if="store.error" class="error-banner">{{ store.error }}</div>

      <!-- Feature-flag off: graceful disabled state. -->
      <div v-if="store.available === false" class="disabled">
        <h2>Data management is disabled</h2>
        <p>
          The custody API (<code>/api/data/*</code>) is gated off. Set
          <code>ENABLE_DATA_MANAGEMENT=1</code> on the server and redeploy to enable
          backup / export / snapshot here.
        </p>
      </div>

      <div v-else-if="store.available === null && store.loading" class="loading">Reading the store…</div>

      <div v-else class="stack">
        <OverviewHero />
        <LibraryPanel />
        <div class="trio">
          <TrashPanel />
          <BackupsPanel />
          <AuditPanel />
        </div>
        <DangerZonePanel />
      </div>
    </main>
  </div>
</template>

<style scoped>
.steward {
  min-height: 100vh; display: flex; flex-direction: column; color: var(--cc-text);
  background:
    radial-gradient(85% 55% at 50% -12%, rgba(34, 211, 238, 0.07), transparent 60%),
    radial-gradient(70% 45% at 100% 0%, rgba(167, 139, 250, 0.06), transparent 58%),
    var(--cc-bg);
  background-attachment: fixed;
}

/* Slim topbar — the identity now lives in the hero. */
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.55rem 1.2rem; background: var(--cc-surface-1); border-bottom: 1px solid var(--cc-border); flex-wrap: wrap; position: sticky; top: 0; z-index: 5; }
.brand { display: inline-flex; align-items: center; gap: 0.45rem; font-family: 'Outfit', sans-serif; font-weight: 700; letter-spacing: 0.16em; font-size: calc(0.78rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); text-transform: lowercase; }
.brand-dot { width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg, #22d3ee, #a78bfa); box-shadow: 0 0 10px rgba(34, 211, 238, 0.6); }
.right { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.font-controls { display: inline-flex; align-items: center; gap: 0.3rem; }
.scale { font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); min-width: 2.4em; text-align: center; }
.ctrl { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.24rem 0.55rem; border-radius: 6px; cursor: pointer; background: var(--cc-surface-2); color: var(--cc-text-dim); border: 1px solid var(--cc-border); transition: border-color 0.15s, color 0.15s; }
.ctrl:hover { border-color: var(--cc-cyan); color: var(--cc-text); }
.cc-link { font-family: 'JetBrains Mono', monospace; font-size: calc(0.66rem * var(--cc-font-scale, 1)); padding: 0.26rem 0.7rem; border-radius: 6px; cursor: pointer; background: var(--cc-cyan-dim); color: var(--cc-cyan); border: 1px solid var(--cc-cyan); transition: filter 0.15s; }
.cc-link:hover { filter: brightness(1.2); }

.body { flex: 1; padding: 1.2rem 1.3rem 2rem; max-width: 1480px; width: 100%; margin: 0 auto; }
.error-banner { background: var(--cc-red-dim); color: var(--cc-red); border: 1px solid var(--cc-red); border-radius: 8px; padding: 0.55rem 0.85rem; margin-bottom: 1rem; font-size: calc(0.72rem * var(--cc-font-scale, 1)); }
.disabled { max-width: 640px; margin: 4rem auto; text-align: center; color: var(--cc-text-dim); }
.disabled h2 { font-family: 'Outfit', sans-serif; color: var(--cc-amber); margin-bottom: 0.6rem; font-size: calc(1.1rem * var(--cc-font-scale, 1)); }
.disabled p { line-height: 1.6; font-size: calc(0.8rem * var(--cc-font-scale, 1)); }
.disabled code { color: var(--cc-cyan); }
.loading { text-align: center; color: var(--cc-text-muted); margin: 4rem; font-size: calc(0.82rem * var(--cc-font-scale, 1)); }

/* Composed, gap-driven layout — no dead space. */
.stack { display: flex; flex-direction: column; gap: 1.1rem; }
.trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.1rem; align-items: start; }
@media (max-width: 1040px) { .trio { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .trio { grid-template-columns: 1fr; } }

/* Premium card uplift applied to every child panel at once (depth + radius). The
   Danger panel keeps its red border via its own more-specific .panel.danger rule. */
:deep(.panel) {
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 40px -30px rgba(0, 0, 0, 0.9);
}
:deep(.panel-head) { padding: 0.7rem 0.9rem; }
:deep(.panel .lens) { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06); }
</style>
