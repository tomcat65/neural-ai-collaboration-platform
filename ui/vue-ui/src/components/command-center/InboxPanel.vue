<script setup lang="ts">
import { useCommandCenterStore } from '@/stores/command-center'
import type { Message } from '@/types/command-center'

const store = useCommandCenterStore()

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtDate(d: Date): string {
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function preview(text: string, len = 120): string {
  return text.length <= len ? text : text.slice(0, len) + '…'
}

function onMarkRead(agent: string, m: Message) {
  store.markRead(agent, [m.id])
}
function onArchive(agent: string, m: Message) {
  store.archive(agent, [m.id])
}
function onMarkAll(agent: string) {
  store.markRead(agent)
}
</script>

<template>
  <div class="inbox-panel">
    <div class="panel-header">
      <span class="panel-title">Inbox</span>
      <span v-if="store.totalUnread > 0" class="unread-pill">{{ store.totalUnread }} unread</span>
    </div>

    <div class="inbox-list">
      <div v-for="group in store.unreadInbox" :key="group.agent" class="inbox-group">
        <div class="group-header">
          <span class="group-agent">{{ group.agent }}</span>
          <span class="group-count">{{ group.count }}</span>
          <button class="group-action" title="Mark all unread read for this recipient" @click="onMarkAll(group.agent)">
            Mark all read
          </button>
        </div>

        <div v-if="group.previews.length === 0" class="group-note">
          {{ group.count }} unread (outside the loaded window)
        </div>

        <div v-for="m in group.previews" :key="m.id" class="preview-card">
          <div class="preview-head">
            <span class="preview-from">{{ m.fromAgent }}</span>
            <span class="preview-time" :title="m.createdAt.toISOString()">{{ fmtDate(m.createdAt) }} {{ fmtTime(m.createdAt) }}</span>
          </div>
          <div class="preview-body">{{ preview(m.content) }}</div>
          <div class="preview-actions">
            <button class="pv-btn read-btn" title="Mark this message read" @click="onMarkRead(group.agent, m)">Mark read</button>
            <button class="pv-btn archive-btn" title="Archive this message" @click="onArchive(group.agent, m)">Archive</button>
          </div>
        </div>
      </div>

      <div v-if="store.unreadInbox.length === 0" class="empty-state">
        Inbox zero &mdash; no unread messages
      </div>
    </div>
  </div>
</template>

<style scoped>
.inbox-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.unread-pill {
  margin-left: auto;
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #11151c;
  background: var(--cc-amber);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

.inbox-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inbox-group {
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  background: var(--cc-surface-1);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: var(--cc-surface-2);
  border-bottom: 1px solid var(--cc-border);
}

.group-agent {
  font-weight: 600;
  color: var(--cc-green);
  font-size: calc(0.74rem * var(--cc-font-scale, 1));
}

.group-count {
  font-size: calc(0.58rem * var(--cc-font-scale, 1));
  font-weight: 700;
  color: #11151c;
  background: var(--cc-amber);
  border-radius: 999px;
  padding: 0.02rem 0.35rem;
}

.group-action {
  margin-left: auto;
  background: var(--cc-surface-1);
  color: var(--cc-text-muted);
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
}

.group-action:hover {
  border-color: var(--cc-cyan);
  color: var(--cc-text);
}

.group-note {
  padding: 0.4rem 0.5rem;
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  font-style: italic;
}

.preview-card {
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--cc-border);
}

.preview-head {
  display: flex;
  justify-content: space-between;
  gap: 0.3rem;
  margin-bottom: 0.2rem;
}

.preview-from {
  color: var(--cc-cyan);
  font-weight: 600;
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
}

.preview-time {
  color: var(--cc-text-muted);
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  white-space: nowrap;
}

.preview-body {
  color: var(--cc-text-dim);
  font-size: calc(0.74rem * var(--cc-font-scale, 1));
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.3rem;
}

.preview-actions {
  display: flex;
  gap: 0.3rem;
}

.pv-btn {
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  padding: 0.15rem 0.45rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  background: var(--cc-surface-2);
  color: var(--cc-text-muted);
}

.read-btn:hover {
  border-color: var(--cc-cyan);
  color: var(--cc-cyan);
}

.archive-btn:hover {
  border-color: var(--cc-amber);
  color: var(--cc-amber);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
}
</style>
