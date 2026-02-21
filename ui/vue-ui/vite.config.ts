import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '')
  const apiKey = env.API_KEY || ''

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5176,
      host: true,
      cors: true,
      proxy: {
        '/api': {
          target: 'http://localhost:6174',
          changeOrigin: true,
          secure: false,
          headers: apiKey ? { 'x-api-key': apiKey } : {}
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia'],
            'three-graph': ['three', '3d-force-graph']
          }
        }
      }
    }
  }
})
