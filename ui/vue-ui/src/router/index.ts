import { createRouter, createWebHistory } from 'vue-router'
import CommandCenter from '@/views/CommandCenter.vue'

const routes = [
  {
    path: '/',
    name: 'CommandCenter',
    component: CommandCenter
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
