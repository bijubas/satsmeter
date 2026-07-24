import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build -> backend/public (servido pelo Express). Em dev, o Vite (5173) faz
// proxy de /api e /ws para o backend (8000), mantendo o tempo real com HMR.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
});
