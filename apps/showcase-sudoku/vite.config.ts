import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    // Drop the wa-sqlite wasm the SDK barrel drags in transitively — this
    // local game never opens the sqlite document store, so it is dead weight.
    rollupOptions: { external: (id) => id.startsWith('wa-sqlite') },
  },
  server: { port: 5235 },
});
