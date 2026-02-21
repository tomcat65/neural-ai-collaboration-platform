<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCommandCenterStore } from '@/stores/command-center'
import { useTheme } from '@/composables/useTheme'
import AgentRoster from '@/components/command-center/AgentRoster.vue'
import MessageStream from '@/components/command-center/MessageStream.vue'
import KnowledgeActivity from '@/components/command-center/KnowledgeActivity.vue'
import SystemHealthPanel from '@/components/command-center/SystemHealthPanel.vue'
import AttentionQueue from '@/components/command-center/AttentionQueue.vue'

const store = useCommandCenterStore()
const { theme, fontScale, toggleTheme, increaseFontSize, decreaseFontSize } = useTheme()

// ── Project Tabs ──────────────────────────────────────────────
interface ProjectTab {
  id: string
  name: string
  active: boolean
}

const TABS_KEY = 'cc-project-tabs'

function loadTabs(): ProjectTab[] {
  try {
    const saved = localStorage.getItem(TABS_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return [{ id: 'tab-1', name: 'All Projects', active: true }]
}

const projectTabs = ref<ProjectTab[]>(loadTabs())
const showProjectPicker = ref(false)
const projectSearch = ref('')

function saveTabs() {
  localStorage.setItem(TABS_KEY, JSON.stringify(projectTabs.value))
}

// Projects available to add (not already open as tabs)
const openTabNames = computed(() => new Set(projectTabs.value.map(t => t.name)))
const filteredProjects = computed(() => {
  const q = projectSearch.value.toLowerCase()
  return store.availableProjects
    .filter(p => !openTabNames.value.has(p.name))
    .filter(p => !q || p.name.toLowerCase().includes(q))
})

function addProjectTab(name: string) {
  const id = `tab-${Date.now()}`
  projectTabs.value.forEach(t => t.active = false)
  projectTabs.value.push({ id, name, active: true })
  saveTabs()
  showProjectPicker.value = false
  projectSearch.value = ''
}

function toggleProjectPicker() {
  showProjectPicker.value = !showProjectPicker.value
  projectSearch.value = ''
}

function activateTab(id: string) {
  projectTabs.value.forEach(t => t.active = t.id === id)
  saveTabs()
}

function closeTab(id: string) {
  if (projectTabs.value.length <= 1) return
  const idx = projectTabs.value.findIndex(t => t.id === id)
  const wasActive = projectTabs.value[idx]?.active
  projectTabs.value = projectTabs.value.filter(t => t.id !== id)
  if (wasActive && projectTabs.value.length > 0) {
    projectTabs.value[Math.min(idx, projectTabs.value.length - 1)].active = true
  }
  saveTabs()
}

const activeTabName = computed(() => {
  const tab = projectTabs.value.find(t => t.active)
  return tab?.name || 'All Projects'
})

// Sync active tab to store for project-scoped filtering
watch(activeTabName, (name) => {
  store.setActiveProject(name)
}, { immediate: true })

// ── Resizable Columns ────────────────────────────────────────
const COL_WIDTHS_KEY = 'cc-col-widths'

function loadColWidths(): { left: number; right: number } {
  try {
    const saved = localStorage.getItem(COL_WIDTHS_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { left: 280, right: 300 }
}

const colWidths = ref(loadColWidths())
const dragging = ref<'left' | 'right' | null>(null)
const gridEl = ref<HTMLElement | null>(null)

function saveColWidths() {
  localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths.value))
}

function startDrag(side: 'left' | 'right', e: MouseEvent) {
  e.preventDefault()
  dragging.value = side
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDrag(e: MouseEvent) {
  if (!dragging.value || !gridEl.value) return
  const rect = gridEl.value.getBoundingClientRect()

  if (dragging.value === 'left') {
    const w = Math.max(180, Math.min(500, e.clientX - rect.left))
    colWidths.value.left = w
  } else {
    const w = Math.max(200, Math.min(550, rect.right - e.clientX))
    colWidths.value.right = w
  }
}

function stopDrag() {
  dragging.value = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  saveColWidths()
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div class="command-center">
    <!-- Topbar -->
    <header class="cc-topbar">
      <h1 class="topbar-title">NEURAL COMMAND CENTER</h1>
      <span v-if="store.activeProject" class="project-scope">&#x1F4C1; {{ store.activeProject }}</span>
      <div class="topbar-right">
        <!-- Font size controls -->
        <div class="topbar-controls font-controls">
          <button class="ctrl-btn font-btn" @click="decreaseFontSize" title="Decrease font size">A&minus;</button>
          <span class="font-scale-label">{{ Math.round(fontScale * 100) }}%</span>
          <button class="ctrl-btn font-btn" @click="increaseFontSize" title="Increase font size">A+</button>
        </div>

        <!-- Theme toggle -->
        <button
          class="ctrl-btn theme-toggle"
          @click="toggleTheme"
          :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`"
        >
          <span v-if="theme === 'dark'" class="theme-icon">&#9788; Light</span>
          <span v-else class="theme-icon">&#9790; Dark</span>
        </button>

        <!-- Status -->
        <div class="status-dot" :class="{ connected: store.isConnected, error: !store.isConnected && !store.isLoading }">
          <span class="dot"></span>
          <span class="status-text">{{ store.isLoading ? 'LOADING' : store.isConnected ? 'CONNECTED' : 'OFFLINE' }}</span>
        </div>
      </div>
    </header>

    <!-- Project Tabs Bar -->
    <nav class="project-tabs-bar">
      <div
        v-for="tab in projectTabs"
        :key="tab.id"
        class="project-tab"
        :class="{ active: tab.active }"
        @click="activateTab(tab.id)"
      >
        <span class="tab-dot"></span>
        <span class="tab-name">{{ tab.name }}</span>
        <button
          v-if="projectTabs.length > 1"
          class="tab-close"
          @click.stop="closeTab(tab.id)"
          title="Close tab"
        >&times;</button>
      </div>

      <!-- Add project dropdown -->
      <div class="tab-add-wrapper">
        <button class="tab-add" @click="toggleProjectPicker" title="Add project tab">+</button>
        <div v-if="showProjectPicker" class="project-picker">
          <input
            class="picker-search"
            v-model="projectSearch"
            placeholder="Search projects..."
            autofocus
            @keydown.escape="showProjectPicker = false"
          />
          <div class="picker-list">
            <div
              v-for="p in filteredProjects"
              :key="p.name"
              class="picker-item"
              @click="addProjectTab(p.name)"
            >
              <span class="picker-name">{{ p.name }}</span>
              <span class="picker-obs">{{ p.observationCount }} obs</span>
            </div>
            <div v-if="filteredProjects.length === 0" class="picker-empty">
              {{ projectSearch ? 'No matching projects' : 'All projects already open' }}
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Close picker on outside click -->
    <div v-if="showProjectPicker" class="picker-backdrop" @click="showProjectPicker = false"></div>

    <!-- Connection error banner -->
    <div v-if="store.lastError && !store.isLoading" class="error-banner">
      CONNECTION LOST: {{ store.lastError }}
    </div>

    <!-- Loading skeleton -->
    <div v-if="store.isLoading" class="loading-overlay">
      <div class="loading-pulse">INITIALIZING SYSTEMS...</div>
    </div>

    <!-- Main 3-column grid with draggable dividers -->
    <main
      v-else
      class="cc-grid"
      ref="gridEl"
      :style="{
        gridTemplateColumns: `${colWidths.left}px 6px 1fr 6px ${colWidths.right}px`
      }"
      :class="{ 'is-dragging': dragging }"
    >
      <!-- Left Column -->
      <aside class="cc-col cc-col-left">
        <AgentRoster @filter-agent="(name: string) => store.setFilter({ agent: name })" />
        <SystemHealthPanel />
      </aside>

      <!-- Left Divider -->
      <div
        class="col-divider"
        @mousedown="startDrag('left', $event)"
        title="Drag to resize"
      >
        <div class="divider-grip"></div>
      </div>

      <!-- Center Column -->
      <section class="cc-col cc-col-center">
        <MessageStream />
      </section>

      <!-- Right Divider -->
      <div
        class="col-divider"
        @mousedown="startDrag('right', $event)"
        title="Drag to resize"
      >
        <div class="divider-grip"></div>
      </div>

      <!-- Right Column -->
      <aside class="cc-col cc-col-right">
        <KnowledgeActivity />
        <AttentionQueue />
      </aside>
    </main>

    <!-- Footer -->
    <footer class="cc-footer">
      <span>{{ store.realAgents.length }} agents</span>
      <span>{{ store.messages.length }} messages loaded</span>
      <span>{{ store.systemHealth.entityCount }} entities</span>
      <span>
        <router-link to="/brain" class="footer-link">Brain Viz</router-link>
        <span class="footer-sep">|</span>
        <router-link to="/stream" class="footer-link">Live Stream</router-link>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.command-center {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--cc-bg);
  font-family: 'JetBrains Mono', monospace;
}

/* ── Topbar ──────────────────────────────────────────────────── */

.cc-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
  min-height: 48px;
  flex-shrink: 0;
}

.topbar-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(1.05rem * var(--cc-font-scale, 1));
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--cc-text);
  text-transform: uppercase;
}

.project-scope {
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  color: var(--cc-cyan);
  background: var(--cc-cyan-dim);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--cc-cyan);
  font-weight: 600;
  letter-spacing: 0.03em;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.topbar-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.ctrl-btn {
  background: var(--cc-surface-2);
  color: var(--cc-text-dim);
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
  transition: all 0.15s;
  white-space: nowrap;
}

.ctrl-btn:hover {
  background: var(--cc-surface-3);
  color: var(--cc-cyan);
  border-color: var(--cc-cyan);
}

.font-btn {
  font-weight: 700;
  min-width: 2.4em;
  text-align: center;
}

.font-scale-label {
  color: var(--cc-text-muted);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  min-width: 3.5ch;
  text-align: center;
}

/* Theme toggle — prominent */
.theme-toggle {
  padding: 0.3rem 0.7rem;
  border-radius: 5px;
  font-weight: 600;
}

.theme-toggle:hover {
  background: var(--cc-cyan-dim);
  border-color: var(--cc-cyan);
  color: var(--cc-cyan);
}

.theme-icon {
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
}

.status-dot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--cc-text-muted);
}

.status-dot.connected .dot {
  background: var(--cc-green);
  box-shadow: 0 0 6px var(--cc-green);
  animation: pulse-dot 2s ease-in-out infinite;
}

.status-dot.error .dot {
  background: var(--cc-red);
  box-shadow: 0 0 6px var(--cc-red);
}

.status-text {
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ── Project Tabs Bar ────────────────────────────────────────── */

.project-tabs-bar {
  display: flex;
  align-items: stretch;
  background: var(--cc-surface-2);
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
  overflow: visible;
  padding: 0 0.25rem;
  min-height: 36px;
  position: relative;
  z-index: 100;
}

.project-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  white-space: nowrap;
  font-size: calc(0.78rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  position: relative;
}

.project-tab:hover {
  background: var(--cc-surface-3);
  color: var(--cc-text);
}

.project-tab.active {
  color: var(--cc-cyan);
  border-bottom-color: var(--cc-cyan);
  background: var(--cc-surface-1);
}

.tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cc-text-muted);
  flex-shrink: 0;
}

.project-tab.active .tab-dot {
  background: var(--cc-cyan);
  box-shadow: 0 0 4px var(--cc-cyan);
}

.tab-name {
  font-weight: 500;
}

.tab-close {
  background: none;
  border: none;
  color: var(--cc-text-muted);
  cursor: pointer;
  font-size: calc(1rem * var(--cc-font-scale, 1));
  padding: 0 0.2rem;
  line-height: 1;
  border-radius: 3px;
  transition: all 0.15s;
}

.tab-close:hover {
  color: var(--cc-red);
  background: var(--cc-red-dim);
}

.tab-add-wrapper {
  position: relative;
}

.tab-add {
  background: none;
  border: 1px dashed var(--cc-border);
  color: var(--cc-text-muted);
  cursor: pointer;
  font-size: calc(1rem * var(--cc-font-scale, 1));
  padding: 0.15rem 0.6rem;
  margin: 0.25rem 0.3rem;
  border-radius: 4px;
  transition: all 0.15s;
}

.tab-add:hover {
  color: var(--cc-cyan);
  border-color: var(--cc-cyan);
  background: var(--cc-cyan-dim);
}

/* ── Project Picker Dropdown ─────────────────────────────────── */

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.project-picker {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 320px;
  max-height: 360px;
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-cyan);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-search {
  background: var(--cc-surface-2);
  color: var(--cc-text);
  border: none;
  border-bottom: 1px solid var(--cc-border);
  padding: 0.5rem 0.7rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
  outline: none;
}

.picker-search::placeholder {
  color: var(--cc-text-muted);
}

.picker-list {
  flex: 1;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.7rem;
  cursor: pointer;
  transition: background 0.1s;
}

.picker-item:hover {
  background: var(--cc-cyan-dim);
}

.picker-name {
  color: var(--cc-text);
  font-size: calc(0.78rem * var(--cc-font-scale, 1));
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-obs {
  color: var(--cc-text-muted);
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.picker-empty {
  padding: 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
}

/* ── Error Banner ────────────────────────────────────────────── */

.error-banner {
  background: var(--cc-red-dim);
  color: var(--cc-red);
  text-align: center;
  padding: 0.4rem;
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--cc-red);
  flex-shrink: 0;
}

/* ── Loading ─────────────────────────────────────────────────── */

.loading-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-pulse {
  color: var(--cc-cyan);
  font-size: calc(1.2rem * var(--cc-font-scale, 1));
  letter-spacing: 0.2em;
  animation: pulse-text 1.5s ease-in-out infinite;
}

/* ── Grid with Draggable Dividers ────────────────────────────── */

.cc-grid {
  flex: 1;
  display: grid;
  /* Columns set dynamically via :style binding */
  min-height: 0;
}

.cc-grid.is-dragging {
  cursor: col-resize;
}

.cc-grid.is-dragging * {
  pointer-events: none;
}

.col-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cc-border);
  cursor: col-resize;
  transition: background 0.15s;
  position: relative;
  z-index: 5;
}

.col-divider:hover {
  background: var(--cc-cyan);
}

.col-divider:hover .divider-grip {
  opacity: 1;
}

.divider-grip {
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: var(--cc-text-muted);
  opacity: 0.3;
  transition: opacity 0.15s;
}

.cc-col {
  display: flex;
  flex-direction: column;
  background: var(--cc-bg);
  min-height: 0;
  overflow: hidden;
}

.cc-col-left > :first-child {
  flex: 1;
  min-height: 0;
}

.cc-col-left > :last-child {
  flex-shrink: 0;
}

.cc-col-right > :first-child {
  flex: 1;
  min-height: 0;
}

.cc-col-right > :last-child {
  flex: 0 0 auto;
  max-height: 40%;
}

.cc-col-center {
  min-height: 0;
}

/* ── Footer ──────────────────────────────────────────────────── */

.cc-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 0.35rem 1rem;
  background: var(--cc-surface-1);
  border-top: 1px solid var(--cc-border);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  flex-shrink: 0;
}

.footer-link {
  color: var(--cc-cyan);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  padding: 0;
}

.footer-sep {
  margin: 0 0.3rem;
  color: var(--cc-text-muted);
}

/* ── Animations ──────────────────────────────────────────────── */

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes pulse-text {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
