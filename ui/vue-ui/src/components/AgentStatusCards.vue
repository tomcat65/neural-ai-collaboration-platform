<template>
  <div class="agent-status-cards">
    <div class="cards-header">
      <h2>🤖 Agent Status Monitor</h2>
      <div class="header-controls">
        <div class="connection-status" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          {{ isConnected ? 'Live' : 'Connecting...' }}
        </div>
        <button 
          @click="toggleAutoRefresh" 
          class="refresh-btn"
          :class="{ active: autoRefresh }"
        >
          {{ autoRefresh ? '🔄 Auto' : '⏸️ Manual' }}
        </button>
      </div>
    </div>
    
    <div class="filters-toolbar">
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search agents..."
          class="search-input"
        />
        <span class="search-icon">🔍</span>
      </div>
      
      <div class="filter-controls">
        <select v-model="selectedStatus" class="filter-select">
          <option value="">All Status</option>
          <option value="active">🟢 Active</option>
          <option value="busy">🟡 Busy</option>
          <option value="idle">⚪ Idle</option>
          <option value="offline">🔴 Offline</option>
        </select>
        
        <select v-model="sortBy" class="filter-select">
          <option value="name">Name</option>
          <option value="status">Status</option>
          <option value="events">Events</option>
          <option value="successRate">Success Rate</option>
          <option value="responseTime">Response Time</option>
        </select>
        
        <button 
          @click="toggleSortOrder" 
          class="sort-btn"
          :class="{ reverse: sortOrder === 'desc' }"
        >
          {{ sortOrder === 'asc' ? '↑' : '↓' }}
        </button>
      </div>
    </div>
    
    <div class="stats-overview">
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-info">
          <span class="stat-value">{{ totalAgents }}</span>
          <span class="stat-label">Total Agents</span>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">🟢</div>
        <div class="stat-info">
          <span class="stat-value">{{ activeAgents }}</span>
          <span class="stat-label">Active</span>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">🟡</div>
        <div class="stat-info">
          <span class="stat-value">{{ busyAgents }}</span>
          <span class="stat-label">Busy</span>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">🔴</div>
        <div class="stat-info">
          <span class="stat-value">{{ offlineAgents }}</span>
          <span class="stat-label">Offline</span>
        </div>
      </div>
    </div>
    
    <div class="agents-container">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading agent status...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <div class="error-icon">⚠️</div>
        <p>{{ error }}</p>
        <button @click="fetchAgentStatus" class="retry-btn">Retry</button>
      </div>
      
      <div v-else-if="filteredAgents.length === 0" class="no-agents">
        <div class="no-agents-icon">🤖</div>
        <p>No agents match your filters</p>
        <p class="no-agents-subtitle">Try adjusting your search or status filter</p>
      </div>
      
      <div v-else class="agents-grid">
        <div 
          v-for="agent in filteredAgents" 
          :key="agent.id"
          class="agent-card"
          :class="agent.status"
        >
          <div class="agent-header">
            <div class="agent-info">
              <div class="agent-avatar">{{ getAgentAvatar(agent.name) }}</div>
              <div class="agent-details">
                <h3 class="agent-name">{{ agent.name }}</h3>
                <span class="agent-type">{{ agent.type }}</span>
              </div>
            </div>
            <div class="status-indicator" :class="agent.status">
              <span class="status-dot"></span>
              <span class="status-text">{{ getStatusText(agent.status) }}</span>
            </div>
          </div>
          
          <div class="agent-metrics">
            <div class="metric-row">
              <div class="metric">
                <span class="metric-label">Events</span>
                <span class="metric-value">{{ agent.events }}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Success Rate</span>
                <span class="metric-value">{{ agent.successRate }}%</span>
              </div>
            </div>
            
            <div class="metric-row">
              <div class="metric">
                <span class="metric-label">Response Time</span>
                <span class="metric-value">{{ agent.responseTime }}ms</span>
              </div>
              <div class="metric">
                <span class="metric-label">Uptime</span>
                <span class="metric-value">{{ formatUptime(agent.uptime) }}</span>
              </div>
            </div>
          </div>
          
          <div class="agent-actions">
            <button @click="viewAgentDetails(agent)" class="action-btn">
              📊 Details
            </button>
            <button @click="pingAgent(agent)" class="action-btn">
              📡 Ping
            </button>
          </div>
          
          <div class="last-activity">
            <span class="activity-label">Last Activity:</span>
            <span class="activity-time">{{ formatTimestamp(agent.lastActivity) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

interface Agent {
  id: string
  name: string
  type: string
  status: 'active' | 'busy' | 'idle' | 'offline'
  events: number
  successRate: number
  responseTime: number
  uptime: number
  lastActivity: string
  details?: any
}

const searchQuery = ref('')
const selectedStatus = ref('')
const sortBy = ref('name')
const sortOrder = ref<'asc' | 'desc'>('asc')
const loading = ref(true)
const error = ref<string | null>(null)
const isConnected = ref(false)
const autoRefresh = ref(true)
const agents = ref<Agent[]>([])
let wsConnection: WebSocket | null = null
let refreshInterval: number | null = null

const totalAgents = computed(() => agents.value.length)

const activeAgents = computed(() => 
  agents.value.filter(agent => agent.status === 'active').length
)

const busyAgents = computed(() => 
  agents.value.filter(agent => agent.status === 'busy').length
)

const offlineAgents = computed(() => 
  agents.value.filter(agent => agent.status === 'offline').length
)

const filteredAgents = computed(() => {
  let filtered = agents.value.filter(agent => {
    // Search filter
    if (searchQuery.value && !agent.name.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      return false
    }
    
    // Status filter
    if (selectedStatus.value && agent.status !== selectedStatus.value) {
      return false
    }
    
    return true
  })
  
  // Sorting
  filtered.sort((a, b) => {
    let aValue: any = a[sortBy.value as keyof Agent]
    let bValue: any = b[sortBy.value as keyof Agent]
    
    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase()
      bValue = bValue.toLowerCase()
    }
    
    if (sortOrder.value === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })
  
  return filtered
})

const getAgentAvatar = (name: string) => {
  return name.charAt(0).toUpperCase()
}

const getStatusText = (status: string) => {
  const statusTexts = {
    active: 'Active',
    busy: 'Busy',
    idle: 'Idle',
    offline: 'Offline'
  }
  return statusTexts[status as keyof typeof statusTexts] || 'Unknown'
}

const formatUptime = (uptime: number) => {
  const hours = Math.floor(uptime / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  return `${hours}h ${minutes}m`
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString()
}

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startRefreshInterval()
  } else {
    stopRefreshInterval()
  }
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

const startRefreshInterval = () => {
  if (refreshInterval) return
  refreshInterval = window.setInterval(() => {
    if (autoRefresh.value) {
      fetchAgentStatus()
    }
  }, 5000) // Refresh every 5 seconds
}

const stopRefreshInterval = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

const fetchAgentStatus = async () => {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch('/api/agent-status')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    
    // Map agent data to match our interface
    agents.value = (data.agents || []).map((agent: any) => ({
      id: agent.agentId,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      events: agent.eventsCount || 0,
      successRate: Math.round((agent.successRate || 0) * 100),
      responseTime: agent.averageResponseTime || 0,
      uptime: Math.random() * 10000, // Mock uptime for now
      lastActivity: agent.lastSeen || new Date().toISOString(),
      agentId: agent.agentId
    }))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch agent status'
    agents.value = []
  } finally {
    loading.value = false
  }
}

const connectWebSocket = () => {
  try {
    wsConnection = new WebSocket('ws://localhost:3001')
    
    wsConnection.onopen = () => {
      isConnected.value = true
      console.log('Agent status stream connected')
    }
    
    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'agent_status_update' || data.type === 'event_logged') {
          // Update specific agent
          const agentIndex = agents.value.findIndex(a => a.id === data.agent.id)
          if (agentIndex !== -1) {
            agents.value[agentIndex] = { ...agents.value[agentIndex], ...data.agent }
          } else {
            agents.value.push(data.agent)
          }
        } else if (data.type === 'agent_status_bulk') {
          // Update all agents
          agents.value = data.agents || []
        }
      } catch (err) {
        console.error('Error parsing agent status message:', err)
      }
    }
    
    wsConnection.onclose = () => {
      isConnected.value = false
      console.log('Agent status stream disconnected')
      // Attempt to reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000)
    }
    
    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error)
      isConnected.value = false
    }
  } catch (err) {
    console.error('Failed to connect WebSocket:', err)
  }
}

