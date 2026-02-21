<template>
  <div class="collaboration-dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <h1>🤝 Multi-Agent Collaboration Hub</h1>
      <div class="connection-status">
        <span class="status-indicator" :class="connectionStatus"></span>
        {{ connectionStatusText }}
        <button 
          @click="connectToANP" 
          :disabled="connectionStatus === 'connecting'"
          class="connect-btn"
        >
          {{ connectionStatus === 'connected' ? 'Reconnect' : 'Connect to ANP' }}
        </button>
      </div>
    </div>

    <!-- Progress Overview -->
    <div class="progress-overview">
      <div class="progress-card">
        <h3>📊 Task Progress</h3>
        <div class="progress-stats">
          <div class="stat">
            <span class="stat-number">{{ taskProgress.total }}</span>
            <span class="stat-label">Total Tasks</span>
          </div>
          <div class="stat">
            <span class="stat-number">{{ taskProgress.completed }}</span>
            <span class="stat-label">Completed</span>
          </div>
          <div class="stat">
            <span class="stat-number">{{ taskProgress.inProgress }}</span>
            <span class="stat-label">In Progress</span>
          </div>
          <div class="stat">
            <span class="stat-number">{{ taskProgress.blocked }}</span>
            <span class="stat-label">Blocked</span>
          </div>
        </div>
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: `${taskProgress.completionRate}%` }"
          ></div>
        </div>
        <div class="completion-rate">{{ taskProgress.completionRate.toFixed(1) }}% Complete</div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="dashboard-content">
      <!-- Task Management -->
      <div class="task-management">
        <div class="section-header">
          <h2>📋 Task Management</h2>
          <button @click="showCreateTaskModal = true" class="btn-primary">
            + New Task
          </button>
        </div>

        <!-- Task Filters -->
        <div class="task-filters">
          <button 
            v-for="filter in taskFilters" 
            :key="filter.value"
            @click="activeTaskFilter = filter.value"
            :class="['filter-btn', { active: activeTaskFilter === filter.value }]"
          >
            {{ filter.label }} ({{ filter.count }})
          </button>
        </div>

        <!-- Task List -->
        <div class="task-list">
          <div 
            v-for="task in filteredTasks" 
            :key="task.id"
            class="task-card"
            :class="task.status"
          >
            <div class="task-header">
              <h4>{{ task.title }}</h4>
              <div class="task-meta">
                <span class="priority" :class="task.priority">{{ task.priority }}</span>
                <span class="status">{{ task.status }}</span>
              </div>
            </div>
            <p class="task-description">{{ task.description }}</p>
            <div class="task-details">
              <div class="task-info">
                <span>Created by: {{ task.createdBy }}</span>
                <span v-if="task.assignedTo">Assigned to: {{ task.assignedTo }}</span>
                <span>Effort: {{ task.estimatedEffort }}h</span>
              </div>
              <div class="task-actions">
                <button @click="editTask(task)" class="btn-secondary">Edit</button>
                <button @click="assignTask(task.id)" class="btn-secondary">Assign</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent Status -->
      <div class="agent-status">
        <h2>🤖 Agent Status</h2>
        <div class="agent-grid">
          <div 
            v-for="agent in agents" 
            :key="agent.agentId"
            class="agent-card"
            :class="agent.availability"
          >
            <div class="agent-header">
              <h4>{{ agent.agentName }}</h4>
              <span class="availability" :class="agent.availability">
                {{ agent.availability }}
              </span>
            </div>
            <div class="agent-capabilities">
              <span 
                v-for="capability in agent.capabilities.slice(0, 3)" 
                :key="capability"
                class="capability-tag"
              >
                {{ capability }}
              </span>
              <span v-if="agent.capabilities.length > 3" class="more-capabilities">
                +{{ agent.capabilities.length - 3 }} more
              </span>
            </div>
            <div class="agent-performance">
              <div class="perf-stat">
                <span class="perf-label">Tasks:</span>
                <span class="perf-value">{{ agent.performance.tasksCompleted }}</span>
              </div>
              <div class="perf-stat">
                <span class="perf-label">Success:</span>
                <span class="perf-value">{{ agent.performance.successRate }}%</span>
              </div>
              <div class="perf-stat">
                <span class="perf-label">Response:</span>
                <span class="perf-value">{{ agent.performance.avgResponseTime }}ms</span>
              </div>
            </div>
            <div v-if="agent.currentTask" class="current-task">
              Working on: {{ getTaskTitle(agent.currentTask) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Collaboration Events -->
      <div class="collaboration-events">
        <h2>📢 Collaboration Events</h2>
        <div class="events-list">
          <div 
            v-for="event in recentEvents" 
            :key="event.id"
            class="event-item"
            :class="event.type"
          >
            <div class="event-icon">
              {{ getEventIcon(event.type) }}
            </div>
            <div class="event-content">
              <div class="event-message">{{ event.message }}</div>
              <div class="event-meta">
                <span class="event-agent">{{ event.agentId }}</span>
                <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Task Modal -->
    <div v-if="showCreateTaskModal" class="modal-overlay" @click="showCreateTaskModal = false">
      <div class="modal" @click.stop>
        <h3>Create New Task</h3>
        <form @submit.prevent="createNewTask">
          <div class="form-group">
            <label>Title</label>
            <input v-model="newTask.title" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="newTask.description" required></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Priority</label>
              <select v-model="newTask.priority">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div class="form-group">
              <label>Estimated Effort (hours)</label>
              <input v-model.number="newTask.estimatedEffort" type="number" min="1" required />
            </div>
          </div>
          <div class="form-actions">
            <button type="button" @click="showCreateTaskModal = false" class="btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn-primary">Create Task</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCollaborationStore, type CollaborationTask } from '@/stores/collaboration'

const collaborationStore = useCollaborationStore()

// Reactive state
const showCreateTaskModal = ref(false)
const activeTaskFilter = ref('all')
const newTask = ref({
  title: '',
  description: '',
  priority: 'medium' as const,
  estimatedEffort: 4
})

// Expose store properties for template access
const connectionStatus = computed(() => collaborationStore.connectionStatus)
const taskProgress = computed(() => collaborationStore.taskProgress)
const agents = computed(() => collaborationStore.agents)

// Computed properties
const connectionStatusText = computed(() => {
  try {
    switch (collaborationStore.connectionStatus) {
      case 'connected': return 'Connected to ANP'
      case 'connecting': return 'Connecting...'
      case 'error': return 'Connection Error'
      default: return 'Disconnected'
    }
  } catch (error) {
    console.error('Error getting connection status:', error)
    return 'Disconnected'
  }
})

const taskFilters = computed(() => {
  try {
    return [
      { label: 'All', value: 'all', count: collaborationStore.tasks?.length || 0 },
      { label: 'Active', value: 'in-progress', count: collaborationStore.activeTasks?.length || 0 },
      { label: 'Pending', value: 'pending', count: collaborationStore.pendingTasks?.length || 0 },
      { label: 'Completed', value: 'completed', count: collaborationStore.completedTasks?.length || 0 },
      { label: 'Blocked', value: 'blocked', count: collaborationStore.blockedTasks?.length || 0 }
    ]
  } catch (error) {
    console.error('Error getting task filters:', error)
    return [
      { label: 'All', value: 'all', count: 0 },
      { label: 'Active', value: 'in-progress', count: 0 },
      { label: 'Pending', value: 'pending', count: 0 },
      { label: 'Completed', value: 'completed', count: 0 },
      { label: 'Blocked', value: 'blocked', count: 0 }
    ]
  }
})

const filteredTasks = computed(() => {
  try {
    if (activeTaskFilter.value === 'all') {
      return collaborationStore.tasks || []
    }
    return (collaborationStore.tasks || []).filter(task => task.status === activeTaskFilter.value)
  } catch (error) {
    console.error('Error filtering tasks:', error)
    return []
  }
})

const recentEvents = computed(() => {
  try {
    return (collaborationStore.events || [])
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)
  } catch (error) {
    console.error('Error getting recent events:', error)
    return []
  }
})

