import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In production /api is served by the Vercel function in api/reddit.js.
    // Proxying in dev means the frontend uses the same relative path in both
    // places, so there is no CORS setup and no API base URL to configure.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
