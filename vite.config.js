import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split big, rarely-changing deps into cached vendor chunks. recharts is
        // the bulk of the bundle and is needed by the hero rainbow on first paint,
        // but isolating it keeps app chunks small and improves repeat-visit caching.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
})
