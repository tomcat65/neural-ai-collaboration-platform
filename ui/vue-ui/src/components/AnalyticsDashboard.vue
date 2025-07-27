<template>
  <div class="analytics-dashboard">
    <div class="dashboard-header">
      <h2>📊 Analytics Dashboard</h2>
      <div class="header-controls">
        <div class="connection-status" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          {{ isConnected ? 'Live' : 'Connecting...' }}
        </div>
        <div class="time-range-selector">
          <button 
            @click="toggleTimeRangeDropdown" 
            class="time-range-btn"
          >
            {{ selectedTimeRange }}
          </button>
          <div v-if="showTimeRangeDropdown" class="time-range-dropdown">
            <div 
              v-for="range in timeRanges" 
              :key="range.value"
              @click="selectTimeRange(range)"
              class="time-range-option"
            >
              {{ range.label }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="controls-toolbar">
      <div class="refresh-controls">
        <button @click="refreshData" class="refresh-btn">
          🔄 Refresh
        </button>
        <button 
          @click="toggleAutoRefresh" 
          class="auto-refresh-toggle"
          :class="{ active: autoRefresh }"
        >
          {{ autoRefresh ? '⏸️ Auto' : '▶️ Manual' }}
        </button>
      </div>
      
      <div class="export-controls">
        <button @click="exportData" class="export-btn">
          📥 Export
        </button>
      </div>
    </div>
    
    <div class="overview-metrics">
      <div class="metric-card">
        <div class="metric-icon">📈</div>
        <div class="metric-info">
          <span class="metric-value">{{ formatNumber(analyticsData.overview?.totalEvents || 0) }}</span>
          <span class="metric-label">Total Events</span>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">🤖</div>
        <div class="metric-info">
          <span class="metric-value">{{ analyticsData.overview?.activeAgents || 0 }}</span>
          <span class="metric-label">Active Agents</span>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">✅</div>
        <div class="metric-info">
          <span class="metric-value">{{ analyticsData.overview?.successRate?.toFixed(1) || 0 }}%</span>
          <span class="metric-label">Success Rate</span>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon">⚡</div>
        <div class="metric-info">
          <span class="metric-value">{{ analyticsData.overview?.avgResponseTime || 0 }}ms</span>
          <span class="metric-label">Avg Response Time</span>
        </div>
      </div>
    </div>
    
    <div class="dashboard-content">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading analytics data...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <div class="error-icon">⚠️</div>
        <p>{{ error }}</p>
        <button @click="fetchAnalyticsData" class="retry-btn">Retry</button>
      </div>
      
      <div v-else class="charts-grid">
        <div class="chart-container events-trend-chart">
          <h3>📈 Events Trend</h3>
          <canvas ref="eventsTrendChart"></canvas>
        </div>
        
        <div class="chart-container agent-performance-chart">
          <h3>🤖 Agent Performance</h3>
          <canvas ref="agentPerformanceChart"></canvas>
        </div>
        
        <div class="chart-container event-types-chart">
          <h3>📊 Event Types</h3>
          <canvas ref="eventTypesChart"></canvas>
        </div>
        
        <div class="chart-container system-health-chart">
          <h3>💻 System Health</h3>
          <div class="health-indicators">
            <div class="health-item">
              <span class="health-label">CPU</span>
              <div class="health-bar">
                <div class="health-fill" :style="{ width: `${analyticsData.systemHealth?.cpu || 0}%` }"></div>
              </div>
              <span class="health-value">{{ analyticsData.systemHealth?.cpu || 0 }}%</span>
            </div>
            <div class="health-item">
              <span class="health-label">Memory</span>
              <div class="health-bar">
                <div class="health-fill" :style="{ width: `${analyticsData.systemHealth?.memory || 0}%` }"></div>
              </div>
              <span class="health-value">{{ analyticsData.systemHealth?.memory || 0 }}%</span>
            </div>
            <div class="health-item">
              <span class="health-label">Network</span>
              <div class="health-bar">
                <div class="health-fill" :style="{ width: `${analyticsData.systemHealth?.network || 0}%` }"></div>
              </div>
              <span class="health-value">{{ analyticsData.systemHealth?.network || 0 }}%</span>
            </div>
            <div class="health-item">
              <span class="health-label">Storage</span>
              <div class="health-bar">
                <div class="health-fill" :style="{ width: `${analyticsData.systemHealth?.storage || 0}%` }"></div>
              </div>
              <span class="health-value">{{ analyticsData.systemHealth?.storage || 0 }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'

// Register Chart.js components
Chart.register(...registerables)

interface AnalyticsData {
  overview: {
    totalEvents: number
    activeAgents: number
    successRate: number
    avgResponseTime: number
  }
  trends: {
    labels: string[]
    events: number[]
    successRates: number[]
  }
  agentPerformance: Array<{
    name: string
    events: number
    successRate: number
    avgTime: number
  }>
  eventTypes: Array<{
    type: string
    count: number
    percentage: number
  }>
  systemHealth: {
    cpu: number
    memory: number
    network: number
    storage: number
  }
}

const loading = ref(true)
const error = ref<string | null>(null)
const isConnected = ref(false)
const autoRefresh = ref(true)
const showTimeRangeDropdown = ref(false)
const selectedTimeRange = ref('Last 24 Hours')
const analyticsData = ref<AnalyticsData>({
  overview: { totalEvents: 0, activeAgents: 0, successRate: 0, avgResponseTime: 0 },
  trends: { labels: [], events: [], successRates: [] },
  agentPerformance: [],
  eventTypes: [],
  systemHealth: { cpu: 0, memory: 0, network: 0, storage: 0 }
})

let wsConnection: WebSocket | null = null
let refreshInterval: number | null = null
let charts: { [key: string]: Chart | null } = {
  eventsTrend: null,
  agentPerformance: null,
  eventTypes: null
}

const timeRanges = [
  { label: 'Last Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' }
]

const formatNumber = (num: number) => {
  return num.toLocaleString()
}

const toggleTimeRangeDropdown = () => {
  showTimeRangeDropdown.value = !showTimeRangeDropdown.value
}

const selectTimeRange = (range: { label: string; value: string }) => {
  selectedTimeRange.value = range.label
  showTimeRangeDropdown.value = false
  fetchAnalyticsData()
}

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startRefreshInterval()
  } else {
    stopRefreshInterval()
  }
}

