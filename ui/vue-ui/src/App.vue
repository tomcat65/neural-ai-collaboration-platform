<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCommandCenterStore } from '@/stores/command-center'

const route = useRoute()
const ccStore = useCommandCenterStore()

onMounted(() => {
  ccStore.initialize()
})

onUnmounted(() => {
  ccStore.destroy()
})
</script>

<template>
  <div id="app">
    <router-view />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--cc-bg, #030712);
  color: var(--cc-text, #e2e8f0);
  overflow-x: hidden;
  font-size: calc(15px * var(--cc-font-scale, 1));
}

#app {
  min-height: 100vh;
}

/* Global scrollbar styling — cyan accent */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--cc-scrollbar-track, rgba(255, 255, 255, 0.05));
}

::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, rgba(34, 211, 238, 0.3));
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--cc-scrollbar-hover, rgba(34, 211, 238, 0.5));
}
</style>
