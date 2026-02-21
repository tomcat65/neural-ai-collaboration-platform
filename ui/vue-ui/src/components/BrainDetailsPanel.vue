<template>
  <transition name="panel-slide">
    <div v-if="brainStore.selectedEntity" class="brain-details-panel">
      <button class="panel-close" @click="brainStore.clearSelection">&times;</button>

      <div class="panel-header">
        <h2 class="entity-name">{{ brainStore.selectedEntity.name }}</h2>
        <span class="type-badge" :style="{ backgroundColor: typeColor }">
          {{ brainStore.selectedEntity.entityType }}
        </span>
      </div>

      <div class="entity-meta">
        <span class="meta-label">Created:</span>
        <span class="meta-value">{{ formattedDate }}</span>
      </div>

      <div class="observations-section">
        <h3 class="observations-title">
          Observations
          <span class="obs-count">({{ brainStore.observations.length }})</span>
        </h3>

        <div v-if="brainStore.observationsLoading" class="obs-loading">
          Loading observations...
        </div>

        <div v-else-if="brainStore.observations.length === 0" class="obs-empty">
          No observations found.
        </div>

        <div v-else class="observations-list" ref="obsListRef">
          <div
            v-for="(obs, index) in visibleObservations"
            :key="index"
            class="observation-card"
          >
            <div
              v-for="(content, cIdx) in obs.contents"
              :key="cIdx"
              class="obs-content"
            >
              {{ content }}
            </div>
            <div v-if="obs.createdAt" class="obs-date">
              {{ formatObsDate(obs.createdAt) }}
            </div>
          </div>

          <button
            v-if="hasMore"
            class="load-more-btn"
            @click="loadMore"
          >
            Show more ({{ brainStore.observations.length - displayCount }} remaining)
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'

const brainStore = useBrainStore()
const obsListRef = ref<HTMLDivElement | null>(null)

const PAGE_SIZE = 20
const displayCount = ref(PAGE_SIZE)

const TYPE_COLORS: Record<string, string> = {
  project: '#00e5ff',
  person: '#ff6b35',
  feature: '#39ff14',
  tool: '#bf5af2',
  concept: '#ff2d78'
}

const typeColor = computed(() => {
  if (!brainStore.selectedEntity) return '#ffffff'
  return TYPE_COLORS[brainStore.selectedEntity.entityType] ?? '#6b7280'
})

const formattedDate = computed(() => {
  if (!brainStore.selectedEntity?.createdAt) return 'Unknown'
  return new Date(brainStore.selectedEntity.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
})

const visibleObservations = computed(() => {
  return brainStore.observations.slice(0, displayCount.value)
})

const hasMore = computed(() => {
  return brainStore.observations.length > displayCount.value
})

function loadMore() {
  displayCount.value += PAGE_SIZE
}

function formatObsDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Reset pagination when entity changes
watch(
  () => brainStore.selectedEntity?.name,
  () => {
    displayCount.value = PAGE_SIZE
  }
)
</script>

<style scoped>
.brain-details-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 380px;
  height: 100%;
  background: rgba(8, 8, 18, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-left: 1px solid rgba(0, 229, 255, 0.15);
  display: flex;
  flex-direction: column;
  z-index: 20;
  overflow: hidden;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.5), -2px 0 20px rgba(0, 229, 255, 0.05);
}

.panel-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  transition: color 0.2s, background 0.2s;
}

.panel-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.panel-header {
  padding: 20px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.entity-name {
  margin: 0 0 8px;
  font-size: 1.3rem;
  color: #f0f4ff;
  word-break: break-word;
  padding-right: 30px;
  text-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
}

.type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  box-shadow: 0 0 12px currentColor;
  text-shadow: 0 0 6px currentColor;
}

.entity-meta {
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.85rem;
}

.meta-label {
  color: #6b7280;
  margin-right: 6px;
}

.meta-value {
  color: #d1d5db;
}

.observations-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 0 0;
}

.observations-title {
  margin: 0 20px 12px;
  font-size: 1rem;
  color: #e5e7eb;
}

.obs-count {
  color: #6b7280;
  font-weight: 400;
  font-size: 0.85rem;
}

.obs-loading,
.obs-empty {
  padding: 20px;
  color: #6b7280;
  text-align: center;
  font-size: 0.9rem;
}

.observations-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.observation-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 229, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  transition: border-color 0.2s, background 0.2s;
}

.observation-card:hover {
  border-color: rgba(0, 229, 255, 0.2);
  background: rgba(0, 229, 255, 0.04);
}

.obs-content {
  color: #d1d5db;
  font-size: 0.85rem;
  line-height: 1.5;
  word-break: break-word;
}

.obs-date {
  color: #4b5563;
  font-size: 0.75rem;
  margin-top: 8px;
}

.load-more-btn {
  width: 100%;
  padding: 10px;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #9ca3af;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.load-more-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
}

/* Slide transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.3s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
}

/* Responsive: full overlay on small screens */
@media (max-width: 767px) {
  .brain-details-panel {
    width: 100%;
  }
}
</style>
