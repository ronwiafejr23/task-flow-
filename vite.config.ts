import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  // Your school's Canvas. Change it by setting VITE_CANVAS_URL in .env.local.
  const canvasUrl = (env.VITE_CANVAS_URL || 'https://lincolnu.instructure.com').replace(/\/+$/, '')

  return {
    plugins: [react()],
    define: { __CANVAS_URL__: JSON.stringify(canvasUrl) },
    server: {
      proxy: {
        // Canvas blocks direct calls from a web page, so while running
        // `npm run dev` the app calls /canvas-local and Vite forwards the
        // request to Canvas from your own computer.
        '/canvas-local': {
          target: canvasUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/canvas-local/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
              proxyReq.removeHeader('cookie')
            })
          },
        },
      },
    },
  }
})
