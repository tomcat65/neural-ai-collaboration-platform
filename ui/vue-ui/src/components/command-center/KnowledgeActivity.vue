<script setup lang="ts">
import { useCommandCenterStore } from '@/stores/command-center'

const store = useCommandCenterStore()

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function truncate(text: string, len: number): string {
  return text.length <= len ? text : text.slice(0, len) + '...'
}

function entityTypeColor(type: string): string {
  const t = type.toLowerCase()
  if (t === 'project') return 'var(--cc-cyan)'
  if (t === 'agent' || t === 'person') return 'var(--cc-green)'
  if (t === 'task' || t === 'issue') return 'var(--cc-amber)'
  if (t === 'plan' || t === 'document') return 'var(--cc-purple)'
  return 'var(--cc-text-muted)'
}
</script>

<template>
  <div class="knowledge-activity">
    <div class="panel-header">
      <span class="panel-title">Knowledge Activity</span>
      <span class="panel-count">{{ store.filteredKnowledge.length }}</span>
    </div>
    <div class="knowledge-list">
      <div
        v-for="item in store.filteredKnowledge"
        :key="item.entityName"
        class="knowledge-row"
        :class="{ 'is-new': item.isNew }"
      >
        <div class="knowledge-top">
          <span class="entity-type" :style="{ color: entityTypeColor(item.entityType) }">{{ item.entityType }}</span>
          <span v-if="item.isNew" class="new-badge">NEW</span>
          <span class="knowledge-time">{{ timeAgo(item.updatedAt) }}</span>
        </div>
        <div class="entity-name">{{ item.entityName }}</div>
        <div v-if="item.latestObservation" class="latest-obs">
          {{ truncate(item.latestObservation, 120) }}
        </div>
        <div class="obs-count">{{ item.observationCount }} observations</div>
      </div>

      <div v-if="store.filteredKnowledge.length === 0" class="empty-state">
        {{ store.activeProject ? `No knowledge for ${store.activeProject}` : 'No knowledge activity' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.knowledge-activity {
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
  color: var(--cc-purple);
}

.panel-count {
  background: var(--cc-cyan-dim);
  color: var(--cc-cyan);
  font-size: calc(0.65rem * var(--cc-font-scale, 1));
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
}

.knowledge-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.knowledge-row {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--cc-border);
  transition: background 0.15s;
}

.knowledge-row:hover {
  background: var(--cc-surface-2);
}

.knowledge-row.is-new {
  border-left: 2px solid var(--cc-amber);
}

.knowledge-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.15rem;
}

.entity-type {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.new-badge {
  background: var(--cc-amber-dim);
  color: var(--cc-amber);
  font-size: calc(0.55rem * var(--cc-font-scale, 1));
  padding: 0.05rem 0.3rem;
  border-radius: 2px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.knowledge-time {
  margin-left: auto;
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
}

.entity-name {
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
  color: var(--cc-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.latest-obs {
  font-size: calc(0.68rem * var(--cc-font-scale, 1));
  color: var(--cc-text-dim);
  margin-top: 0.15rem;
  line-height: 1.4;
}

.obs-count {
  font-size: calc(0.6rem * var(--cc-font-scale, 1));
  color: var(--cc-text-muted);
  margin-top: 0.1rem;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  color: var(--cc-text-muted);
  font-size: calc(0.75rem * var(--cc-font-scale, 1));
}
</style>
