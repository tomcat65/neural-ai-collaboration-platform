import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CollaborationTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignedTo?: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
  dependencies: string[]
  estimatedEffort: number
  actualEffort?: number
}

export interface AgentCollaboration {
  agentId: string
  agentName: string
  capabilities: string[]
  currentTask?: string
  availability: 'available' | 'busy' | 'offline'
  lastActivity: Date
  performance: {
    tasksCompleted: number
    successRate: number
    avgResponseTime: number
  }
}

export interface CollaborationEvent {
  id: string
  type: 'task_created' | 'task_assigned' | 'task_completed' | 'agent_joined' | 'agent_left' | 'coordination_message'
  agentId: string
  taskId?: string
  message: string
  timestamp: Date
  metadata?: any
}

export const useCollaborationStore = defineStore('collaboration', () => {
  // State
  const tasks = ref<CollaborationTask[]>([])
  const agents = ref<AgentCollaboration[]>([])
  const events = ref<CollaborationEvent[]>([])
  const isConnected = ref(false)
  const connectionStatus = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')

  // Computed
  const activeTasks = computed(() => tasks.value.filter(task => task.status === 'in-progress'))
  const pendingTasks = computed(() => tasks.value.filter(task => task.status === 'pending'))
  const completedTasks = computed(() => tasks.value.filter(task => task.status === 'completed'))
  const blockedTasks = computed(() => tasks.value.filter(task => task.status === 'blocked'))

  const availableAgents = computed(() => agents.value.filter(agent => agent.availability === 'available'))
  const busyAgents = computed(() => agents.value.filter(agent => agent.availability === 'busy'))

  const taskProgress = computed(() => {
    const total = tasks.value.length
    const completed = completedTasks.value.length
    const inProgress = activeTasks.value.length
    return {
      total,
      completed,
      inProgress,
      pending: pendingTasks.value.length,
      blocked: blockedTasks.value.length,
      completionRate: total > 0 ? (completed / total) * 100 : 0
    }
  })

  // Actions
  const connectToANP = async () => {
    try {
      connectionStatus.value = 'connecting'
      
      // Simulate WebSocket connection to ANP router
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Register as collaboration agent
      const response = await fetch('/api/collaboration/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'vue-dashboard-collaboration',
          agentType: 'collaboration-dashboard',
          capabilities: ['task_management', 'agent_coordination', 'progress_monitoring']
        })
      })

      if (response.ok) {
        isConnected.value = true
        connectionStatus.value = 'connected'
        console.log('✅ Connected to ANP collaboration system')
      } else {
        throw new Error('Failed to register with ANP')
      }
    } catch (error) {
      console.error('❌ Failed to connect to ANP:', error)
      connectionStatus.value = 'disconnected'
      isConnected.value = false
      // Don't throw the error - just log it and continue with local functionality
    }
  }

  const createTask = async (taskData: Omit<CollaborationTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const task: CollaborationTask = {
      ...taskData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    }

    tasks.value.push(task)
    
    // Add event
    events.value.push({
      id: crypto.randomUUID(),
      type: 'task_created',
      agentId: task.createdBy,
      taskId: task.id,
      message: `Task "${task.title}" created`,
      timestamp: new Date()
    })

    // Notify ANP system
    if (isConnected.value) {
      try {
        await fetch('/api/collaboration/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task)
        })
      } catch (error) {
        console.error('Failed to sync task with ANP:', error)
      }
    }

    return task
  }

  const updateTask = async (taskId: string, updates: Partial<CollaborationTask>) => {
    const taskIndex = tasks.value.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return null

    const oldStatus = tasks.value[taskIndex].status
    tasks.value[taskIndex] = {
      ...tasks.value[taskIndex],
      ...updates,
      updatedAt: new Date()
    }

    const task = tasks.value[taskIndex]
    
    // Add event for status changes
    if (updates.status && updates.status !== oldStatus) {
      events.value.push({
        id: crypto.randomUUID(),
        type: 'task_completed',
        agentId: updates.assignedTo || 'system',
        taskId: taskId,
        message: `Task "${task.title}" status changed to ${updates.status}`,
        timestamp: new Date()
      })
    }

    return task
  }

  const assignTask = async (taskId: string, agentId: string) => {
    const task = await updateTask(taskId, { assignedTo: agentId, status: 'in-progress' })
    
    if (task) {
      events.value.push({
        id: crypto.randomUUID(),
        type: 'task_assigned',
        agentId: agentId,
        taskId: taskId,
        message: `Task "${task.title}" assigned to ${agentId}`,
        timestamp: new Date()
      })
    }

    return task
  }

  const syncWithANP = async () => {
    if (!isConnected.value) return

    try {
      // Sync tasks
      const tasksResponse = await fetch('/api/collaboration/tasks')
      if (tasksResponse.ok) {
        const remoteTasks = await tasksResponse.json()
        tasks.value = remoteTasks
      }

      // Sync agents
      const agentsResponse = await fetch('/api/collaboration/agents')
      if (agentsResponse.ok) {
        const remoteAgents = await agentsResponse.json()
        agents.value = remoteAgents
      }

      // Sync events
      const eventsResponse = await fetch('/api/collaboration/events')
      if (eventsResponse.ok) {
        const remoteEvents = await eventsResponse.json()
        events.value = remoteEvents
      }
    } catch (error) {
      console.error('Failed to sync with ANP:', error)
    }
  }

  const sendCoordinationMessage = async (message: string, targetAgent?: string) => {
    const event: CollaborationEvent = {
      id: crypto.randomUUID(),
      type: 'coordination_message',
      agentId: 'vue-dashboard-collaboration',
      message,
      timestamp: new Date()
    }

    events.value.push(event)

    if (isConnected.value) {
      try {
        await fetch('/api/collaboration/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...event,
            targetAgent
          })
        })
      } catch (error) {
        console.error('Failed to send coordination message:', error)
      }
    }
  }

  // Initialize with sample data
  const initializeSampleData = () => {
    // Sample tasks
    tasks.value = [
      {
        id: 'task-1',
        title: 'Implement Multi-Agent Memory System',
        description: 'Create hierarchical memory architecture for individual and shared agent memories',
        status: 'in-progress',
        priority: 'high',
        assignedTo: 'cursor-ai-instance-1',
        createdBy: 'claude-code-cli-instance-2',
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(),
        dependencies: [],
        estimatedEffort: 8
      },
      {
        id: 'task-2',
        title: 'Design Real-time Collaboration Dashboard',
        description: 'Create Vue 3 dashboard for monitoring multi-agent collaboration',
        status: 'completed',
        priority: 'high',
        assignedTo: 'claude-code-cli-instance-2',
        createdBy: 'cursor-ai-instance-1',
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(Date.now() - 1800000),
        dependencies: [],
        estimatedEffort: 6,
        actualEffort: 5.5
      },
      {
        id: 'task-3',
        title: 'Implement WebSocket Event System',
        description: 'Create real-time event broadcasting for agent coordination',
        status: 'pending',
        priority: 'medium',
        createdBy: 'claude-code-cli-instance-2',
        createdAt: new Date(),
        updatedAt: new Date(),
        dependencies: ['task-1'],
        estimatedEffort: 4
      }
    ]

    // Sample agents
    agents.value = [
      {
        agentId: 'cursor-ai-instance-1',
        agentName: 'Cursor AI',
        capabilities: ['code_editing', 'file_management', 'ui_development'],
        currentTask: 'task-1',
        availability: 'busy',
        lastActivity: new Date(),
        performance: {
          tasksCompleted: 15,
          successRate: 98,
          avgResponseTime: 150
        }
      },
      {
        agentId: 'claude-code-cli-instance-2',
        agentName: 'Claude Code CLI',
        capabilities: ['backend_development', 'api_design', 'system_architecture'],
        availability: 'available',
        lastActivity: new Date(),
        performance: {
          tasksCompleted: 12,
          successRate: 95,
          avgResponseTime: 180
        }
      }
    ]

    // Sample events
    events.value = [
      {
        id: 'event-1',
        type: 'task_created',
        agentId: 'claude-code-cli-instance-2',
        taskId: 'task-1',
        message: 'Task "Implement Multi-Agent Memory System" created',
        timestamp: new Date(Date.now() - 3600000)
      },
      {
        id: 'event-2',
        type: 'task_assigned',
        agentId: 'cursor-ai-instance-1',
        taskId: 'task-1',
        message: 'Task "Implement Multi-Agent Memory System" assigned to Cursor AI',
        timestamp: new Date(Date.now() - 3500000)
      },
      {
        id: 'event-3',
        type: 'coordination_message',
        agentId: 'claude-code-cli-instance-2',
        message: 'Ready to collaborate on unified multi-agent platform implementation',
        timestamp: new Date(Date.now() - 300000)
      }
    ]
  }

  return {
    // State
    tasks,
    agents,
    events,
    isConnected,
    connectionStatus,

    // Computed
    activeTasks,
    pendingTasks,
    completedTasks,
    blockedTasks,
    availableAgents,
    busyAgents,
    taskProgress,

    // Actions
    connectToANP,
    createTask,
    updateTask,
    assignTask,
    syncWithANP,
    sendCoordinationMessage,
    initializeSampleData
  }
}) 