const viewAgentDetails = (agent: Agent) => {
  console.log('View details for agent:', agent.name)
  // TODO: Implement agent details modal or navigation
}

const pingAgent = async (agent: Agent) => {
  try {
    const response = await fetch(`/api/agent-ping/${agent.id || agent.agentId}`, {
      method: 'POST'
    })
    if (response.ok) {
      const result = await response.json()
      console.log(`Pinged agent: ${agent.name}`, result)
      // Show success feedback
    } else {
      console.error(`Failed to ping agent: ${agent.name}`)
    }
  } catch (err) {
    console.error('Failed to ping agent:', err)
  }
}

// Watch for filter changes
watch([searchQuery, selectedStatus, sortBy, sortOrder], () => {
  nextTick(() => {
    // Trigger reactivity updates
  })
})

onMounted(() => {
  fetchAgentStatus()
  connectWebSocket()
  if (autoRefresh.value) {
    startRefreshInterval()
  }
})

onUnmounted(() => {
  if (wsConnection) {
    wsConnection.close()
  }
  stopRefreshInterval()
})
</script>

<style scoped>
.agent-status-cards {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.cards-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.cards-header h2 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  background: linear-gradient(45deg, #ffffff, #f0f0f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  opacity: 0.8;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse 2s infinite;
}

.status-dot.connected {
  background: #10b981;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.refresh-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.refresh-btn.active {
  background: rgba(16, 185, 129, 0.3);
  border-color: rgba(16, 185, 129, 0.5);
}

.filters-toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-input {
  width: 100%;
  padding: 8px 16px 8px 40px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.9rem;
  backdrop-filter: blur(10px);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.search-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.9rem;
  opacity: 0.6;
}

.filter-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.9rem;
  backdrop-filter: blur(10px);
}

