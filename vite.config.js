import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH || '/',
  server: {
    // Dedicated port: avoids clashing with other local apps (and their cached service workers) on 5173.
    port: 5190,
    strictPort: true,
    open: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