// Methods
const connectToANP = async () => {
  await collaborationStore.connectToANP()
}

const createNewTask = async () => {
  await collaborationStore.createTask({
    title: newTask.value.title,
    description: newTask.value.description,
    priority: newTask.value.priority,
    estimatedEffort: newTask.value.estimatedEffort,
    status: 'pending',
    createdBy: 'vue-dashboard-collaboration',
    dependencies: []
  })
  
  // Reset form
  newTask.value = {
    title: '',
    description: '',
    priority: 'medium',
    estimatedEffort: 4
  }
  showCreateTaskModal.value = false
}

const editTask = (task: CollaborationTask) => {
  // TODO: Implement task editing
  console.log('Edit task:', task)
}

const assignTask = async (taskId: string) => {
  const availableAgents = collaborationStore.availableAgents
  if (availableAgents.length > 0) {
    await collaborationStore.assignTask(taskId, availableAgents[0].agentId)
  }
}

const getTaskTitle = (taskId: string) => {
  const task = collaborationStore.tasks.find(t => t.id === taskId)
  return task?.title || 'Unknown Task'
}

const getEventIcon = (type: string) => {
  const icons: Record<string, string> = {
    task_created: '📝',
    task_assigned: '👤',
    task_completed: '✅',
    agent_joined: '🟢',
    agent_left: '🔴',
    coordination_message: '💬'
  }
  return icons[type] || '📢'
}

