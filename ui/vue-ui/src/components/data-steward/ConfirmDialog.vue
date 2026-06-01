<script setup lang="ts">
// Reusable confirmation modal for destructive / irreversible actions. When
// `confirmWord` is set, the confirm button stays disabled until the user types it
// exactly — the typed-confirmation gate from the Steward spec (§4). Teleported to
// <body> so it overlays the whole console regardless of where it is mounted.
import { ref, computed, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmWord?: string
    confirmLabel?: string
    tone?: 'danger' | 'normal'
    busy?: boolean
  }>(),
  { confirmLabel: 'Confirm', tone: 'danger' }
)
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()

const typed = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const needsWord = computed(() => !!props.confirmWord)
const canConfirm = computed(
  () => !props.busy && (!needsWord.value || typed.value === props.confirmWord)
)

// Reset + focus the gate each time the dialog opens so a stale value can never
// pre-satisfy the typed confirmation.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      typed.value = ''
      void nextTick(() => inputEl.value?.focus())
    }
  }
)

function onConfirm() {
  if (canConfirm.value) emit('confirm')
}
function onCancel() {
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="onCancel">
      <div class="dialog" :class="tone" role="dialog" aria-modal="true" @keydown.esc="onCancel">
        <h3 class="title">{{ title }}</h3>
        <p v-if="message" class="message">{{ message }}</p>
        <div class="body"><slot /></div>
        <div v-if="needsWord" class="confirm-gate">
          <label>Type <code>{{ confirmWord }}</code> to confirm</label>
          <input
            ref="inputEl"
            v-model="typed"
            class="confirm-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter="onConfirm"
          />
        </div>
        <div class="actions">
          <button class="btn cancel" :disabled="busy" @click="onCancel">Cancel</button>
          <button class="btn go" :class="tone" :disabled="!canConfirm" @click="onConfirm">
            {{ busy ? 'Working…' : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.62); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.dialog { background: var(--cc-surface-1); border: 1px solid var(--cc-border); border-radius: 10px; max-width: 460px; width: 100%; padding: 1.1rem 1.2rem; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); }
.dialog.danger { border-color: var(--cc-red); }
.title { font-family: 'Outfit', sans-serif; font-size: calc(0.95rem * var(--cc-font-scale, 1)); font-weight: 700; color: var(--cc-text); margin: 0 0 0.5rem; }
.dialog.danger .title { color: var(--cc-red); }
.message { font-size: calc(0.74rem * var(--cc-font-scale, 1)); color: var(--cc-text-dim); line-height: 1.5; margin: 0 0 0.6rem; }
.body { margin-bottom: 0.6rem; }
.body:empty { margin-bottom: 0; }
.confirm-gate { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.8rem; }
.confirm-gate label { font-size: calc(0.68rem * var(--cc-font-scale, 1)); color: var(--cc-text-muted); }
.confirm-gate code { color: var(--cc-red); font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.confirm-input { padding: 0.4rem 0.55rem; background: var(--cc-surface-2); border: 1px solid var(--cc-border); border-radius: 5px; color: var(--cc-text); font-family: 'JetBrains Mono', monospace; font-size: calc(0.74rem * var(--cc-font-scale, 1)); }
.confirm-input:focus { outline: none; border-color: var(--cc-red); }
.actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.btn { font-family: 'JetBrains Mono', monospace; font-size: calc(0.7rem * var(--cc-font-scale, 1)); padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; border: 1px solid var(--cc-border); background: var(--cc-surface-2); color: var(--cc-text-dim); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.cancel:hover:not(:disabled) { color: var(--cc-text); }
.btn.go.danger { background: var(--cc-red-dim); color: var(--cc-red); border-color: var(--cc-red); }
.btn.go:not(.danger) { background: var(--cc-cyan-dim); color: var(--cc-cyan); border-color: var(--cc-cyan); }
.btn.go:hover:not(:disabled) { filter: brightness(1.2); }
</style>
