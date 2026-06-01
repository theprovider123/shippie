#!/usr/bin/env bun
import { chromium, webkit } from 'playwright';

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:4194';
const engineName = process.env.ENGINE ?? 'chromium';
const screenshotPrefix = process.env.SCREENSHOT_PREFIX ?? '/private/tmp/shippie-offline-root';
const engine = engineName === 'webkit' ? webkit : chromium;
const screenshots = [];

function screenshotPath(name) {
  const path = `${screenshotPrefix}-${name}-${engineName}.png`;
  screenshots.push(path);
  return path;
}

const browser = await engine.launch({ headless: true });

async function newMobilePage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  return { context, page: await context.newPage() };
}

async function waitForSwControl(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controlled = await page.evaluate(async () => {
      if (!navigator.serviceWorker) throw new Error('service_worker_unavailable');
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 2500);
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
      return Boolean(navigator.serviceWorker.controller);
    });
    if (controlled) return;
    await page.reload({ waitUntil: 'load' });
  }
  throw new Error('service_worker_not_controlling_page');
}

async function bootShell(page) {
  await page.goto(origin + '/', { waitUntil: 'load' });
  await waitForSwControl(page);
  await page.reload({ waitUntil: 'load' });
  await waitForSwControl(page);
}

async function purgePlatformDocuments(page) {
  await page.evaluate(async () => {
    const names = await caches.keys();
    for (const name of names.filter((candidate) => candidate.startsWith('shippie-marketplace-'))) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      await Promise.all(
        requests.map(async (request) => {
          const path = new URL(request.url).pathname;
          const keep =
            path.startsWith('/_app/immutable/') ||
            path.startsWith('/__shippie-run/') ||
            path.startsWith('/__shippie/wasm/') ||
            path === '/__shippie/launcher' ||
            path === '/__shippie/launcher.html' ||
            path === '/__shippie/launcher.js' ||
            path.startsWith('/__esm/') ||
            path === '/__shippie-pwa/.shell-warmed';
          if (!keep) await cache.delete(request);
        }),
      );
    }
  });
}

async function gotoOffline(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (err) {
    const message = String(err?.message || err);
    const browserOfflineAbort =
      message.includes('net::ERR_ABORTED') ||
      message.includes('interrupted by another navigation') ||
      message.includes('NS_ERROR_OFFLINE') ||
      message.includes('WebKit encountered an internal error') ||
      message.includes('Timeout');
    // Offline SW-generated navigations can report aborted/unfinished
    // lifecycle events in browser automation even when the worker served a
    // document. The visible assertions below are the real proof, so only
    // rethrow errors that are not one of those offline navigation shapes.
    if (!browserOfflineAbort) throw err;
  }
}

async function deleteCapsuleCaches(page, slug) {
  await page.evaluate(async (targetSlug) => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(`capsule:${targetSlug}:`))
        .map((name) => caches.delete(name)),
    );
  }, slug);
}

async function deleteCapsuleShadowCopies(page, slug) {
  await page.evaluate(async (targetSlug) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('shippie.offline-capsules.v1', 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains('pointers')) {
          database.createObjectStore('pointers', { keyPath: 'slug' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb_open_failed'));
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pointers', 'readwrite');
        const store = tx.objectStore('pointers');
        const get = store.get(targetSlug);
        get.onsuccess = () => {
          const pointer = get.result;
          if (pointer) {
            delete pointer.assetCopies;
            pointer.updatedAt = new Date().toISOString();
            store.put(pointer);
          }
        };
        get.onerror = () => reject(get.error || new Error('idb_get_failed'));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('idb_tx_failed'));
        tx.onabort = () => reject(tx.error || new Error('idb_tx_aborted'));
      });
    } finally {
      db.close();
    }
  }, slug);
}

async function savedSlugs(page) {
  return await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? registration.active;
    if (!sw) return [];
    return await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        resolve([]);
      }, 5000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data?.slugs ?? []);
      };
      sw.postMessage({ type: 'LIST_SAVED_APPS' }, [channel.port2]);
    });
  });
}

async function saveSnake(page) {
  const buttons = page.locator('button[aria-label="Save Snake"]');
  await buttons.first().click({ timeout: 15000 });
  await page.locator('button[aria-label="Remove Snake from saved tools"]').first().waitFor({ timeout: 30000 });
  const slugs = await savedSlugs(page);
  if (!slugs.includes('snake')) throw new Error('snake_not_reported_as_saved:' + JSON.stringify(slugs));
  return slugs;
}

async function proveNoSavedFallback() {
  const { context, page } = await newMobilePage();
  await bootShell(page);
  await purgePlatformDocuments(page);
  await context.setOffline(true);
  await gotoOffline(page, origin + '/?offline-proof=empty');
  await page.getByText('You are offline', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('No saved tools on this device yet.', { exact: true }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: screenshotPath('empty'), fullPage: true });
  await context.close();
}

async function proveSavedAndEvictedFallbacks() {
  const { context, page } = await newMobilePage();
  await bootShell(page);
  const slugs = await saveSnake(page);

  await page.goto(origin + '/run/snake', { waitUntil: 'load' });
  await page.frameLocator('iframe').getByText('Ready', { exact: true }).waitFor({ timeout: 15000 });
  await page.close();

  const readyPage = await context.newPage();
  await readyPage.goto(origin + '/', { waitUntil: 'load' });
  await waitForSwControl(readyPage);
  await purgePlatformDocuments(readyPage);
  await context.setOffline(true);
  await gotoOffline(readyPage, origin + '/?offline-proof=ready');
  await readyPage.getByText('Ready offline', { exact: true }).waitFor({ timeout: 15000 });
  await readyPage.getByRole('link', { name: /Snake/ }).waitFor({ timeout: 15000 });
  await readyPage.screenshot({ path: screenshotPath('ready'), fullPage: true });

  await readyPage.getByRole('link', { name: /Snake/ }).click();
  await readyPage.frameLocator('iframe').getByText('Ready', { exact: true }).waitFor({ timeout: 15000 });
  await readyPage.screenshot({ path: screenshotPath('launch'), fullPage: true });

  await deleteCapsuleCaches(readyPage, 'snake');
  await purgePlatformDocuments(readyPage);
  await readyPage.close();
  const shadowPage = await context.newPage();
  await gotoOffline(shadowPage, origin + '/?offline-proof=shadow');
  await shadowPage.getByText('Ready offline', { exact: true }).waitFor({ timeout: 15000 });
  await shadowPage.getByRole('link', { name: /Snake/ }).waitFor({ timeout: 15000 });
  await shadowPage.screenshot({ path: screenshotPath('shadow'), fullPage: true });
  await deleteCapsuleShadowCopies(shadowPage, 'snake');
  await shadowPage.close();

  const evictedPage = await context.newPage();
  await gotoOffline(evictedPage, origin + '/?offline-proof=evicted');
  await evictedPage.getByText('Saved tools need refresh', { exact: true }).waitFor({ timeout: 15000 });
  await evictedPage.getByText('Needs refresh', { exact: false }).waitFor({ timeout: 15000 });
  await evictedPage.screenshot({ path: screenshotPath('evicted'), fullPage: true });
  await evictedPage.close();
  await context.close();
  return slugs;
}

try {
  await proveNoSavedFallback();
  const slugs = await proveSavedAndEvictedFallbacks();
  console.log(JSON.stringify({ ok: true, engine: engineName, origin, saved: slugs, screenshots }, null, 2));
} finally {
  await browser.close();
}
