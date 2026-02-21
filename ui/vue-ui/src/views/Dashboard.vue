<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h1>🎆 Multi-Agent Observatory</h1>
      <div class="dashboard-controls">
        <button @click="refreshAll" class="refresh-all-btn" :disabled="isRefreshing">
          {{ isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh All' }}
        </button>
        <div class="connection-status" :class="{ connected: globalConnection }">
          {{ globalConnection ? '🟢 Connected' : '🔴 Disconnected' }}
        </div>
      </div>
    </div>

    <!-- Error Banner -->
    <div v-if="hasError" class="error-banner">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ errorMessage }}</span>
        <button @click="refreshAll" class="error-retry-btn">Retry</button>
      </div>
    </div>

    <div class="dashboard-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="nav-tab"
        :class="{ active: activeTab === tab.id }"
      >
        {{ tab.icon }} {{ tab.name }}
      </button>
      <router-link to="/brain" class="nav-tab brain-nav-link">
        Neural Brain
      </router-link>
    </div>

    <div class="dashboard-content">
      <!-- Overview Grid - Default View -->
      <div v-if="activeTab === 'overview'" class="overview-grid">
        <div class="overview-item">
          <LiveActivityPulse />
        </div>
        <div class="overview-item">
          <AgentStatusCards />
        </div>
        <div class="overview-item">
          <EventStreamFeed />
        </div>
        <div class="overview-item">
          <AnalyticsDashboard />
        </div>
        <div class="overview-item">
          <HumanNotificationPanel />
        </div>
      </div>

      <!-- Individual Component Views -->
      <div v-else-if="activeTab === 'activity'" class="single-component">
        <LiveActivityPulse />
      </div>

      <div v-else-if="activeTab === 'agents'" class="single-component">
        <AgentStatusCards />
      </div>

      <div v-else-if="activeTab === 'events'" class="single-component">
        <EventStreamFeed />
      </div>

      <div v-else-if="activeTab === 'analytics'" class="single-component">
        <AnalyticsDashboard />
      </div>

      <div v-else-if="activeTab === 'collaboration'" class="single-component">
        <CollaborationDashboard />
      </div>

      <div v-else-if="activeTab === 'notifications'" class="single-component">
        <HumanNotificationPanel />
      </div>
    </div>

    <div class="dashboard-footer">
      <div class="system-stats">
        <span>{{ totalEvents }} Events</span>
        <span>{{ activeAgents }} Agents</span>
        <span>{{ systemUptime }} Uptime</span>
      </div>
      <div class="dashboard-info">
        Multi-Agent Dashboard v1.0 | Built with Vue 3 + TDD
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import LiveActivityPulse from '@/components/LiveActivityPulse.vue'
import AgentStatusCards from '@/components/AgentStatusCards.vue'
import EventStreamFeed from '@/components/EventStreamFeed.vue'
import AnalyticsDashboard from '@/components/AnalyticsDashboard.vue'
import CollaborationDashboard from '@/components/CollaborationDashboard.vue'
import HumanNotificationPanel from '@/components/HumanNotificationPanel.vue'

const dashboardStore = useDashboardStore()
const activeTab = ref('overview')
const globalConnection = ref(false)
const isRefreshing = ref(false)

const tabs = [
  { id: 'overview', name: 'Overview', icon: '🏠' },
  { id: 'activity', name: 'Activity', icon: '📊' },
  { id: 'agents', name: 'Agents', icon: '🤖' },
  { id: 'events', name: 'Events', icon: '📝' },
  { id: 'analytics', name: 'Analytics', icon: '📈' },
  { id: 'collaboration', name: 'Collaboration', icon: '🤝' },
  { id: 'notifications', name: 'Notifications', icon: '🔔' }
]

const totalEvents = computed(() => dashboardStore.totalEvents)
const activeAgents = computed(() => dashboardStore.activeAgents)
const systemUptime = computed(() => dashboardStore.systemUptime)
const hasError = computed(() => dashboardStore.hasError)
const errorMessage = computed(() => dashboardStore.errorMessage)

const refreshAll = async () => {
  isRefreshing.value = true
  try {
    await dashboardStore.refreshAll()
  } finally {
    isRefreshing.value = false
  }
}

onMounted(() => {
  dashboardStore.initialize()

  // Monitor global connection status
  dashboardStore.onConnectionChange((status) => {
    globalConnection.value = status
  })
})
</script>

<style scoped>
.dashboard-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dashboard-header h1 {
  font-size: 2.5rem;
  margin: 0;
  background: linear-gradient(45deg, #10b981, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.dashboard-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.refresh-all-btn {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.refresh-all-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.3);
  transform: translateY(-1px);
}

.refresh-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.connection-status {
  padding: 8px 16px;
  border-radius: 20px;
  background: #dc2626;
  font-weight: bold;
  transition: all 0.3s ease;
}

.connection-status.connected {
  background: #10b981;
}

.error-banner {
  background: rgba(220, 38, 38, 0.2);
  border-bottom: 1px solid rgba(220, 38, 38, 0.3);
  padding: 12px 30px;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.error-icon {
  font-size: 18px;
}

.error-text {
  color: #fca5a5;
  font-weight: 500;
}

.error-retry-btn {
  background: rgba(220, 38, 38, 0.3);
  color: #fca5a5;
  border: 1px solid rgba(220, 38, 38, 0.5);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.error-retry-btn:hover {
  background: rgba(220, 38, 38, 0.4);
}

.dashboard-nav {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 30px;
}

.nav-tab {
  background: none;
  border: none;
  color: #888;
  padding: 15px 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  border-bottom: 3px solid transparent;
  font-size: 16px;
  font-weight: 500;
}

.nav-tab:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.05);
}

.nav-tab.active {
  color: #10b981;
  border-bottom-color: #10b981;
}

.brain-nav-link {
  text-decoration: none;
  margin-left: auto;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  color: #8b5cf6;
  font-weight: 600;
}

.brain-nav-link:hover {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.dashboard-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
  gap: 30px;
  height: 100%;
}

.overview-item {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.single-component {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.dashboard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 30px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
}

.system-stats {
  display: flex;
  gap: 30px;
}

.system-stats span {
  color: #10b981;
  font-weight: 600;
}

.dashboard-info {
  color: #888;
}

/* Responsive Design */
@media (max-width: 768px) {
  .dashboard-header h1 {
    font-size: 1.8rem;
  }

  .dashboard-controls {
    flex-direction: column;
    gap: 10px;
  }

  .overview-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .dashboard-nav {
    overflow-x: auto;
  }

  .nav-tab {
    white-space: nowrap;
    min-width: 120px;
  }

  .dashboard-content {
    padding: 20px;
  }

  .error-content {
    flex-direction: column;
    gap: 8px;
  }
}
</style> 