const startRefreshInterval = () => {
  if (refreshInterval) return
  refreshInterval = window.setInterval(() => {
    if (autoRefresh.value) {
      fetchAnalyticsData()
    }
  }, 30000) // Refresh every 30 seconds
}

const stopRefreshInterval = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

const fetchAnalyticsData = async () => {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch('/api/analytics')
    
    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON - API endpoint may not be available')
    }
    
    const data = await response.json()
    analyticsData.value = data
  } catch (err) {
    console.warn('Analytics API call failed, using mock data:', err)
    error.value = err instanceof Error ? err.message : 'Failed to fetch analytics data'
    
    // Provide fallback data so the component still works
    analyticsData.value = {
      overview: {
        totalEvents: 1247,
        activeAgents: 8,
        successRate: 94.5,
        avgResponseTime: 245
      },
      trends: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        events: [120, 85, 200, 350, 280, 180],
        successRates: [92, 95, 93, 96, 94, 95]
      },
      agentPerformance: [
        { name: 'Agent Alpha', events: 250, successRate: 98, avgTime: 150 },
        { name: 'Agent Beta', events: 200, successRate: 95, avgTime: 180 },
        { name: 'Agent Gamma', events: 180, successRate: 92, avgTime: 220 }
      ],
      eventTypes: [
        { type: 'Query', count: 600, percentage: 60.0 },
        { type: 'Process', count: 300, percentage: 30.0 },
        { type: 'Analyze', count: 100, percentage: 10.0 }
      ],
      systemHealth: {
        cpu: 75,
        memory: 85,
        network: 60,
        storage: 45
      }
    }
  } finally {
    loading.value = false
  }
}

const refreshData = () => {
  fetchAnalyticsData()
}

