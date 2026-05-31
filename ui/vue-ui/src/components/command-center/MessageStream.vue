<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useCommandCenterStore } from '@/stores/command-center'
import type { Message } from '@/types/command-center'

const store = useCommandCenterStore()

const streamEl = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

// Auto-scroll to top when new messages arrive (newest first)
watch(
  () => store.filteredMessages.length,
  async () => {
    if (autoScroll.value && streamEl.value) {
      await nextTick()
      streamEl.value.scrollTop = 0
    }
  }
)

function handleScroll() {
  if (!streamEl.value) return
  autoScroll.value = streamEl.value.scrollTop < 50
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatDate(date: Date): string {
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function truncate(text: string, len: number): string {
  if (text.length <= len) return text
  return text.slice(0, len) + '...'
}

function typeColor(type: string): string {
  const t = type.toLowerCase()
  if (t === 'urgent' || t === 'error') return 'var(--cc-red)'
  if (t === 'query' || t === 'question') return 'var(--cc-amber)'
  if (t === 'collaboration' || t === 'coordination') return 'var(--cc-purple)'
  if (t === 'analysis' || t === 'status') return 'var(--cc-cyan)'
  return 'var(--cc-text-muted)'
}

function priorityClass(msg: Message): string {
  const t = msg.messageType.toLowerCase()
  if (t === 'urgent') return 'priority-urgent'
  if (t === 'query') return 'priority-query'
  return ''
}

const READ_STATES = ['all', 'unread', 'archived'] as const
</script>

<template>
  <div class="message-stream">
    <!-- Header + Filter Bar -->
    <div class="panel-header">
      <span class="panel-title">Message Stream</span>
      <span v-if="store.totalUnread > 0" class="unread-pill" :title="`${store.totalUnread} unread`">{{ store.totalUnread }} unread</span>
      <span class="msg-count">{{ store.filteredMessages.length }}/{{ store.messages.length }}</span>
    </div>

    <div class="filter-bar">
      <input
        type="text"
        class="filter-input search-input"
        placeholder="Search messages..."
        :value="store.filter.search"
        @input="store.setFilter({ search: ($event.target as HTMLInputElement).value })"
      />
      <select
        class="filter-input"
        :value="store.filter.agent"
        @change="store.setFilter({ agent: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">All agents</option>
        <option v-for="name in store.agentNames" :key="name" :value="name">{{ name }}</option>
      </select>
      <select
        class="filter-input"
        :value="store.filter.type"
        @change="store.setFilter({ type: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">All types</option>
        <option v-for="t in store.messageTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <div class="read-state-seg" role="group" aria-label="Read state filter">
        <button
          v-for="opt in READ_STATES"
          :key="opt"
          class="seg-btn"
          :class="{ active: store.filter.readState === opt }"
          @click="store.setFilter({ readState: opt })"
        >{{ opt }}</button>
      </div>
      <button
        v-if="store.filter.search || store.filter.agent || store.filter.type || store.filter.readState !== 'all'"
        class="filter-clear"
        @click="store.clearFilter()"
      >
        Clear
      </button>
    </div>

    <!-- Message List -->
    <div class="message-list" ref="streamEl" @scroll="handleScroll">
      <div
        v-for="msg in store.filteredMessages"
        :key="msg.id"
        class="message-card"
        :class="[priorityClass(msg), { expanded: msg.isExpanded, unread: !msg.isRead && !msg.isArchived, archived: msg.isArchived }]"
        @click="store.toggleMessageExpanded(msg.id)"
      >
        <div class="msg-header">
          <div class="msg-routing">
            <span v-if="!msg.isRead && !msg.isArchived" class="unread-dot" title="Unread"></span>
            <span class="msg-from">{{ msg.fromAgent }}</span>
            <span class="msg-arrow">&#8594;</span>
            <span class="msg-to">{{ msg.toAgent }}</span>
          </div>
          <div class="msg-meta">
            <span v-if="msg.isArchived" class="msg-state-badge archived-badge" title="Archived">archived</span>
            <span v-else-if="msg.isRead" class="msg-state-badge read-badge" :title="msg.readAt ? `Read ${formatDate(msg.readAt)} ${formatTime(msg.readAt)}` : 'Read'">read</span>
            <span class="msg-type-badge" :style="{ color: typeColor(msg.messageType), borderColor: typeColor(msg.messageType) }">
              {{ msg.messageType }}
            </span>
            <span class="msg-time" :title="msg.createdAt.toISOString()">
              {{ formatDate(msg.createdAt) }} {{ formatTime(msg.createdAt) }}
            </span>
          </div>
        </div>
        <div class="msg-content" :class="{ collapsed: !msg.isExpanded }">
          {{ msg.isExpanded ? msg.content : truncate(msg.content, 200) }}
        </div>
        <div v-if="!msg.isExpanded && msg.content.length > 200" class="msg-expand-hint">
          Click to expand ({{ msg.content.length }} chars)
        </div>
      </div>

      <div v-if="store.filteredMessages.length === 0" class="empty-state">
        {{ store.messages.length === 0 ? 'No messages yet' : 'No messages match filters' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-stream {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
  color: var(--cc-amber);
}

.msg-count {
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

/* ── Filter Bar ──────────────────────────────────────────────── */

.filter-bar {
  display: flex;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}

.filter-input {
  background: var(--cc-surface-2);
  color: var(--cc-text);
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.72rem * var(--cc-font-scale, 1));
  outline: none;
  transition: border-color 0.15s;
}

.filter-input:focus {
  border-color: var(--cc-cyan);
}

.search-input {
  flex: 1;
  min-width: 0;
}

select.filter-input {
  max-width: 130px;
  cursor: pointer;
}

.filter-clear {
  background: var(--cc-red-dim);
  color: var(--cc-red);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
}

.filter-clear:hover {
  border-color: var(--cc-red);
}

/* ── Message List ────────────────────────────────────────────── */

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.message-card {
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  border-left: 3px solid transparent;
}

.message-card:hover {
  background: var(--cc-surface-2);
}

.message-card.expanded {
  background: var(--cc-surface-2);
  border-color: var(--cc-cyan);
  border-left-color: var(--cc-cyan);
}

.message-card.priority-urgent {
  border-left-color: var(--cc-red);
}

.message-card.priority-query {
  border-left-color: var(--cc-amber);
}

/* ── Message Header ──────────────────────────────────────────── */

.msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.msg-routing {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
}

.msg-from {
  color: var(--cc-cyan);
  font-weight: 600;
}

.msg-arrow {
  color: var(--cc-text-muted);
}

.msg-to {
  color: var(--cc-green);
  font-weight: 500;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.msg-type-badge {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.35rem;
  border: 1px solid;
  border-radius: 3px;
  font-weight: 600;
}

.msg-time {
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  white-space: nowrap;
}

/* ── Message Content ─────────────────────────────────────────── */

.msg-content {
  font-size: calc(0.78rem * var(--cc-font-scale, 1));
  color: var(--cc-text-dim);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-content.collapsed {
  max-height: 4.5em;
  overflow: hidden;
}

.msg-expand-hint {
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  margin-top: 0.2rem;
  font-style: italic;
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
}

/* ── Comms surface: read-state ───────────────────────────────── */
.unread-pill {
  margin-left: auto;
  margin-right: 0.4rem;
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #11151c;
  background: var(--cc-amber);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

.read-state-seg {
  display: flex;
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.seg-btn {
  background: var(--cc-surface-2);
  color: var(--cc-text-muted);
  border: none;
  border-left: 1px solid var(--cc-border);
  padding: 0.3rem 0.45rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.64rem * var(--cc-font-scale, 1));
  text-transform: capitalize;
}

.seg-btn:first-child { border-left: none; }

.seg-btn.active {
  background: var(--cc-cyan);
  color: #11151c;
  font-weight: 600;
}

.unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cc-amber);
  flex-shrink: 0;
}

.message-card.unread {
  border-left-color: var(--cc-amber);
}

.message-card.unread .msg-from {
  color: var(--cc-text);
}

.message-card.archived {
  opacity: 0.6;
}

.msg-state-badge {
  font-size: calc(0.55rem * var(--cc-font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-weight: 600;
  white-space: nowrap;
}

.read-badge {
  color: var(--cc-text-muted);
  border: 1px solid var(--cc-border);
}

.archived-badge {
  color: var(--cc-text-muted);
  background: var(--cc-surface-2);
  border: 1px solid var(--cc-border);
}
</style>
