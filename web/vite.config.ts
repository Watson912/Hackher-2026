import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned: Auth0 matches the callback URL exactly, so Vite must not slide
    // to another port when 5173 is busy.
    port: 5173,
    strictPort: true,
    // Forward /api calls to the Express server so the app never deals with CORS.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
