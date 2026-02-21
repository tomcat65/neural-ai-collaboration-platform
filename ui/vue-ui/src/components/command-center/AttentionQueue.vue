<script setup lang="ts">
import { useCommandCenterStore } from '@/stores/command-center'
import type { AttentionItem } from '@/types/command-center'

const store = useCommandCenterStore()

function reasonLabel(reason: AttentionItem['reason']): string {
  if (reason === 'urgent') return 'URGENT'
  if (reason === 'query') return 'QUERY'
  return 'FOR YOU'
}

function reasonColor(reason: AttentionItem['reason']): string {
  if (reason === 'urgent') return 'var(--cc-red)'
  if (reason === 'query') return 'var(--cc-amber)'
  return 'var(--cc-cyan)'
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function truncate(text: string, len: number): string {
  return text.length <= len ? text : text.slice(0, len) + '...'
}
</script>

<template>
  <div class="attention-queue">
    <div class="panel-header">
      <span class="panel-title">Attention Queue</span>
      <span v-if="store.attentionItems.length > 0" class="attn-count">{{ store.attentionItems.length }}</span>
    </div>
    <div class="attn-list">
      <div
        v-for="item in store.attentionItems"
        :key="item.message.id"
        class="attn-card"
        :class="{ 'is-urgent': item.reason === 'urgent' }"
      >
        <div class="attn-top">
          <span class="attn-reason" :style="{ color: reasonColor(item.reason), borderColor: reasonColor(item.reason) }">
            {{ reasonLabel(item.reason) }}
          </span>
          <span class="attn-from">{{ item.message.fromAgent }}</span>
          <span class="attn-time">{{ formatTime(item.message.createdAt) }}</span>
        </div>
        <div class="attn-content">
          {{ truncate(item.message.content, 150) }}
        </div>
        <div class="attn-actions">
          <button class="attn-btn dismiss" @click.stop="store.dismissAttention(item.message.id)">
            Dismiss
          </button>
        </div>
      </div>

      <div v-if="store.attentionItems.length === 0" class="empty-state">
        No items need attention
      </div>
    </div>
  </div>
</template>

<style scoped>
.attention-queue {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--cc-border);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
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
  color: var(--cc-red);
}

.attn-count {
  background: var(--cc-red-dim);
  color: var(--cc-red);
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-weight: 700;
  animation: pulse-badge 2s ease-in-out infinite;
}

.attn-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.attn-card {
  background: var(--cc-surface-1);
  border: 1px solid var(--cc-border);
  border-radius: 5px;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.3rem;
  transition: border-color 0.3s;
}

.attn-card.is-urgent {
  border-color: var(--cc-red);
  box-shadow: 0 0 8px var(--cc-red-dim);
  animation: glow-red 2s ease-in-out infinite;
}

.attn-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.attn-reason {
  font-size: calc(0.55rem * var(--cc-font-scale, 1));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.05rem 0.3rem;
  border: 1px solid;
  border-radius: 2px;
}

.attn-from {
  font-size: calc(0.7rem * var(--cc-font-scale, 1));
  color: var(--cc-cyan);
  font-weight: 500;
}

.attn-time {
  margin-left: auto;
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.attn-content {
  font-size: calc(0.72rem * var(--cc-font-scale, 1));
  color: var(--cc-text-dim);
  line-height: 1.4;
  margin-bottom: 0.3rem;
}

.attn-actions {
  display: flex;
  gap: 0.3rem;
}

.attn-btn {
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
}

.attn-btn.dismiss {
  background: transparent;
  color: var(--cc-text-muted);
  border-color: var(--cc-border);
}

.attn-btn.dismiss:hover {
  color: var(--cc-text);
  border-color: var(--cc-text-muted);
}

.empty-state {
  padding: 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
}

@keyframes glow-red {
  0%, 100% { box-shadow: 0 0 4px var(--cc-red-dim); }
  50% { box-shadow: 0 0 12px var(--cc-red-dim), 0 0 20px rgba(239, 68, 68, 0.1); }
}

@keyframes pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
