<script setup lang="ts">
// Overview hero — the "command of your memory" band at the top of the Data Steward.
// Real global store stats (GET /api/analytics) + backup/trash state, presented as
// elevated stat cards. The focal point of the home. (2c polish)
import { computed } from 'vue'
import { useDataStewardStore } from '@/stores/data-steward'

const store = useDataStewardStore()

function fmtNum(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US')
}
function fmtBytes(n?: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`
}
function fmtDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

const ov = computed(() => store.overview)
const lastSnap = computed(() => store.snapshots[0]?.createdAt)
const memories = computed(() => (ov.value ? (ov.value.entityCount ?? 0) + (ov.value.observationCount ?? 0) : null))

const stats = computed(() => [
  { key: 'entities', label: 'Entities', value: fmtNum(ov.value?.entityCount), accent: 'cyan', sub: 'named memories' },
  { key: 'observations', label: 'Observations', value: fmtNum(ov.value?.observationCount), accent: 'teal', sub: 'recorded facts' },
  { key: 'relations', label: 'Relations', value: fmtNum(ov.value?.relationCount), accent: 'violet', sub: 'connections' },
  { key: 'store', label: 'Store size', value: fmtBytes(ov.value?.actualDbBytes), accent: 'amber', sub: 'on disk' },
  { key: 'snapshots', label: 'Snapshots', value: fmtNum(store.snapshots.length), accent: 'green', sub: lastSnap.value ? `last ${fmtDate(lastSnap.value)}` : 'none yet' },
  { key: 'trash', label: 'In Trash', value: fmtNum(store.trash.length), accent: 'red', sub: store.trash.length ? 'recoverable' : 'empty' },
])
</script>

<template>
  <section class="hero">
    <div class="hero-id">
      <div class="wordmark">ENGRAM</div>
      <div class="role">Data Steward</div>
      <p class="tagline">Your agents' shared memory — see it, curate it, carry it anywhere.</p>
      <div class="memline">
        <span class="dot" :class="{ live: ov }"></span>
        <template v-if="memories != null"><b>{{ fmtNum(memories) }}</b> memories under your care</template>
        <template v-else>reading the store…</template>
      </div>
    </div>

    <div class="stat-grid">
      <div v-for="s in stats" :key="s.key" class="stat" :class="'a-' + s.accent">
        <span class="stat-top"></span>
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-sub" :title="s.sub">{{ s.sub }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  gap: 1.6rem;
  align-items: stretch;
  flex-wrap: wrap;
  padding: 1.5rem 1.7rem;
  border-radius: 16px;
  background:
    radial-gradient(120% 150% at 0% 0%, rgba(34, 211, 238, 0.10), transparent 55%),
    radial-gradient(120% 170% at 100% 0%, rgba(167, 139, 250, 0.10), transparent 52%),
    linear-gradient(180deg, var(--cc-surface-1), var(--cc-surface-2));
  border: 1px solid var(--cc-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 50px -28px rgba(0, 0, 0, 0.85);
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.55), rgba(167, 139, 250, 0.55), transparent);
}

.hero-id { display: flex; flex-direction: column; justify-content: center; gap: 0.28rem; flex: 1 1 230px; min-width: 210px; }
.wordmark {
  font-family: 'Outfit', sans-serif; font-weight: 800; line-height: 1;
  letter-spacing: 0.2em; font-size: calc(1.85rem * var(--cc-font-scale, 1));
  background: linear-gradient(92deg, #22d3ee 10%, #a78bfa 90%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  width: fit-content;
}
.role {
  font-family: 'Outfit', sans-serif; font-weight: 600; letter-spacing: 0.06em;
  font-size: calc(0.8rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); text-transform: uppercase;
}
.tagline { margin: 0.3rem 0 0; font-size: calc(0.78rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); line-height: 1.55; max-width: 32ch; }
.memline { margin-top: 0.45rem; display: flex; align-items: center; gap: 0.4rem; font-size: calc(0.72rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.memline b { color: var(--cc-text); font-weight: 700; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cc-text-muted); flex-shrink: 0; }
.dot.live { background: #34d399; box-shadow: 0 0 8px rgba(52, 211, 153, 0.8); }

.stat-grid { display: grid; gap: 0.7rem; flex: 3 1 540px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 760px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
.stat {
  position: relative; padding: 0.85rem 0.95rem 0.9rem; border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.012));
  border: 1px solid var(--cc-border);
  overflow: hidden;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.stat:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.18); box-shadow: 0 14px 26px -18px rgba(0, 0, 0, 0.75); }
.stat-top { position: absolute; top: 0; left: 0; right: 0; height: 2px; opacity: 0.9; }
.stat-value { font-family: 'Outfit', sans-serif; font-weight: 700; line-height: 1; letter-spacing: -0.01em; font-size: calc(1.6rem * var(--cc-font-scale, 1)); color: var(--cc-text); }
.stat-label { margin-top: 0.45rem; font-size: calc(0.6rem * var(--cc-font-scale, 1)); text-transform: uppercase; letter-spacing: 0.13em; color: var(--cc-text-muted); font-weight: 700; }
.stat-sub { margin-top: 0.12rem; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.a-cyan .stat-top { background: #22d3ee; }
.a-teal .stat-top { background: #2dd4bf; }
.a-violet .stat-top { background: #a78bfa; }
.a-amber .stat-top { background: var(--cc-amber); }
.a-green .stat-top { background: var(--cc-green); }
.a-red .stat-top { background: var(--cc-red); }
</style>
