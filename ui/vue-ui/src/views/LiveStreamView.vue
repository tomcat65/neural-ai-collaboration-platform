<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

useTheme()
</script>

<template>
  <div class="stream-view">
    <header class="stream-header">
      <router-link to="/" class="back-link">Back to Command Center</router-link>
      <h1 class="stream-title">LIVE EVENT STREAM</h1>
      <span class="coming-soon">COMING SOON</span>
    </header>
    <div class="stream-placeholder">
      <div class="placeholder-icon">&#x1F4E1;</div>
      <h2 class="placeholder-heading">Real-Time Event Stream</h2>
      <p class="placeholder-text">
        Full-screen chronological event feed with live tail, filtering by agent/type/project,
        and real-time message arrival indicators.
      </p>
    </div>
  </div>
</template>

<style scoped>
.stream-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--cc-bg);
  color: var(--cc-text);
  font-family: 'JetBrains Mono', monospace;
}

.stream-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--cc-surface-1);
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}

.back-link {
  color: var(--cc-cyan);
  text-decoration: none;
  font-size: 0.8rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--cc-cyan);
  border-radius: 4px;
  transition: background 0.15s;
}

.back-link:hover {
  background: var(--cc-cyan-dim);
}

.stream-title {
  font-family: 'Outfit', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  margin: 0;
}

.coming-soon {
  font-size: 0.65rem;
  color: var(--cc-amber);
  background: var(--cc-amber-dim);
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.stream-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.placeholder-icon {
  font-size: 4rem;
  opacity: 0.4;
}

.placeholder-heading {
  font-family: 'Outfit', sans-serif;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--cc-text-dim);
  margin: 0;
}

.placeholder-text {
  max-width: 480px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--cc-text-muted);
  line-height: 1.6;
  margin: 0;
}
</style>
