<script setup lang="ts">
// Library (SEE + back up entities). Browse the store's entity prefixes; selecting
// one previews the logical-export counts and offers a JSON download. Read-only.
import { ref, computed } from 'vue'
import { useDataStewardStore } from '@/stores/data-steward'
import ConfirmDialog from '@/components/data-steward/ConfirmDialog.vue'

const store = useDataStewardStore()
const search = ref('')
const selected = ref<string | null>(null)

// Per-entity selection for delete — entityNames-only (no prefix-wide delete).
const selectedNames = ref<string[]>([])
const deleteReason = ref('')
const confirmingDelete = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = store.prefixes
  return q ? list.filter((p) => p.toLowerCase().includes(q)) : list
})
const previewNames = computed(() => store.preview?.entityNames ?? [])
const allSelected = computed(
  () => previewNames.value.length > 0 && selectedNames.value.length === previewNames.value.length
)

async function select(p: string) {
  selected.value = p
  selectedNames.value = [] // fresh selection per prefix
  try {
    await store.exportPreview({ namePrefix: p })
  } catch {
    /* surfaced via store.error */
  }
}
function toggleName(n: string) {
  const i = selectedNames.value.indexOf(n)
  if (i >= 0) selectedNames.value.splice(i, 1)
  else selectedNames.value.push(n)
}
function toggleAll() {
  selectedNames.value = allSelected.value ? [] : [...previewNames.value]
}
function download() {
  if (selected.value) store.downloadExport({ namePrefix: selected.value })
}
async function doDelete() {
  if (selectedNames.value.length === 0) return
  try {
    await store.retire([...selectedNames.value], deleteReason.value.trim() || undefined)
    selectedNames.value = []
    deleteReason.value = ''
    selected.value = null
  } catch {
    /* surfaced via store.error */
  } finally {
    confirmingDelete.value = false
  }
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
          <div class="names-head" v-if="previewNames.length">
            <label class="sel-all">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              {{ selectedNames.length }}/{{ previewNames.length }} selected
            </label>
          </div>
          <ul class="name-list" v-if="previewNames.length">
            <li v-for="n in previewNames" :key="n">
              <label>
                <input type="checkbox" :checked="selectedNames.includes(n)" @change="toggleName(n)" />
                <span>{{ n }}</span>
              </label>
            </li>
          </ul>
          <div class="actions-row">
            <button class="dl-btn" :disabled="store.busy === 'export'" @click="download">
              {{ store.busy === 'export' ? 'Preparing…' : 'Download backup (JSON)' }}
            </button>
            <button
              class="del-btn"
              :disabled="selectedNames.length === 0 || !!store.busy"
              @click="confirmingDelete = true"
            >
              Delete selected ({{ selectedNames.length }})
            </button>
          </div>
        </template>
        <div v-else class="hint">Select a prefix to preview its backup.</div>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmingDelete"
      tone="danger"
      title="Move to Trash?"
      :message="`This retires ${selectedNames.length} selected entit${selectedNames.length === 1 ? 'y' : 'ies'} — recoverable from Trash until you purge.`"
      confirm-word="DELETE"
      confirm-label="Delete"
      :busy="store.busy === 'retire'"
      @confirm="doDelete"
      @cancel="confirmingDelete = false"
    >
      <div class="dlg-body">
        <div class="dlg-names">
          {{ selectedNames.slice(0, 20).join(', ')
          }}<span v-if="selectedNames.length > 20">, +{{ selectedNames.length - 20 }} more</span>
        </div>
        <input v-model="deleteReason" class="reason-input" type="text" placeholder="Reason (optional)" />
      </div>
    </ConfirmDialog>
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
.names-head { margin-bottom: 0.3rem; }
.sel-all { display: inline-flex; align-items: center; gap: 0.35rem; font-size: calc(0.66rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); cursor: pointer; }
.name-list { list-style: none; margin: 0 0 0.5rem; padding: 0; max-height: 180px; overflow-y: auto; border: 1px solid var(--cc-border); border-radius: 5px; }
.name-list li { border-bottom: 1px solid var(--cc-border); }
.name-list li:last-child { border-bottom: none; }
.name-list label { display: flex; align-items: center; gap: 0.4rem; padding: 0.26rem 0.45rem; font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); cursor: pointer; }
.name-list label:hover { background: var(--cc-surface-1); color: var(--cc-text); }
.name-list span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actions-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.dl-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; background: var(--cc-cyan-dim); color: var(--cc-cyan); border: 1px solid var(--cc-cyan); }
.dl-btn:disabled { opacity: 0.6; cursor: default; }
.del-btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.64rem * var(--cc-font-scale, 1)); padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; background: var(--cc-red-dim); color: var(--cc-red); border: 1px solid var(--cc-red); }
.del-btn:disabled { opacity: 0.5; cursor: default; }
.dlg-body { display: flex; flex-direction: column; gap: 0.5rem; }
.dlg-names { font-family: 'JetBrains Mono', monospace; font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text); background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; padding: 0.4rem 0.5rem; max-height: 110px; overflow-y: auto; word-break: break-word; }
.reason-input { padding: 0.35rem 0.5rem; background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; color: var(--cc-text); font-size: calc(0.7rem * var(--cc-font-scale, 1)); }
.reason-input:focus { outline: none; border-color: var(--cc-cyan); }
.hint { color: var(--cc-text-muted); font-size: calc(0.72rem * var(--cc-font-scale, 1)); font-style: italic; }
</style>
