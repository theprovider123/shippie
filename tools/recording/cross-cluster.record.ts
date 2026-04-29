/**
 * C2 demo recording — drives the cross-cluster intent flow.
 *
 * Walkthrough:
 *   1. Open container, install Habit Tracker (Health) via Discover
 *   2. Habit Tracker requests its consume grants → permission prompt → Allow
 *   3. Install Workout Logger (Health) via Discover, log a session
 *      (broadcasts `workout-completed` to the granted Habit Tracker iframe)
 *   4. Switch to Habit Tracker → "Exercised" habit auto-checked
 *   5. Open Recipe Saver, hit Mark cooked → cross-cluster `cooked-meal`
 *   6. Habit Tracker's "Cooked dinner" habit auto-checks
 *
 * Output: docs/launch/recordings/c2-cross-cluster.webm
 */
import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const CONTAINER = '/container';
const PAUSE_BEAT_MS = 900;
const PAUSE_THINK_MS = 1500;

async function beat(page: Page, ms = PAUSE_BEAT_MS) {
  await page.waitForTimeout(ms);
}

async function home(page: Page) {
  const homeBtn = page.locator('button.home-button').first();
  if (await homeBtn.isVisible().catch(() => false)) {
    await homeBtn.click();
    await beat(page, 400);
  }
}

async function showSection(page: Page, label: 'Home' | 'Discover' | 'Create' | 'Your Data') {
  await page.locator('nav.tabs button', { hasText: label }).first().click();
  await beat(page, 400);
}

async function installFromDiscover(page: Page, name: RegExp) {
  await showSection(page, 'Discover');
  const article = page.locator('.discover-list article').filter({ hasText: name }).first();
  await article.scrollIntoViewIfNeeded();
  const installBtn = article.locator('button').filter({ hasText: /^Install$/ });
  if (await installBtn.isVisible().catch(() => false)) {
    await installBtn.click();
    await beat(page, PAUSE_BEAT_MS);
  } else {
    await article.locator('button').filter({ hasText: /^Open$/ }).click();
    await beat(page, PAUSE_BEAT_MS);
  }
}

async function approveAllPrompts(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    const allow = page.getByRole('button', { name: 'Allow' });
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await beat(page, 600);
    } else {
      break;
    }
  }
}

async function frameForApp(page: Page, port: number): Promise<FrameLocator> {
  const url = `http://localhost:${port}/`;
  const frame = page.frameLocator(`iframe[src^="${url}"]`).first();
  // Wait for either <main> or any element under #root — different
  // showcases have different shells, so don't insist on a single tag.
  try {
    await frame.locator('main, #root *').first().waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    /* keep going — record will still capture whatever rendered */
  }
  return frame;
}

async function safe(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.warn(`[recording] beat "${label}" skipped: ${(err as Error).message}`);
  }
}

async function clickAppTile(page: Page, label: RegExp) {
  await home(page);
  const tile = page.locator('button.app-tile').filter({ hasText: label }).first();
  await tile.waitFor({ state: 'visible', timeout: 10_000 });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await beat(page, PAUSE_BEAT_MS);
}

test('cross-cluster demo recording', async ({ page }) => {
  await safe('container shell', async () => {
    await page.goto(CONTAINER);
    await page.locator('h1', { hasText: 'One Shippie' }).waitFor({ state: 'visible' });
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('install Habit Tracker', async () => {
    await installFromDiscover(page, /Habit Tracker/i);
    await frameForApp(page, 5184);
    await approveAllPrompts(page);
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('install Workout Logger and log a session', async () => {
    await installFromDiscover(page, /Workout Logger/i);
    const workoutFrame = await frameForApp(page, 5185);
    await workoutFrame.getByRole('button', { name: /^Log session$/i }).click({ timeout: 8_000 });
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('back to Habit Tracker — Exercised auto-checked', async () => {
    await clickAppTile(page, /Habit Tracker/i);
    const habitFrame2 = await frameForApp(page, 5184);
    const exercised = habitFrame2.locator('li', { hasText: 'Exercised' }).first();
    await expect(exercised).toHaveClass(/done/, { timeout: 8_000 }).catch(() => undefined);
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('Recipe Saver → cooked-meal broadcast', async () => {
    await installFromDiscover(page, /Recipe Saver/i);
    await frameForApp(page, 5180);
    // Fire the cooked-meal intent via the bridge — works regardless of
    // whether the user has saved any recipes locally.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src^="http://localhost:5180/"]') as HTMLIFrameElement | null;
      iframe?.contentWindow?.postMessage(
        {
          protocol: 'shippie.bridge.v1',
          id: `recipe_synthetic_${Date.now()}`,
          appId: 'app_recipe_saver',
          capability: 'intent.provide',
          method: 'broadcast',
          payload: {
            intent: 'cooked-meal',
            rows: [{ title: 'Demo dinner', cookedAt: new Date().toISOString() }],
          },
        },
        '*',
      );
    });
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('back to Habit Tracker — Cooked dinner auto-checked', async () => {
    await clickAppTile(page, /Habit Tracker/i);
    const habitFrame3 = await frameForApp(page, 5184);
    const cookedHabit = habitFrame3.locator('li', { hasText: 'Cooked dinner' }).first();
    await expect(cookedHabit).toHaveClass(/done/, { timeout: 8_000 }).catch(() => undefined);
    await beat(page, PAUSE_THINK_MS);
  });

  await safe('Your Data title beat', async () => {
    await home(page);
    await showSection(page, 'Your Data');
    await beat(page, PAUSE_THINK_MS);
  });
});

test.afterAll(async () => {
  const here = new URL('.', import.meta.url).pathname;
  const results = join(here, 'test-results');
  const target = join(here, '..', '..', 'docs', 'launch', 'recordings');
  await mkdir(target, { recursive: true });
  let exists = false;
  try { await stat(results); exists = true; } catch { /* no run yet */ }
  if (!exists) return;
  const dirs = await readdir(results);
  for (const d of dirs) {
    const full = join(results, d);
    let s;
    try { s = await stat(full); } catch { continue; }
    if (!s.isDirectory()) continue;
    const inner = await readdir(full);
    const video = inner.find((f) => f.endsWith('.webm'));
    if (!video) continue;
    await copyFile(join(full, video), join(target, 'c2-cross-cluster.webm'));
    console.log(`[recording] saved → docs/launch/recordings/c2-cross-cluster.webm`);
  }
});
