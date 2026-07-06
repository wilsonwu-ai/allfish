import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the Fastify backend so the client can be developed
// with HMR while hitting the real API. In production the backend serves the
// built assets from client/dist directly (same origin, no proxy needed).
export default defineConfig({
  plugins: [react()],
  // Make VITE_STATIC a compile-time constant from the build environment, so the
  // static (GitHub Pages) build and the full-stack build differ by one env var.
  define: {
    'import.meta.env.VITE_STATIC': JSON.stringify(process.env.VITE_STATIC ?? ''),
    'import.meta.env.VITE_FIREBASE': JSON.stringify(process.env.VITE_FIREBASE ?? ''),
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
