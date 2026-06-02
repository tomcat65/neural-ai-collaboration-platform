import { createRouter, createWebHistory } from 'vue-router'
import DataStewardView from '@/views/DataStewardView.vue'

const routes = [
  {
    // 2c: the Data Steward (human custodian console) is now the primary surface.
    path: '/',
    name: 'DataSteward',
    component: DataStewardView,
  },
  {
    // 2c: the live Command Center (real-time agent activity) moved here from '/'.
    path: '/activity',
    name: 'CommandCenter',
    component: () => import('@/views/CommandCenter.vue'),
  },
  {
    // Back-compat: the old /steward path now redirects to the home.
    path: '/steward',
    redirect: '/',
  },
  {
    path: '/brain',
    name: 'Brain',
    component: () => import('../views/BrainView.vue'),
  },
  {
    path: '/stream',
    name: 'LiveStream',
    component: () => import('../views/LiveStreamView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
