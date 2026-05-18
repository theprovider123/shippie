/// <reference types="vitest" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  worker: {
    format: 'es',
  },
  server: {
    port: 4101 // distinct from apps/web (4100) so both can run side-by-side during canary
  },
  test: {
    // Forks pool tears down workers hard on completion; the threads
    // pool was leaving the Vite dev server alive past tests and
    // returning exit 1 after a clean "Tests closed successfully" run,
    // which broke the chained `bun run health` script.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    teardownTimeout: 5000,
  },
});
