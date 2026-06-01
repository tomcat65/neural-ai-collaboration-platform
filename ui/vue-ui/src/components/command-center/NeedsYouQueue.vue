<script setup lang="ts">
// Needs-You queue — the ACTION lens of the overview. Renders the deterministic
// store.needsYou selector (Phase 0): unread + (addressed to you OR urgent). A
// query/question between two other agents does NOT appear here (codex §5).
import { useCommandCenterStore } from '@/stores/command-center'
import type { Message } from '@/types/command-center'

const store = useCommandCenterStore()

function typeBadge(m: Message): string {
  const t = m.messageType.toLowerCase()
  if (t === 'urgent') return 'URGENT'
  if (t === 'query' || t === 'question') return 'QUERY'
  return 'FOR YOU'
}
function badgeColor(m: Message): string {
  const t = m.messageType.toLowerCase()
  if (t === 'urgent') return 'var(--cc-red)'
  if (t === 'query' || t === 'question') return 'var(--cc-amber)'
  return 'var(--cc-cyan)'
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function preview(text: string, len = 160): string {
  return text.length <= len ? text : text.slice(0, len) + '…'
}
function onMarkRead(m: Message) {
  // Recipient-scoped mark-read (server's mark_messages_read via the store action).
  store.markRead(m.toAgent, [m.id])
}
</script>

<template>
  <section class="needs-you">
    <header class="sec-header">
      <span class="sec-lens action">ACTION</span>
      <span class="sec-title">Needs you</span>
      <span v-if="store.needsYou.length" class="sec-count">{{ store.needsYou.length }}</span>
    </header>

    <div class="card-list">
      <article
        v-for="m in store.needsYou"
        :key="m.id"
        class="ny-card"
        :class="{ urgent: m.messageType.toLowerCase() === 'urgent' }"
      >
        <div class="ny-top">
          <span class="ny-badge" :style="{ color: badgeColor(m), borderColor: badgeColor(m) }">{{ typeBadge(m) }}</span>
          <span class="ny-route">{{ m.fromAgent }} → {{ m.toAgent }}</span>
          <span class="ny-time">{{ fmtTime(m.createdAt) }}</span>
        </div>
        <p class="ny-body">{{ preview(m.content) }}</p>
        <div class="ny-actions">
          <button class="ny-btn" @click="onMarkRead(m)">Mark read</button>
        </div>
      </article>

      <div v-if="store.needsYou.length === 0" class="empty-state">
        ✓ You're all clear — nothing needs you right now
      </div>
    </div>
  </section>
</template>

<style scoped>
.needs-you {
  display: flex;
  flex-direction: column;
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}
.sec-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: var(--cc-surface-2);
  border-bottom: 1px solid var(--cc-border);
}
.sec-lens {
  font-size: calc(0.54rem * var(--cc-font-scale, 1));
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}
.sec-lens.action {
  color: #11151c;
  background: var(--cc-red);
}
.sec-title {
  font-family: 'Outfit', sans-serif;
  font-size: calc(0.82rem * var(--cc-font-scale, 1));
  font-weight: 600;
  color: var(--cc-text);
}
.sec-count {
  margin-left: auto;
  background: var(--cc-red-dim);
  color: var(--cc-red);
  font-size: calc(0.66rem * var(--cc-font-scale, 1));
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}
.card-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ny-card {
  background: var(--cc-surface-2);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
}
.ny-card.urgent {
  border-color: var(--cc-red);
  box-shadow: 0 0 8px var(--cc-red-dim);
}
.ny-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}
.ny-badge {
  font-size: calc(0.54rem * var(--cc-font-scale, 1));
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.05rem 0.3rem;
  border: 1px solid;
  border-radius: 2px;
}
.ny-route {
  font-size: calc(0.68rem * var(--cc-font-scale, 1));
  color: var(--cc-cyan);
  font-weight: 500;
}
.ny-time {
  margin-left: auto;
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}
.ny-body {
  font-size: calc(0.76rem * var(--cc-font-scale, 1));
  color: var(--cc-text-dim);
  line-height: 1.45;
  margin-bottom: 0.4rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.ny-actions {
  display: flex;
  gap: 0.3rem;
}
.ny-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.62rem * var(--cc-font-scale, 1));
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  background: var(--cc-surface-1);
  color: var(--cc-text-muted);
  border: 1px solid var(--cc-border);
  transition: all 0.15s;
}
.ny-btn:hover {
  color: var(--cc-cyan);
  border-color: var(--cc-cyan);
}
.empty-state {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.8rem * var(--cc-font-scale, 1));
}
</style>