const exportData = () => {
  const dataStr = JSON.stringify(analyticsData.value, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analytics-${new Date().toISOString().split('T')[0]}.json`
  link.click()
  URL.revokeObjectURL(url)
}

const createEventsTrendChart = () => {
  const ctx = document.getElementById('eventsTrendChart') as HTMLCanvasElement
  if (!ctx) return

  if (charts.eventsTrend) {
    charts.eventsTrend.destroy()
  }

  charts.eventsTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: analyticsData.value.trends.labels,
      datasets: [
        {
          label: 'Events',
          data: analyticsData.value.trends.events,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4
        },
        {
          label: 'Success Rate (%)',
          data: analyticsData.value.trends.successRates,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false,
          },
        }
      }
    }
  })
}

const createAgentPerformanceChart = () => {
  const ctx = document.getElementById('agentPerformanceChart') as HTMLCanvasElement
  if (!ctx) return

  if (charts.agentPerformance) {
    charts.agentPerformance.destroy()
  }

  const data = analyticsData.value.agentPerformance
  charts.agentPerformance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [
        {
          label: 'Events',
          data: data.map(d => d.events),
          backgroundColor: 'rgba(54, 162, 235, 0.8)'
        },
        {
          label: 'Success Rate (%)',
          data: data.map(d => d.successRate),
          backgroundColor: 'rgba(255, 206, 86, 0.8)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  })
}

const createEventTypesChart = () => {
  const ctx = document.getElementById('eventTypesChart') as HTMLCanvasElement
  if (!ctx) return

  if (charts.eventTypes) {
    charts.eventTypes.destroy()
  }

  const data = analyticsData.value.eventTypes
  charts.eventTypes = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.type),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  })
}

const updateCharts = () => {
  nextTick(() => {
    createEventsTrendChart()
    createAgentPerformanceChart()
    createEventTypesChart()
  })
}

const connectWebSocket = () => {
  try {
    wsConnection = new WebSocket('ws://localhost:3001')
    
    wsConnection.onopen = () => {
      isConnected.value = true
      console.log('Analytics stream connected')
    }
    
    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'analytics_update' || data.type === 'event_logged') {
          // Update analytics data
          analyticsData.value = { ...analyticsData.value, ...data.data }
          updateCharts()
        }
      } catch (err) {
        console.error('Error parsing analytics message:', err)
      }
    }
    
    wsConnection.onclose = () => {
      isConnected.value = false
      console.log('Analytics stream disconnected')
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

// Watch for data changes to update charts
watch(analyticsData, () => {
  updateCharts()
}, { deep: true })

// Handle window resize for chart responsiveness
const handleResize = () => {
  Object.values(charts).forEach(chart => {
    if (chart) {
      chart.resize()
    }
  })
}

onMounted(() => {
  fetchAnalyticsData()
  connectWebSocket()
  if (autoRefresh.value) {
    startRefreshInterval()
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  stopRefreshInterval()
  if (wsConnection) {
    wsConnection.close()
  }
  Object.values(charts).forEach(chart => {
    if (chart) {
      chart.destroy()
    }
  })
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.analytics-dashboard {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 2rem;
  color: white;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.dashboard-header h2 {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(45deg, #fff, #f0f0f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 25px;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.connection-status.connected {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: pulse 2s infinite;
}

.connection-status.connected .status-dot {
  background: #22c55e;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.time-range-selector {
  position: relative;
}

.time-range-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.time-range-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.time-range-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 0.5rem 0;
  margin-top: 0.5rem;
  min-width: 150px;
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.time-range-option {
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: background 0.3s ease;
  font-size: 0.9rem;
}

.time-range-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.controls-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 1rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.refresh-controls, .export-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.refresh-btn, .auto-refresh-toggle, .export-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.refresh-btn:hover, .auto-refresh-toggle:hover, .export-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.auto-refresh-toggle.active {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.3);
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.metric-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.metric-icon {
  font-size: 2rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.metric-info {
  display: flex;
  flex-direction: column;
}

.metric-value {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.metric-label {
  font-size: 0.9rem;
  opacity: 0.8;
}

.dashboard-content {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-height: 600px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  gap: 1rem;
}

.loading-spinner {
  width: 50px;
  height: 50px;
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
  height: 400px;
  gap: 1rem;
  text-align: center;
}

.error-icon {
  font-size: 3rem;
}

.retry-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 2rem;
}

.chart-container {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 400px;
}

.chart-container h3 {
  margin: 0 0 1rem 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #f0f0f0;
}

.chart-container canvas {
  width: 100% !important;
  height: 300px !important;
}

.health-indicators {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.health-label {
  min-width: 80px;
  font-size: 0.9rem;
  font-weight: 500;
}

.health-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #3b82f6);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.health-value {
  min-width: 50px;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
}

@media (max-width: 768px) {
  .analytics-dashboard {
    padding: 1rem;
  }
  
  .dashboard-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .header-controls {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .controls-toolbar {
    flex-direction: column;
    gap: 1rem;
  }
  
  .overview-metrics {
    grid-template-columns: 1fr;
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-container {
    min-height: 300px;
  }
}
</style> 