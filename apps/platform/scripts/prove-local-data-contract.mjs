#!/usr/bin/env bun
import { createRequire } from 'node:module';
import { decryptBackup, encryptBackup } from '@shippie/backup-providers';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:4181';
const passphrase = 'shippie-local-contract-passphrase';

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function waitForFrameText(page, pattern, label) {
  const deadline = Date.now() + 20_000;
  let lastText = '';
  while (Date.now() < deadline) {
    await page.waitForSelector('iframe', { timeout: 5_000 });
    const handles = await page.locator('iframe').elementHandles();
    for (const handle of handles) {
      const frame = await handle.contentFrame().catch(() => null);
      if (!frame) continue;
      await frame.waitForLoadState('domcontentloaded').catch(() => {});
      const text = await frame.locator('body').innerText({ timeout: 1000 }).catch(() => '');
      if (text) lastText = text.slice(0, 240);
      if (pattern.test(text)) return frame;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Missing ${label} app frame. Last frame text: ${lastText}`);
}

async function waitForFirstFrame(page) {
  await page.waitForSelector('iframe', { timeout: 20_000 });
  const handle = await page.locator('iframe').first().elementHandle();
  const frame = handle ? await handle.contentFrame() : null;
  assert(frame, 'Missing app iframe');
  await frame.waitForLoadState('domcontentloaded').catch(() => {});
  return frame;
}

async function waitForSwControl(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controlled = await page.evaluate(async () => {
      if (!navigator.serviceWorker) throw new Error('service_worker_unavailable');
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 2500);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
      return Boolean(navigator.serviceWorker.controller);
    });
    if (controlled) return;
    await page.reload({ waitUntil: 'load' });
  }
  throw new Error('service_worker_not_controlling_page');
}

async function sealCapsule(page, slug) {
  await waitForSwControl(page);
  const result = await page.evaluate(async (targetSlug) => {
    const registration = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? registration.active;
    if (!sw) throw new Error('service_worker_not_active');
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error('download_timeout'));
      }, 90_000);
      channel.port1.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.type !== 'done') return;
        clearTimeout(timer);
        channel.port1.close();
        resolve(msg);
      };
      sw.postMessage({ type: 'DOWNLOAD_APP', slug: targetSlug }, [channel.port2]);
    });
  }, slug);
  assert(result.state === 'saved', `${slug}: capsule did not seal (${JSON.stringify(result)})`);
  return result;
}

async function assertOfflineCapsule(page, slug) {
  const frame = await waitForFirstFrame(page);
  const shellText = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
  assert(!shellText.includes('You are offline'), `${slug}: fell back to the generic offline page`);
  assert(!shellText.includes('Saved copy missing'), `${slug}: launcher reported missing saved copy`);
  assert(!shellText.includes('Saved copy was evicted'), `${slug}: launcher reported an evicted saved copy`);
  return frame;
}

async function clickByText(frame, selector, text) {
  await frame.locator(selector).filter({ hasText: text }).first().click();
}

async function encryptedLocalStorageRoundTrip(page, appSlug, keys) {
  const snapshot = await page.evaluate((allowedKeys) => ({
    schema: 'shippie.restore-drill.local-storage.v1',
    createdAt: new Date().toISOString(),
    entries: allowedKeys
      .map((key) => ({ key, value: localStorage.getItem(key) }))
      .filter((entry) => entry.value != null),
  }), keys);
  assert(snapshot.entries.length > 0, `${appSlug}: no scoped localStorage entries to back up`);

  const encrypted = await encryptBackup({
    appSlug,
    schemaVersion: 1,
    tables: ['local-storage'],
    plaintext: new TextEncoder().encode(JSON.stringify(snapshot)),
    passphrase,
  });
  const decrypted = await decryptBackup(encrypted.bytes, passphrase);
  assert(decrypted.appSlug === appSlug, `${appSlug}: encrypted backup app slug mismatch`);
  const restored = JSON.parse(new TextDecoder().decode(decrypted.plaintext));
  assert(restored.schema === snapshot.schema, `${appSlug}: encrypted backup schema mismatch`);

  await page.evaluate((allowedKeys) => {
    for (const key of allowedKeys) localStorage.removeItem(key);
  }, keys);
  const cleared = await page.evaluate((key) => localStorage.getItem(key), keys[0]);
  assert(cleared == null, `${appSlug}: scoped localStorage did not clear before restore`);

  await page.evaluate((payload) => {
    for (const entry of payload.entries) localStorage.setItem(entry.key, entry.value);
    window.dispatchEvent(new CustomEvent('shippie:data-restored', { detail: { appSlug: payload.appSlug } }));
  }, { ...restored, appSlug });
}

async function runPalatePass(page, context, label) {
  await page.goto(`${origin}/run/palate`, { waitUntil: 'networkidle' });
  const sealed = await sealCapsule(page, 'palate');
  const frame = await waitForFrameText(page, /Palate|Shop|Cook/i, 'Palate');

  await clickByText(frame, 'button', 'Shop');
  const input = frame.getByRole('textbox', { name: 'Add item' });
  await input.fill(`almonds ${label}`);
  await frame.getByRole('button', { name: 'Add' }).click();
  await frame.getByRole('button', { name: new RegExp(`almonds ${label}`, 'i') }).waitFor({ timeout: 5_000 });

  const storage = await page.evaluate(() => ({
    palate: localStorage.getItem('shippie.palate.recipe-hub.v1'),
    tracker: localStorage.getItem('shippie.inherited-data.v0:palate:touched-local-storage'),
  }));
  assert(storage.palate?.includes(`almonds ${label}`), 'Palate local state did not persist the shopping item');
  assert(storage.tracker?.includes('shippie.palate.recipe-hub.v1'), 'Palate localStorage key was not tracked');

  await encryptedLocalStorageRoundTrip(page, 'palate', [
    'shippie.palate.recipe-hub.v1',
    'shippie.palate.aisle-order.v1',
    'shippie.palate.last-tab.v1',
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  const restoredFrame = await waitForFrameText(page, /Palate|Shop|Cook/i, 'Palate');
  await restoredFrame.getByRole('button', { name: new RegExp(`almonds ${label}`, 'i') }).waitFor({ timeout: 5_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlineFrame = await assertOfflineCapsule(page, 'palate');
  await offlineFrame.getByRole('button', { name: new RegExp(`almonds ${label}`, 'i') }).waitFor({ timeout: 8_000 });
  await context.setOffline(false);

  return {
    app: 'palate',
    localStateBytes: storage.palate.length,
    trackerBytes: storage.tracker.length,
    capsuleBytes: sealed.totalBytes ?? 0,
  };
}

async function runChiwitPass(page, context, label) {
  await page.goto(`${origin}/run/chiwit`, { waitUntil: 'networkidle' });
  const sealed = await sealCapsule(page, 'chiwit');
  const frame = await waitForFrameText(page, /Chiwit|Daily Pulse|Hydration/i, 'Chiwit');

  await frame.getByRole('button', { name: /Hydration.*250/i }).first().click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('shippie.chiwit.daily-pulse.v1') ?? '';
    return raw.includes('"kind":"hydration"') && raw.includes('"note":"water"');
  }, null, { timeout: 5_000 });

  const storage = await page.evaluate(() => ({
    chiwit: localStorage.getItem('shippie.chiwit.daily-pulse.v1'),
    tracker: localStorage.getItem('shippie.inherited-data.v0:chiwit:touched-local-storage'),
  }));
  assert(storage.chiwit, 'Chiwit local state was not present after interaction');
  assert(storage.tracker?.includes('shippie.chiwit.daily-pulse.v1'), 'Chiwit localStorage key was not tracked');

  await encryptedLocalStorageRoundTrip(page, 'chiwit', [
    'shippie.chiwit.daily-pulse.v1',
    'CUSTOM_QUICK_ACTIONS',
    'shippie.chiwit.last-tab.v1',
  ]);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForFrameText(page, /Chiwit|Daily Pulse|Hydration/i, 'Chiwit');
  const restoredStorage = await page.evaluate(() => localStorage.getItem('shippie.chiwit.daily-pulse.v1'));
  assert(restoredStorage?.includes('"kind":"hydration"'), 'Chiwit local state did not survive encrypted restore');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlineFrame = await assertOfflineCapsule(page, 'chiwit');
  await offlineFrame.getByText(/Hydration|Chiwit|Today/i).first().waitFor({ timeout: 8_000 });
  await context.setOffline(false);

  return {
    app: 'chiwit',
    localStateBytes: storage.chiwit.length,
    trackerBytes: storage.tracker.length,
    capsuleBytes: sealed.totalBytes ?? 0,
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const label of ['pass1', 'pass2']) {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    results.push(await runPalatePass(page, context, label));
    results.push(await runChiwitPass(page, context, label));
    await context.close();
  }
  console.log(JSON.stringify({ ok: true, origin, results }, null, 2));
} finally {
  await browser.close();
}
