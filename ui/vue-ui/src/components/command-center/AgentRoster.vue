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

/** Derive project-specific role from graph entity names */
function projectRole(agent: Agent): string {
  const entities = store.graphProjectParticipants.get(agent.name)
  if (entities?.length) {
    const proj = store.activeProject.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const roles = entities.map((e) => {
      const role = e.toLowerCase()
        .replace(new RegExp(`^${proj}-`), '')
        .replace(/-agent$/, '')
        .replace(/-/g, ' ')
      return role.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    })
    if (roles.length <= 2) return roles.join(', ')
    return `${roles[0]}, ${roles[1]} +${roles.length - 2}`
  }
  return meta(agent).role
}

/** Is this agent graph-discovered (vs message-only)? */
function isGraphAgent(agent: Agent): boolean {
  return store.graphProjectParticipants.has(agent.name)
}

/** Truncate text with ellipsis */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '...'
}

/** Get last project message for an agent */
function lastProjectMsg(agent: Agent): string | null {
  const msg = store.latestProjectMessageByAgent.get(agent.name)
  if (!msg) return null
  return truncate(msg.content, 80)
}

const othersExpanded = ref(false)

// ── Project Agents (only when a project tab is active) ──
const projectAgents = computed(() => {
  if (!store.activeProject) return []
  const names = store.projectAgentNames
  return store.realAgents
    .filter((a) => names.has(a.name) || names.has(a.id))
    .sort((a, b) => {
      const aGraph = isGraphAgent(a) ? 1 : 0
      const bGraph = isGraphAgent(b) ? 1 : 0
      if (bGraph !== aGraph) return bGraph - aGraph
      return b.messageCount - a.messageCount
    })
})

// IDs of project agents (to exclude from active/offline lists when project is active)
const projectAgentIds = computed(() => new Set(projectAgents.value.map((a) => a.id)))

// ── Active Agents (always visible) ──
const sortedActive = computed(() => {
  let list = [...store.activeAgents].sort((a, b) => b.messageCount - a.messageCount)
  // When project is active, exclude agents already shown in Project Agents section
  if (store.activeProject) {
    list = list.filter((a) => !projectAgentIds.value.has(a.id))
  }
  return list
})

// ── Other Agents (collapsed, always available) ──
const sortedOffline = computed(() => {
  let list = [...store.offlineAgents].sort((a, b) => b.messageCount - a.messageCount)
  if (store.activeProject) {
    list = list.filter((a) => !projectAgentIds.value.has(a.id))
  }
  return list
})

// Auto-expand "Other Agents" when no active agents exist
const autoExpandOthers = computed(() => sortedActive.value.length === 0 && projectAgents.value.length === 0)

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

function statusDotClass(agent: Agent): 'online' | 'idle' | 'offline' {
  if (agent.status === 'active') return 'online'
  if (agent.status === 'idle') return 'idle'
  return 'offline'
}

function statusTextClass(agent: Agent): 'online-text' | 'idle-text' | 'offline-text' {
  if (agent.status === 'active') return 'online-text'
  if (agent.status === 'idle') return 'idle-text'
  return 'offline-text'
}

function selectAgent(agent: Agent) {
  emit('filter-agent', agent.name)
}
</script>

<template>
  <div class="agent-roster">
    <!-- Project Agents section (only when project tab is active and has agents) -->
    <template v-if="store.activeProject && projectAgents.length > 0">
      <div class="panel-header project-header">
        <span class="panel-title project-title"><span class="header-icon">&#x1F4C1;</span> Project Agents</span>
        <span class="panel-count project-count">{{ projectAgents.length }}</span>
      </div>
      <div class="project-agents-list">
        <div
          v-for="agent in projectAgents"
          :key="'proj-' + agent.id"
          class="agent-card project"
          @click="selectAgent(agent)"
        >
          <span class="agent-avatar">{{ meta(agent).avatar }}</span>
          <div class="agent-info">
            <div class="agent-name-row">
              <span class="agent-name">{{ agent.displayName }}</span>
              <span v-if="isGraphAgent(agent)" class="graph-badge" title="Graph-discovered participant">&#x1F517;</span>
            </div>
            <span class="agent-role">{{ projectRole(agent) }}</span>
            <span v-if="lastProjectMsg(agent)" class="agent-last-msg">{{ lastProjectMsg(agent) }}</span>
          </div>
          <div class="agent-right">
            <div class="agent-status-row">
              <span class="status-dot" :class="statusDotClass(agent)"></span>
              <span class="status-time" :class="statusTextClass(agent)">{{ timeAgo(agent.lastSeen) }}</span>
            </div>
            <span class="agent-msgs">{{ agent.messageCount }} msgs</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Active Agents header (always shown) -->
    <div class="panel-header">
      <span class="panel-title"><span class="header-icon">&#x1F916;</span> Active Agents</span>
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
            <span class="status-dot" :class="statusDotClass(agent)"></span>
            <span class="status-time" :class="statusTextClass(agent)">{{ timeAgo(agent.lastSeen) }}</span>
          </div>
          <span class="agent-msgs">{{ agent.messageCount }} msgs</span>
        </div>
      </div>

      <!-- Collapsible Other Agents -->
      <template v-if="sortedOffline.length > 0">
        <div class="section-divider" @click="othersExpanded = !othersExpanded">
          <span class="divider-chevron">{{ (othersExpanded || autoExpandOthers) ? '\u25BE' : '\u25B8' }}</span>
          <span class="divider-label">Other Agents</span>
          <span class="divider-count">{{ sortedOffline.length }}</span>
        </div>
        <template v-if="othersExpanded || autoExpandOthers">
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
        No agents registered
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

/* ── Project Agents section (cyan-accented) ── */
.project-header {
  background: var(--cc-cyan-dim);
  border-bottom: 1px solid var(--cc-cyan);
}

.project-title {
  color: var(--cc-cyan);
}

.project-count {
  background: var(--cc-cyan);
  color: var(--cc-bg);
}

.project-agents-list {
  padding: 0.35rem;
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}

.agent-card.project {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  margin-bottom: 0.15rem;
  background: var(--cc-cyan-dim);
  border: 1px solid var(--cc-cyan);
  transition: background 0.15s;
  cursor: pointer;
}

.agent-card.project:hover {
  background: rgba(34, 211, 238, 0.15);
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

.agent-name-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.graph-badge {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  opacity: 0.7;
}

.agent-role {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.agent-last-msg {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
  font-style: italic;
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

.status-dot.idle {
  background: var(--cc-amber);
  box-shadow: 0 0 5px var(--cc-amber-dim);
}

.status-dot.offline {
  background: var(--cc-red);
  box-shadow: 0 0 5px var(--cc-red-dim);
}

.online-text {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-green);
  font-weight: 500;
}

.idle-text {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-amber);
  font-weight: 500;
}

.offline-text {
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  color: var(--cc-red);
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