const formatTime = (timestamp: Date) => {
  const now = new Date()
  const diff = now.getTime() - timestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Lifecycle
onMounted(async () => {
  try {
    collaborationStore.initializeSampleData()
    await connectToANP()
  } catch (error) {
    console.error('Error initializing collaboration dashboard:', error)
    // Continue with local functionality even if connection fails
  }
})
</script>

<style scoped>
.collaboration-dashboard {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e5e7eb;
}

.dashboard-header h1 {
  margin: 0;
  color: #1f2937;
  font-size: 2rem;
  font-weight: 700;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.connected { background-color: #10b981; }
.status-indicator.connecting { background-color: #f59e0b; }
.status-indicator.error { background-color: #ef4444; }
.status-indicator.disconnected { background-color: #6b7280; }

.connect-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  color: #374151;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.connect-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-overview {
  margin-bottom: 2rem;
}

.progress-card {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.progress-card h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
  font-size: 1.25rem;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1f2937;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  transition: width 0.3s ease;
}

.completion-rate {
  text-align: center;
  font-weight: 600;
  color: #1f2937;
}

.dashboard-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

.task-management {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 1.5rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2563eb;
}

.task-filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #f9fafb;
}

.filter-btn.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s;
}

.task-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.task-card.in-progress {
  border-left: 4px solid #3b82f6;
}

.task-card.completed {
  border-left: 4px solid #10b981;
}

.task-card.blocked {
  border-left: 4px solid #ef4444;
}

.task-card.pending {
  border-left: 4px solid #f59e0b;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.task-header h4 {
  margin: 0;
  color: #1f2937;
  font-size: 1rem;
}

.task-meta {
  display: flex;
  gap: 0.5rem;
}

.priority, .status {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.priority.high { background: #fef3c7; color: #92400e; }
.priority.medium { background: #dbeafe; color: #1e40af; }
.priority.low { background: #dcfce7; color: #166534; }
.priority.critical { background: #fee2e2; color: #991b1b; }

.status { background: #f3f4f6; color: #374151; }

.task-description {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  line-height: 1.5;
}

.task-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-secondary {
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.agent-status {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.agent-status h2 {
  margin: 0 0 1.5rem 0;
  color: #1f2937;
  font-size: 1.5rem;
}

.agent-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.agent-card {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.2s;
}

.agent-card.available {
  border-left: 4px solid #10b981;
}

.agent-card.busy {
  border-left: 4px solid #f59e0b;
}

.agent-card.offline {
  border-left: 4px solid #6b7280;
  opacity: 0.6;
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.agent-header h4 {
  margin: 0;
  color: #1f2937;
  font-size: 1rem;
}

.availability {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.availability.available { background: #dcfce7; color: #166534; }
.availability.busy { background: #fef3c7; color: #92400e; }
.availability.offline { background: #f3f4f6; color: #374151; }

.agent-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.capability-tag {
  padding: 0.125rem 0.375rem;
  background: #f3f4f6;
  color: #374151;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.more-capabilities {
  padding: 0.125rem 0.375rem;
  background: #e5e7eb;
  color: #6b7280;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.agent-performance {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.perf-stat {
  text-align: center;
}

.perf-label {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
}

.perf-value {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2937;
}

.current-task {
  font-size: 0.75rem;
  color: #6b7280;
  font-style: italic;
}

.collaboration-events {
  grid-column: 1 / -1;
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.collaboration-events h2 {
  margin: 0 0 1.5rem 0;
  color: #1f2937;
  font-size: 1.5rem;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.event-item:hover {
  background: #f9fafb;
}

.event-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.event-content {
  flex: 1;
}

.event-message {
  color: #1f2937;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.event-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 1.5rem 0;
  color: #1f2937;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #374151;
  font-weight: 500;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

@media (max-width: 1024px) {
  .dashboard-content {
    grid-template-columns: 1fr;
  }
  
  .progress-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .form-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .collaboration-dashboard {
    padding: 1rem;
  }
  
  .dashboard-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
  
  .progress-stats {
    grid-template-columns: 1fr;
  }
}
</style> 