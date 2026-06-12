import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      // wa-sqlite WASM is only needed inside the Shippie container (local-db
      // backup flows). These standalone arcade games never call backup APIs, so
      // externalising the package prevents ~1.7 MB of orphaned WASM from being
      // emitted into every game's dist.
      external: (id) => id.startsWith('wa-sqlite'),
    },
  },
  server: { port: 5248 },
});
