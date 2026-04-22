/**
 * Playwright configuration for apps/web e2e tests.
 *
 * Tests live under `./e2e/` and use the `.e2e.ts` extension so
 * `bun test` (which picks up `.test.ts` / `.spec.ts`) never tries to
 * run them. Playwright boots the Next.js dev server itself on port
 * 4100 and reuses it across runs locally; CI starts it fresh.
 *
 * Run:
 *   bun run e2e         # headless
 *   bun run e2e:ui      # Playwright's watch UI
 *   bun run e2e:headed  # visible browser
 *
 * DATABASE_URL is not required — the default client falls back to
 * PGlite in-memory when the env var is unset, so the e2e suite is
 * self-contained.
 */
import { defineConfig, devices } from 'playwright/test';

const PORT = 4100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
