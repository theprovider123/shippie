import { defineConfig, devices } from '@playwright/test';

const SMOKE_MODE = process.env.SHIPPIE_PLAYWRIGHT_MODE === 'smoke';

/**
 * Two modes:
 *
 *   - default (record): assumes `bun run dev:apps` is already running.
 *     Produces a .webm of the cross-cluster walkthrough.
 *   - smoke: spawns dev servers itself via webServer and runs strict
 *     assertions. Wire as CI smoke test.
 */
export default defineConfig({
  testDir: '.',
  testMatch: SMOKE_MODE ? /.*\.smoke\.ts$/ : /.*\.record\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4101',
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    video: SMOKE_MODE ? 'off' : { mode: 'on', size: { width: 414, height: 896 } },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: SMOKE_MODE ? 'smoke' : 'demo',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(SMOKE_MODE
    ? {
        webServer: {
          command: 'bun run dev:apps',
          cwd: '../..',
          url: 'http://localhost:4101',
          reuseExistingServer: true,
          timeout: 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),
});
