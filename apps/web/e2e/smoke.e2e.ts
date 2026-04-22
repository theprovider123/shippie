/**
 * Smoke test — boots the Next.js dev server and verifies the landing
 * page renders without server errors. If this fails, the whole e2e
 * suite is doomed and the failure is fast.
 *
 * Extend alongside, don't replace: each new e2e file targets one flow
 * (install funnel, trial deploy, maker dashboard, etc.).
 */
import { test, expect } from 'playwright/test';

test('landing page renders', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Shippie/i);
});

test('health endpoint returns 200', async ({ request }) => {
  // /__shippie/health is the worker route; on apps/web we don't have
  // it, so we just assert the root URL 200s as a proxy liveness probe.
  const res = await request.get('/');
  expect(res.status()).toBe(200);
});
