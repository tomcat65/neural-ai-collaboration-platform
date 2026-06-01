import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const routes = [
  {
    // Overview-first Home (Phase 1) is the default landing.
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    // The dense Command Center is now a drill-down.
    path: '/command',
    name: 'CommandCenter',
    component: () => import('@/views/CommandCenter.vue')
  },
  {
    path: '/brain',
    name: 'Brain',
    component: () => import('../views/BrainView.vue')
  },
  {
    path: '/stream',
    name: 'LiveStream',
    component: () => import('../views/LiveStreamView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
