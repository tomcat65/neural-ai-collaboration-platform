<template>
  <div class="live-activity-pulse">
    <div class="pulse-header">
      <h2>🔄 Live Activity Pulse</h2>
      <div class="connection-status" :class="{ connected: isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Live' : 'Connecting...' }}
      </div>
    </div>
    
    <div class="time-range-selector">
      <label for="timeRange">Time Range:</label>
      <select id="timeRange" v-model="selectedTimeRange" @change="handleTimeRangeChange">
        <option value="1h">Last Hour</option>
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
      </select>
    </div>
    
    <div class="pulse-content">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <p>Loading activity data...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <div class="error-icon">⚠️</div>
        <p>{{ error }}</p>
        <button @click="fetchPulseData" class="retry-btn">Retry</button>
      </div>
      
      <div v-else-if="pulseData" class="data-content">
        <!-- Metrics Cards -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon">📊</div>
            <div class="metric-info">
              <span class="metric-label">Total Activities</span>
              <span class="metric-value">{{ pulseData.totalActivities || 0 }}</span>
            </div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon">👥</div>
            <div class="metric-info">
              <span class="metric-label">Active Users</span>
              <span class="metric-value">{{ pulseData.activeUsers || 0 }}</span>
            </div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon">⏰</div>
            <div class="metric-info">
              <span class="metric-label">Peak Hour</span>
              <span class="metric-value">{{ pulseData.peakHour || 'N/A' }}</span>
            </div>
          </div>
        </div>
        
        <!-- Chart Container -->
        <div class="chart-container">
          <canvas ref="chartCanvas" width="400" height="200"></canvas>
        </div>
      </div>
      
      <div v-else class="no-data">
        <div class="no-data-icon">📈</div>
        <p>No activity data available</p>
        <p class="no-data-subtitle">Data will appear here when activity is detected</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useDashboardStore } from '@/stores/dashboard'

// Register Chart.js components
Chart.register(...registerables)

interface PulseData {
  totalActivities: number
  activeUsers: number
  peakHour: string
  timeRange: string
  activityData?: Array<{ time: string; count: number }>
}

const dashboardStore = useDashboardStore()
const selectedTimeRange = ref('24h')
const loading = ref(true)
const error = ref<string | null>(null)
const pulseData = ref<PulseData | null>(null)
const isConnected = ref(false)
const chartCanvas = ref<HTMLCanvasElement>()
let chart: Chart | null = null

const handleTimeRangeChange = () => {
  fetchPulseData()
}

const createChart = (data: PulseData) => {
  if (!chartCanvas.value) return
  
  // Destroy existing chart
  if (chart) {
    chart.destroy()
  }
  
  // Create sample data for visualization
  const labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']
  const activityData = data.activityData || [
    { time: '00:00', count: Math.floor(Math.random() * 50) },
    { time: '04:00', count: Math.floor(Math.random() * 30) },
    { time: '08:00', count: Math.floor(Math.random() * 80) },
    { time: '12:00', count: Math.floor(Math.random() * 120) },
    { time: '16:00', count: Math.floor(Math.random() * 90) },
    { time: '20:00', count: Math.floor(Math.random() * 60) }
  ]
  
  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: activityData.map(d => d.time),
      datasets: [{
        label: 'Activity Count',
        data: activityData.map(d => d.count),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
      }
    }
  })
}

// Use global dashboard WebSocket connection
const connectToDashboard = () => {
  // Monitor global connection status
  dashboardStore.onConnectionChange((connected: boolean) => {
    isConnected.value = connected
  })
  
  // Set initial connection status
  isConnected.value = dashboardStore.isConnected
}

const fetchPulseData = async () => {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch(`/api/activity-pulse?timeRange=${selectedTimeRange.value}`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    
    // Convert ANP pulse data to component format
    const convertedData = {
      totalActivities: data.totalEvents || 0,
      activeUsers: data.pulseData?.reduce((acc: number, pulse: any) => Math.max(acc, pulse.activeAgents || 0), 0) || 0,
      peakHour: data.pulseData?.length > 0 ? new Date(data.pulseData[0].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A',
      timeRange: data.timeRange || selectedTimeRange.value,
      activityData: data.pulseData?.map((pulse: any) => ({
        time: new Date(pulse.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        count: pulse.eventCount || 0
      })) || []
    }
    
    pulseData.value = convertedData
    
    // Create chart after data is loaded
    await nextTick()
    if (convertedData) {
      createChart(convertedData)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch pulse data'
    pulseData.value = null
  } finally {
    loading.value = false
  }
}

// Watch for pulseData changes to update chart
watch(pulseData, (newData) => {
  if (newData && chartCanvas.value) {
    nextTick(() => {
      createChart(newData)
    })
  }
})

onMounted(() => {
  fetchPulseData()
  connectToDashboard()
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
  }
})
</script>

<style scoped>
.live-activity-pulse {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.pulse-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.pulse-header h2 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  background: linear-gradient(45deg, #ffffff, #f0f0f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.connection-status.connected .status-dot {
  background: #10b981;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.time-range-selector {
  margin-bottom: 24px;
}

.time-range-selector label {
  margin-right: 12px;
  font-weight: 500;
  opacity: 0.9;
}

.time-range-selector select {
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.9rem;
  backdrop-filter: blur(10px);
}

.time-range-selector select:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.pulse-content {
  min-height: 300px;
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

.data-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.metric-icon {
  font-size: 1.5rem;
}

.metric-info {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 0.8rem;
  opacity: 0.8;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.chart-container {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  height: 300px;
}

.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  text-align: center;
}

.no-data-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.no-data-subtitle {
  font-size: 0.9rem;
  opacity: 0.7;
}

@media (max-width: 768px) {
  .live-activity-pulse {
    padding: 16px;
  }
  
  .pulse-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-container {
    height: 250px;
  }
}
</style> 