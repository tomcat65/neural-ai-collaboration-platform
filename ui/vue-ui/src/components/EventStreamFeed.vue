<template>
  <div class="event-stream-feed">
    <div class="feed-header">
      <h2>📡 Live Event Stream</h2>
      <div class="feed-controls">
        <div class="connection-status" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          {{ isConnected ? 'Live' : 'Connecting...' }}
        </div>
        <button 
          @click="togglePause" 
          class="pause-btn"
          :class="{ paused: isPaused }"
        >
          {{ isPaused ? '▶️ Resume' : '⏸️ Pause' }}
        </button>
      </div>
    </div>
    
    <div class="search-filters">
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search events..."
          class="search-input"
        />
        <span class="search-icon">🔍</span>
      </div>
      
      <div class="filter-controls">
        <select v-model="selectedEventType" class="filter-select">
          <option value="">All Event Types</option>
          <option value="info">ℹ️ Info</option>
          <option value="warning">⚠️ Warning</option>
          <option value="error">❌ Error</option>
          <option value="success">✅ Success</option>
          <option value="debug">🐛 Debug</option>
        </select>
        
        <select v-model="selectedAgent" class="filter-select">
          <option value="">All Agents</option>
          <option value="cursor">🤖 Cursor</option>
          <option value="claude">🧠 Claude</option>
          <option value="system">⚙️ System</option>
        </select>
      </div>
    </div>
    
    <div class="feed-stats">
      <div class="stat-item">
        <span class="stat-label">Total Events:</span>
        <span class="stat-value">{{ totalEvents }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Filtered:</span>
        <span class="stat-value">{{ filteredEvents.length }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Rate:</span>
        <span class="stat-value">{{ eventsPerSecond }}/s</span>
      </div>
    </div>
    
    <div class="events-container" ref="eventsContainer">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <p>Connecting to event stream...</p>
      </div>
      
      <div v-else-if="error" class="error">
        <div class="error-icon">⚠️</div>
        <p>{{ error }}</p>
        <button @click="connectWebSocket" class="retry-btn">Reconnect</button>
      </div>
      
      <div v-else-if="filteredEvents.length === 0" class="no-events">
        <div class="no-events-icon">📭</div>
        <p>No events match your filters</p>
        <p class="no-events-subtitle">Try adjusting your search or filters</p>
      </div>
      
      <div v-else class="events-list">
        <div 
          v-for="event in filteredEvents" 
          :key="event.id"
          class="event-item"
          :class="event.type"
        >
          <div class="event-header">
            <span class="event-type-icon">{{ getEventTypeIcon(event.type) }}</span>
            <span class="event-agent">{{ event.agent }}</span>
            <span class="event-timestamp">{{ formatTimestamp(event.timestamp) }}</span>
          </div>
          <div class="event-message">{{ event.message }}</div>
          <div v-if="event.details" class="event-details">
            <pre>{{ JSON.stringify(event.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

interface EventItem {
  id: string
  type: 'info' | 'warning' | 'error' | 'success' | 'debug'
  agent: string
  message: string
  timestamp: string
  details?: any
}

const searchQuery = ref('')
const selectedEventType = ref('')
const selectedAgent = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const isConnected = ref(false)
const isPaused = ref(false)
const events = ref<EventItem[]>([])
const eventsContainer = ref<HTMLElement>()
let wsConnection: WebSocket | null = null
let eventsPerSecond = ref(0)
let eventCount = ref(0)
let lastEventTime = ref(Date.now())

const totalEvents = computed(() => events.value.length)

const filteredEvents = computed(() => {
  return events.value.filter(event => {
    // Search filter
    if (searchQuery.value && !event.message.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      return false
    }
    
    // Event type filter
    if (selectedEventType.value && event.type !== selectedEventType.value) {
      return false
    }
    
    // Agent filter
    if (selectedAgent.value && event.agent !== selectedAgent.value) {
      return false
    }
    
    return true
  })
})

const getEventTypeIcon = (type: string) => {
  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
    debug: '🐛'
  }
  return icons[type as keyof typeof icons] || '📝'
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString()
}

const togglePause = () => {
  isPaused.value = !isPaused.value
}

const addEvent = (event: EventItem) => {
  if (isPaused.value) return
  
  events.value.unshift(event)
  
  // Keep only last 1000 events for performance
  if (events.value.length > 1000) {
    events.value = events.value.slice(0, 1000)
  }
  
  // Update stats
  eventCount.value = events.value.length // Calculate from actual events
  const now = Date.now()
  const timeDiff = now - lastEventTime.value
  if (timeDiff > 0) {
    eventsPerSecond.value = Math.round((1000 / timeDiff) * 10) / 10
  }
  lastEventTime.value = now
  
  // Auto-scroll to top
  nextTick(() => {
    if (eventsContainer.value) {
      eventsContainer.value.scrollTop = 0
    }
  })
}

const connectWebSocket = () => {
  try {
    loading.value = true
    error.value = null
    
    wsConnection = new WebSocket('ws://localhost:3001')
    
    wsConnection.onopen = () => {
      isConnected.value = true
      loading.value = false
      console.log('Event stream connected')
    }
    
    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'event' || data.type === 'event_logged') {
          addEvent({
            id: data.id || data.data?.id || Date.now().toString(),
            type: data.eventType || data.data?.type || 'info',
            agent: data.agent || data.data?.agentId || 'system',
            message: data.message || data.data?.message || 'No message',
            timestamp: data.timestamp || data.data?.timestamp || new Date().toISOString(),
            details: data.details || data.data
          })
        }
      } catch (err) {
        console.error('Error parsing event message:', err)
      }
    }
    
    wsConnection.onclose = () => {
      isConnected.value = false
      loading.value = false
      console.log('Event stream disconnected')
      // Attempt to reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000)
    }
    
    wsConnection.onerror = (wsError) => {
      console.error('WebSocket error:', wsError)
      isConnected.value = false
      loading.value = false
      error.value = 'Failed to connect to event stream'
    }
  } catch (err) {
    console.error('Failed to connect WebSocket:', err)
  }
}

// Watch for filter changes to update scroll position
watch([searchQuery, selectedEventType, selectedAgent], () => {
  nextTick(() => {
    if (eventsContainer.value) {
      eventsContainer.value.scrollTop = 0
    }
  })
})

onMounted(() => {
  connectWebSocket()
})

onUnmounted(() => {
  if (wsConnection) {
    wsConnection.close()
  }
})
</script>

<style scoped>
.event-stream-feed {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  height: 600px;
  display: flex;
  flex-direction: column;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.feed-header h2 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  background: linear-gradient(45deg, #ffffff, #f0f0f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.feed-controls {
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

.pause-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.pause-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.pause-btn.paused {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
}

.search-filters {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
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

.feed-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  font-size: 0.8rem;
  opacity: 0.8;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #10b981;
}

.events-container {
  flex: 1;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 16px;
  backdrop-filter: blur(10px);
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
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
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

.no-events {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  text-align: center;
}

.no-events-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.no-events-subtitle {
  font-size: 0.9rem;
  opacity: 0.7;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  border-left: 4px solid rgba(255, 255, 255, 0.3);
  transition: all 0.2s;
}

.event-item:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(4px);
}

.event-item.info {
  border-left-color: #3b82f6;
}

.event-item.warning {
  border-left-color: #f59e0b;
}

.event-item.error {
  border-left-color: #ef4444;
}

.event-item.success {
  border-left-color: #10b981;
}

.event-item.debug {
  border-left-color: #8b5cf6;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.event-type-icon {
  font-size: 1rem;
}

.event-agent {
  font-weight: 600;
  color: #10b981;
}

.event-timestamp {
  opacity: 0.7;
  font-size: 0.8rem;
}

.event-message {
  font-size: 0.95rem;
  line-height: 1.4;
  margin-bottom: 8px;
}

.event-details {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 8px;
  font-size: 0.8rem;
  font-family: 'Courier New', monospace;
  overflow-x: auto;
}

.event-details pre {
  margin: 0;
  color: #e5e7eb;
}

@media (max-width: 768px) {
  .event-stream-feed {
    padding: 16px;
    height: 500px;
  }
  
  .feed-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .search-filters {
    flex-direction: column;
  }
  
  .filter-controls {
    flex-direction: column;
  }
  
  .feed-stats {
    flex-direction: column;
    gap: 12px;
  }
  
  .event-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style> 