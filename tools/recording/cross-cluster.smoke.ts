/**
 * Strict smoke test for the cross-cluster intent flow. This file is
 * the CI variant of `cross-cluster.record.ts`:
 *
 *   - assertions FAIL the run instead of being best-effort
 *   - no video copy step
 *   - same dev-server harness via playwright.config webServer
 *
 * Wire as `bun run smoke` from the repo root.
 */
import { test, expect, type FrameLocator, type Page } from '@playwright/test';

async function home(page: Page) {
  const homeBtn = page.locator('button.home-button').first();
  if (await homeBtn.isVisible().catch(() => false)) {
    await homeBtn.click();
    await page.waitForTimeout(300);
  }
}

async function clickAppTile(page: Page, label: RegExp) {
  await home(page);
  const tile = page.locator('button.app-tile').filter({ hasText: label }).first();
  await tile.waitFor({ state: 'visible', timeout: 10_000 });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
}

async function approveAllPrompts(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    const allow = page.getByRole('button', { name: 'Allow' });
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await page.waitForTimeout(300);
    } else break;
  }
}

async function frameForApp(page: Page, port: number): Promise<FrameLocator> {
  const url = `http://localhost:${port}/`;
  const frame = page.frameLocator(`iframe[src^="${url}"]`).first();
  await frame.locator('main, #root *').first().waitFor({ state: 'visible', timeout: 20_000 });
  return frame;
}

test('cross-cluster intent flow: workout-completed reaches Habit Tracker', async ({ page }) => {
  await page.goto('/container');
  await page.locator('h1', { hasText: 'One Shippie' }).waitFor();

  // Install Habit Tracker first; it requests intent grants on mount.
  await clickAppTile(page, /Habit Tracker/i);
  await frameForApp(page, 5184);
  await approveAllPrompts(page);

  // Install Workout Logger and log a session.
  await clickAppTile(page, /Workout Logger/i);
  const workoutFrame = await frameForApp(page, 5185);
  await workoutFrame.getByRole('button', { name: /^Log session$/i }).click();
  await page.waitForTimeout(600);

  // Habit Tracker's Exercised habit should be auto-checked for today.
  await clickAppTile(page, /Habit Tracker/i);
  const habitFrame = await frameForApp(page, 5184);
  const exercised = habitFrame.locator('li', { hasText: 'Exercised' }).first();
  await expect(exercised).toHaveClass(/done/, { timeout: 10_000 });
});

test('cross-cluster intent flow: cooked-meal (food → health) auto-checks habit', async ({ page }) => {
  await page.goto('/container');

  // Make sure Habit Tracker is granted before firing the intent.
  await clickAppTile(page, /Habit Tracker/i);
  await frameForApp(page, 5184);
  await approveAllPrompts(page);

  // Fire cooked-meal via the parent window — the container's bridge
  // host listens for postMessages on its own window. (Iframes normally
  // call `parent.postMessage`; here we inject directly.)
  await clickAppTile(page, /Recipe Saver/i);
  await frameForApp(page, 5180);
  await page.evaluate(() => {
    window.postMessage(
      {
        protocol: 'shippie.bridge.v1',
        id: `recipe_smoke_${Date.now()}`,
        appId: 'app_recipe_saver',
        capability: 'intent.provide',
        method: 'broadcast',
        payload: {
          intent: 'cooked-meal',
          rows: [{ title: 'Smoke dinner', cookedAt: new Date().toISOString() }],
        },
      },
      '*',
    );
  });
  await page.waitForTimeout(800);

  // Cross-cluster check: cooked-dinner habit (Health) reacts to recipe (Food).
  await clickAppTile(page, /Habit Tracker/i);
  const habitFrame = await frameForApp(page, 5184);
  const cooked = habitFrame.locator('li', { hasText: 'Cooked dinner' }).first();
  await expect(cooked).toHaveClass(/done/, { timeout: 10_000 });
});
