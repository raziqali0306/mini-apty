import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // .env (incl. VITE_API_BASE_URL) lives at the monorepo root.
  envDir: '../../',
  build: {
    // Stable, source-mapped output for an unpacked extension.
    sourcemap: true,
    rollupOptions: {},
  },
  // crx HMR uses a websocket; fixed port keeps it predictable under Docker.
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
