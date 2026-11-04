import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  return {
    plugins: [react()],
    base: process.env.VITE_BASE_PATH || '/',
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@supabase/')) return 'supabase'
            if (id.includes('node_modules/react')) return 'react'
          },
        },
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: './src/test-setup.ts',
      globals: true,
      maxWorkers: 2,
      css: { include: [/student-extension|installation-prototype/] },
    },
  }
})
