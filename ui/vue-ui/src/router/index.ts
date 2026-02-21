import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import CollaborationDashboard from '@/components/CollaborationDashboard.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/activity',
    name: 'Activity',
    component: Dashboard,
    props: { defaultTab: 'activity' }
  },
  {
    path: '/agents',
    name: 'Agents',
    component: Dashboard,
    props: { defaultTab: 'agents' }
  },
  {
    path: '/events',
    name: 'Events',
    component: Dashboard,
    props: { defaultTab: 'events' }
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: Dashboard,
    props: { defaultTab: 'analytics' }
  },
  {
    path: '/collaboration',
    name: 'Collaboration',
    component: CollaborationDashboard
  },
  {
    path: '/brain',
    name: 'Brain',
    component: () => import('../views/BrainView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
