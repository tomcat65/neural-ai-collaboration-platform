<script setup lang="ts">
// Library (SEE + back up entities). Browse the store's entity prefixes; selecting
// one previews the logical-export counts and offers a JSON download. Read-only.
import { ref, computed } from 'vue'
import { useDataStewardStore } from '@/stores/data-steward'

const store = useDataStewardStore()
const search = ref('')
const selected = ref<string | null>(null)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = store.prefixes
  return q ? list.filter((p) => p.toLowerCase().includes(q)) : list
})

async function select(p: string) {
  selected.value = p
  try {
    await store.exportPreview({ namePrefix: p })
  } catch {
    /* surfaced via store.error */
  }
}
function download() {
  if (selected.value) store.downloadExport({ namePrefix: selected.value })
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="lens">SEE</span>
      <span class="title">Library</span>
      <span class="count">{{ store.prefixes.length }} prefixes</span>
    </header>

    <input v-model="search" class="search" type="text" placeholder="Filter entities by name prefix…" />

    <div class="cols">
      <ul class="prefix-list">
        <li
          v-for="p in filtered"
          :key="p"
          :class="{ active: p === selected }"
          @click="select(p)"
        >{{ p }}</li>
        <li v-if="filtered.length === 0" class="empty">No matching prefixes</li>
      </ul>

      <div class="detail">
        <template v-if="store.preview && selected">
          <div class="detail-name">{{ selected }}</div>
          <div class="counts">
            <span><b>{{ store.preview.counts.entities }}</b> entities</span>
            <span><b>{{ store.preview.counts.observations }}</b> observations</span>
            <span><b>{{ store.preview.counts.relations }}</b> relations</span>
          </div>
          <div class="names" v-if="store.preview.entityNames?.length">
            {{ store.preview.entityNames.slice(0, 12).join(', ') }}<span v-if="store.preview.entityNames.length > 12">, …</span>
          </div>
          <button class="dl-btn" :disabled="store.busy === 'export'" @click="download">
            {{ store.busy === 'export' ? 'Preparing…' : 'Download backup (JSON)' }}
          </button>
        </template>
        <div v-else class="hint">Select a prefix to preview its backup.</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; background: var(--cc-surface-1); border: 1px solid var(--cc-border); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--cc-surface-2); border-bottom: 1px solid var(--cc-border); }
.lens { font-size: calc(0.54rem * var(--cc-font-scale, 1)); font-weight: 800; letter-spacing: 0.12em; padding: 0.1rem 0.35rem; border-radius: 3px; color: #11151c; background: var(--cc-cyan); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.82rem * var(--cc-font-scale, 1)); font-weight: 600; color: var(--cc-text); }
.count { margin-left: auto; font-size: calc(0.62rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.search { margin: 0.5rem; padding: 0.4rem 0.55rem; background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; color: var(--cc-text); font-size: calc(0.72rem * var(--cc-font-scale, 1)); }
.search:focus { outline: none; border-color: var(--cc-cyan); }
.cols { display: grid; grid-template-columns: 1fr 1.2fr; gap: 0.5rem; padding: 0 0.5rem 0.5rem; min-height: 0; }
.prefix-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; max-height: 320px; border: 1px solid var(--cc-border); border-radius: 5px; }
.prefix-list li { padding: 0.32rem 0.5rem; font-size: calc(0.72rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); cursor: pointer; border-bottom: 1px solid var(--cc-border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prefix-list li:hover { background: var(--cc-surface-2); color: var(--cc-text); }
.prefix-list li.active { background: var(--cc-cyan-dim); color: var(--cc-cyan); }
.prefix-list li.empty { color: var(--cc-text-muted); cursor: default; font-style: italic; }
.detail { padding: 0.5rem 0.6rem; border: 1px solid var(--cc-border); border-radius: 5px; background: var(--cc-surface-2); }
.detail-name { font-weight: 600; color: var(--cc-green); font-size: calc(0.78rem * var(--cc-font-scale, 1)); margin-bottom: 0.4rem; word-break: break-word; }
.counts { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-bottom: 0.4rem; }
.counts span { font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.counts b { color: var(--cc-text); font-weight: 700; }
.names { font-size: calc(0.64rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); line-height: 1.4; margin-bottom: 0.5rem; word-break: break-word; }
.dl-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; background: var(--cc-cyan-dim); color: var(--cc-cyan); border: 1px solid var(--cc-cyan); }
.dl-btn:disabled { opacity: 0.6; cursor: default; }
.hint { color: var(--cc-text-muted); font-size: calc(0.72rem * var(--cc-font-scale, 1)); font-style: italic; }
</style>
