<template>
  <div class="human-notification-panel">
    <div class="notification-header">
      <h3>🔔 Human Notifications</h3>
      <div class="notification-stats">
        <span class="unread-count" v-if="unreadCount > 0">{{ unreadCount }} unread</span>
        <button @click="markAllRead" class="mark-all-read" v-if="unreadCount > 0">
          Mark All Read
        </button>
      </div>
    </div>

    <div class="notifications-container">
      <div v-if="notifications.length === 0" class="no-notifications">
        <div class="no-notifications-icon">🔕</div>
        <p>No notifications</p>
        <small>AI agents will notify you here when they need your intervention</small>
      </div>

      <div v-else class="notification-list">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="[
            'notification-item',
            `priority-${notification.priority}`,
            { 'unread': !notification.acknowledged }
          ]"
          @click="acknowledgeNotification(notification.id)"
        >
          <div class="notification-icon">
            <span v-if="notification.type === 'intervention_required'">🚨</span>
            <span v-else-if="notification.type === 'decision_needed'">🤔</span>
            <span v-else-if="notification.type === 'approval_requested'">✅</span>
            <span v-else-if="notification.type === 'error_alert'">❌</span>
            <span v-else>ℹ️</span>
          </div>
          
          <div class="notification-content">
            <div class="notification-title">{{ notification.title }}</div>
            <div class="notification-message">{{ notification.message }}</div>
            <div class="notification-meta">
              <span class="agent" v-if="notification.agentId">
                From: {{ notification.agentId }}
              </span>
              <span class="timestamp">{{ formatTimestamp(notification.timestamp) }}</span>
              <span class="priority-badge" :class="`priority-${notification.priority}`">
                {{ notification.priority }}
              </span>
            </div>
          </div>

          <div class="notification-actions">
            <button 
              v-if="notification.actionRequired && !notification.acknowledged"
              @click.stop="handleAction(notification)"
              class="action-button"
            >
              Take Action
            </button>
            <button 
              v-if="!notification.acknowledged"
              @click.stop="acknowledgeNotification(notification.id)"
              class="acknowledge-button"
            >
              ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface HumanNotification {
  id: string
  type: 'intervention_required' | 'decision_needed' | 'approval_requested' | 'error_alert' | 'system_update'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  agentId?: string
  sessionId?: string
  timestamp: string
  acknowledged: boolean
  actionRequired: boolean
  context?: any
}

const notifications = ref<HumanNotification[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let wsConnection: WebSocket | null = null

const unreadCount = computed(() => {
  return notifications.value.filter(n => !n.acknowledged).length
})

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

const fetchNotifications = async () => {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch('/api/notifications')
    if (!response.ok) throw new Error('Failed to fetch notifications')
    
    const data = await response.json()
    notifications.value = data.notifications || []
  } catch (err) {
    console.error('Error fetching notifications:', err)
    error.value = 'Failed to load notifications'
  } finally {
    loading.value = false
  }
}

const acknowledgeNotification = async (id: string) => {
  try {
    const response = await fetch(`/api/notifications/${id}/acknowledge`, {
      method: 'POST'
    })
    
    if (response.ok) {
      // Update local state
      const notification = notifications.value.find(n => n.id === id)
      if (notification) {
        notification.acknowledged = true
      }
    }
  } catch (err) {
    console.error('Error acknowledging notification:', err)
  }
}

const markAllRead = async () => {
  const unreadNotifications = notifications.value.filter(n => !n.acknowledged)
  await Promise.all(unreadNotifications.map(n => acknowledgeNotification(n.id)))
}

const handleAction = (notification: HumanNotification) => {
  // This would trigger specific actions based on notification type
  console.log('Taking action on notification:', notification)
  
  // For now, just acknowledge it
  acknowledgeNotification(notification.id)
}

const connectWebSocket = () => {
  try {
    wsConnection = new WebSocket('ws://localhost:3001')
    
    wsConnection.onopen = () => {
      console.log('Notification WebSocket connected')
    }
    
    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'human_notification') {
          // Add new notification to the list
          const newNotification: HumanNotification = {
            id: data.data.id,
            type: data.data.type,
            priority: data.data.priority,
            title: data.data.title,
            message: data.data.message,
            agentId: data.data.agentId,
            timestamp: data.data.timestamp,
            acknowledged: false,
            actionRequired: data.data.actionRequired
          }
          
          notifications.value.unshift(newNotification)
          
          // Show browser notification if supported
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotification.title, {
              body: newNotification.message,
              icon: '/favicon.ico'
            })
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }
    
    wsConnection.onclose = () => {
      console.log('Notification WebSocket disconnected')
      setTimeout(connectWebSocket, 5000)
    }
    
    wsConnection.onerror = (error) => {
      console.error('Notification WebSocket error:', error)
    }
  } catch (err) {
    console.error('Failed to connect notification WebSocket:', err)
  }
}

onMounted(() => {
  fetchNotifications()
  connectWebSocket()
  
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
})

onUnmounted(() => {
  if (wsConnection) {
    wsConnection.close()
  }
})
</script>

<style scoped>
.human-notification-panel {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  padding: 1.5rem;
  color: white;
  min-height: 400px;
  max-height: 600px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.notification-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.notification-stats {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.unread-count {
  background: rgba(255, 255, 255, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.mark-all-read {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}

.mark-all-read:hover {
  background: rgba(255, 255, 255, 0.3);
}

.notifications-container {
  flex: 1;
  overflow-y: auto;
}

.no-notifications {
  text-align: center;
  padding: 2rem;
  color: rgba(255, 255, 255, 0.7);
}

.no-notifications-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notification-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.notification-item:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.notification-item.unread {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
}

.notification-item.priority-critical {
  border-left: 4px solid #ff4757;
}

.notification-item.priority-high {
  border-left: 4px solid #ffa502;
}

.notification-item.priority-medium {
  border-left: 4px solid #2ed573;
}

.notification-item.priority-low {
  border-left: 4px solid #70a1ff;
}

.notification-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.notification-message {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
  line-height: 1.4;
  margin-bottom: 0.75rem;
}

.notification-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.agent {
  font-weight: 500;
}

.priority-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.priority-badge.priority-critical {
  background: rgba(255, 71, 87, 0.3);
  color: #ff6b7a;
}

.priority-badge.priority-high {
  background: rgba(255, 165, 2, 0.3);
  color: #ffb142;
}

.priority-badge.priority-medium {
  background: rgba(46, 213, 115, 0.3);
  color: #7bed9f;
}

.priority-badge.priority-low {
  background: rgba(112, 161, 255, 0.3);
  color: #a4b0be;
}

.notification-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex-shrink: 0;
}

.action-button {
  background: #2ed573;
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: background 0.2s;
}

.action-button:hover {
  background: #26d0aa;
}

.acknowledge-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.acknowledge-button:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style> 