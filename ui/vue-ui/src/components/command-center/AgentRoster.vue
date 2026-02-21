<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCommandCenterStore } from '@/stores/command-center'
import type { Agent } from '@/types/command-center'

const store = useCommandCenterStore()
const emit = defineEmits<{ (e: 'filter-agent', agentName: string): void }>()

const AGENT_META: Record<string, { avatar: string; role: string }> = {
  'claude-code': { avatar: '\u{1F528}', role: 'Builder' },
  'codex': { avatar: '\u{1F6E1}\uFE0F', role: 'Security Auditor' },
  'claude-desktop': { avatar: '\u{1F9E0}', role: 'Orchestrator' },
  'claude-cli': { avatar: '\u2328\uFE0F', role: 'CLI Builder' },
  'claude-sonnet': { avatar: '\u{1F3A8}', role: 'Coordinator' },
}
const DEFAULT_META = { avatar: '\u{1F916}', role: 'Agent' }

function meta(agent: Agent) {
  return AGENT_META[agent.name] || AGENT_META[agent.id] || DEFAULT_META
}

const othersExpanded = ref(false)

// When a project is active, show only agents involved in that project
const projectActive = computed(() => {
  if (!store.activeProject) return []
  const names = store.projectAgentNames
  return store.realAgents
    .filter((a) => names.has(a.name) || names.has(a.id))
    .sort((a, b) => b.messageCount - a.messageCount)
})

const sortedActive = computed(() => {
  if (store.activeProject) return projectActive.value
  return [...store.activeAgents].sort((a, b) => b.messageCount - a.messageCount)
})

const sortedOffline = computed(() => {
  if (store.activeProject) return [] // hide when project-scoped
  return [...store.offlineAgents].sort((a, b) => b.messageCount - a.messageCount)
})

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function selectAgent(agent: Agent) {
  emit('filter-agent', agent.name)
}
</script>

<template>
  <div class="agent-roster">
    <div class="panel-header">
      <span class="panel-title"><span class="header-icon">&#x1F916;</span> {{ store.activeProject ? 'Project Agents' : 'Active Agents' }}</span>
      <span class="panel-count">{{ sortedActive.length }}</span>
    </div>
    <div class="agent-list">
      <!-- Active agents with green glow -->
      <div
        v-for="agent in sortedActive"
        :key="agent.id"
        class="agent-card active"
        @click="selectAgent(agent)"
      >
        <span class="agent-avatar">{{ meta(agent).avatar }}</span>
        <div class="agent-info">
          <span class="agent-name">{{ agent.displayName }}</span>
          <span class="agent-role">{{ meta(agent).role }}</span>
        </div>
        <div class="agent-right">
          <div class="agent-status-row">
            <span class="status-dot" :class="agent.status === 'online' ? 'online' : 'recent'"></span>
            <span class="status-time" :class="agent.status === 'online' ? 'online-text' : 'recent-text'">{{ timeAgo(agent.lastSeen) }}</span>
          </div>
          <span class="agent-msgs">{{ agent.messageCount }} msgs</span>
        </div>
      </div>

      <!-- Collapsible Other Agents -->
      <template v-if="sortedOffline.length > 0">
        <div class="section-divider" @click="othersExpanded = !othersExpanded">
          <span class="divider-chevron">{{ othersExpanded ? '\u25BE' : '\u25B8' }}</span>
          <span class="divider-label">Other Agents</span>
          <span class="divider-count">{{ sortedOffline.length }}</span>
        </div>
        <template v-if="othersExpanded">
          <div
            v-for="agent in sortedOffline"
            :key="agent.id"
            class="agent-card offline"
            @click="selectAgent(agent)"
          >
            <span class="agent-avatar dimmed">{{ meta(agent).avatar }}</span>
            <span class="agent-name-inline">{{ agent.displayName }}</span>
            <span class="agent-time-inline">{{ timeAgo(agent.lastSeen) }}</span>
          </div>
        </template>
      </template>

      <div v-if="sortedActive.length === 0 && sortedOffline.length === 0" class="empty-state">
        {{ store.activeProject ? `No agents found for ${store.activeProject}` : 'No agents registered' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-roster {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}

.panel-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--cc-cyan);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.header-icon {
  font-size: calc(0.9rem * var(--cc-font-scale, 1));
}

.panel-count {
  background: var(--cc-cyan-dim);
  color: var(--cc-cyan);
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
}

.agent-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.35rem;
}

/* ── Active agent card (green glow) ── */
.agent-card.active {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  margin-bottom: 0.15rem;
  background: var(--cc-green-glow);
  border: 1px solid var(--cc-green-border);
  transition: background 0.15s;
  cursor: pointer;
}

.agent-card.active:hover {
  background: var(--cc-green-glow-hover);
}

.agent-avatar {
  font-size: calc(1.1rem * var(--cc-font-scale, 1));
  flex-shrink: 0;
}

.agent-avatar.dimmed {
  font-size: calc(0.85rem * var(--cc-font-scale, 1));
  opacity: 0.5;
}

.agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.agent-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.78rem * var(--cc-font-scale, 1));
  font-weight: 700;
  color: var(--cc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-role {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.agent-right {
  text-align: right;
  flex-shrink: 0;
}

.agent-status-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  justify-content: flex-end;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online {
  background: var(--cc-green);
  box-shadow: 0 0 5px var(--cc-green);
}

.status-dot.recent {
  background: var(--cc-amber);
  box-shadow: 0 0 5px var(--cc-amber-dim);
}

.online-text {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-green);
  font-weight: 500;
}

.recent-text {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-amber);
  font-weight: 500;
}

.agent-msgs {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

/* ── Collapsible Divider ── */
.section-divider {
  border-top: 1px solid var(--cc-border);
  margin-top: 0.4rem;
  padding: 0.35rem 0.4rem 0.2rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
  border-radius: 3px;
}

.section-divider:hover {
  background: var(--cc-surface-2);
}

.divider-chevron {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  width: 0.8em;
}

.divider-label {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.divider-count {
  font-size: calc(0.55rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  margin-left: auto;
}

/* ── Offline agent row (dimmed, clickable) ── */
.agent-card.offline {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.55rem;
  opacity: 0.5;
  cursor: pointer;
  border-radius: 3px;
  transition: opacity 0.15s, background 0.15s;
}

.agent-card.offline:hover {
  opacity: 0.8;
  background: var(--cc-surface-2);
}

.agent-name-inline {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.agent-time-inline {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  flex-shrink: 0;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
}
</style>