.filter-select:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
}

.sort-btn {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;
}

.sort-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sort-btn.reverse {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.stat-icon {
  font-size: 1.5rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #10b981;
}

.stat-label {
  font-size: 0.8rem;
  opacity: 0.8;
}

.agents-container {
  min-height: 400px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 16px;
  text-align: center;
}

.error-icon {
  font-size: 2rem;
}

.retry-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.no-agents {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  text-align: center;
}

.no-agents-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.no-agents-subtitle {
  font-size: 0.9rem;
  opacity: 0.7;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.agent-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s;
  position: relative;
}

.agent-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.agent-card.active {
  border-left: 4px solid #10b981;
}

.agent-card.busy {
  border-left: 4px solid #f59e0b;
}

.agent-card.idle {
  border-left: 4px solid #6b7280;
}

.agent-card.offline {
  border-left: 4px solid #ef4444;
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-avatar {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
}

.agent-details h3 {
  margin: 0 0 4px 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.agent-type {
  font-size: 0.8rem;
  opacity: 0.7;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
}

.status-indicator .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: none;
}

.status-indicator.active .status-dot {
  background: #10b981;
}

.status-indicator.busy .status-dot {
  background: #f59e0b;
}

.status-indicator.idle .status-dot {
  background: #6b7280;
}

.status-indicator.offline .status-dot {
  background: #ef4444;
}

.agent-metrics {
  margin-bottom: 16px;
}

.metric-row {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 0.8rem;
  opacity: 0.7;
  margin-bottom: 2px;
}

.metric-value {
  font-size: 1rem;
  font-weight: 600;
  color: #10b981;
}

.agent-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.action-btn {
  flex: 1;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.8rem;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.last-activity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  opacity: 0.7;
}

.activity-label {
  font-weight: 500;
}

.activity-time {
  font-family: monospace;
}

@media (max-width: 768px) {
  .agent-status-cards {
    padding: 16px;
  }
  
  .cards-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .filters-toolbar {
    flex-direction: column;
  }
  
  .filter-controls {
    flex-direction: column;
  }
  
  .stats-overview {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .agents-grid {
    grid-template-columns: 1fr;
  }
  
  .agent-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .metric-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style> 