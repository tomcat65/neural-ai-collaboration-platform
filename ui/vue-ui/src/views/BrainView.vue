<template>
  <div class="brain-view">
    <div class="brain-header">
      <router-link to="/" class="back-link">Back to Dashboard</router-link>
      <h1 class="brain-title">Neural Brain</h1>
      <div class="brain-status">
        <span v-if="brainStore.loading" class="status-loading">Loading graph...</span>
        <span v-else class="status-ready">
          {{ brainStore.nodes.length }} entities | {{ brainStore.links.length }} relations
        </span>
      </div>
    </div>
    <div class="brain-canvas">
      <BrainGraph />
      <BrainDetailsPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import BrainGraph from '@/components/BrainGraph.vue'
import BrainDetailsPanel from '@/components/BrainDetailsPanel.vue'
import { useBrainStore } from '@/stores/brain'

const brainStore = useBrainStore()
</script>

<style scoped>
.brain-view {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: #050510;
  color: #ffffff;
  overflow: hidden;
}

.brain-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 24px;
  background: rgba(5, 5, 16, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 229, 255, 0.1);
  flex-shrink: 0;
  z-index: 10;
}

.back-link {
  color: #10b981;
  text-decoration: none;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  transition: all 0.3s ease;
}

.back-link:hover {
  background: rgba(16, 185, 129, 0.15);
}

.brain-title {
  margin: 0;
  font-size: 1.4rem;
  background: linear-gradient(135deg, #00e5ff, #bf5af2, #ff2d78);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: none;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.brain-status {
  margin-left: auto;
  font-size: 0.85rem;
}

.status-loading {
  color: #f59e0b;
}

.status-ready {
  color: #6b7280;
}

.brain-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
