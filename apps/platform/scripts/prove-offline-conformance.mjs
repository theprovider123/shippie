#!/usr/bin/env bun
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, webkit } = require('playwright');

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:4181';
const engineName = process.env.ENGINE ?? 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const originKilledMode = process.env.ORIGIN_KILLED === '1';
const killWaitMs = Number(process.env.KILL_WAIT_MS ?? 8_000);
const defaultSlugs = process.env.SLUGS
  ? process.env.SLUGS.split(',').map((slug) => slug.trim()).filter(Boolean)
  : readGeneratedSlugs();
const slugs = defaultSlugs.length > 0 ? defaultSlugs : ['palate', 'chiwit', 'snake'];
const contextOptions = {
  serviceWorkers: 'allow',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

function readGeneratedSlugs() {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const catalog = readFileSync(join(here, '..', 'src', 'lib', '_generated', 'showcase-catalog.ts'), 'utf8');
    const match = catalog.match(/export const SHOWCASE_SLUGS = (\[[\s\S]*?\]) as const;/);
    return match ? JSON.parse(match[1]) : [];
  } catch {
    return [];
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
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

async function downloadCapsule(page, slug) {
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

async function capsuleStatus(page, slug) {
  return await page.evaluate(async (targetSlug) => {
    const registration = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? registration.active;
    if (!sw) return null;
    return await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        resolve(null);
      }, 8000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data || null);
      };
      sw.postMessage({ type: 'GET_APP_STATUS', slug: targetSlug }, [channel.port2]);
    });
  }, slug);
}

async function gotoOffline(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (err) {
    const message = String(err?.message || err);
    const tolerated =
      message.includes('net::ERR_ABORTED') ||
      message.includes('net::ERR_CONNECTION_REFUSED') ||
      message.includes('NS_ERROR_OFFLINE') ||
      message.includes('WebKit encountered an internal error') ||
      message.includes('Could not connect') ||
      message.includes('Timeout');
    if (!tolerated) throw err;
  }
}

async function assertOfflineLaunch(page, slug) {
  await page.waitForSelector('iframe', { timeout: 20_000 });
  const text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
  assert(!text.includes('You are offline'), `${slug}: generic marketplace offline screen appeared`);
  assert(!text.includes('Saved copy missing'), `${slug}: launcher reported missing saved copy`);
  assert(!text.includes('Saved copy was evicted'), `${slug}: launcher reported evicted saved copy`);
}

async function sealSlug(context, slug) {
  const page = await context.newPage();
  await page.goto(`${origin}/run/${encodeURIComponent(slug)}`, { waitUntil: 'load', timeout: 45_000 });
  await waitForSwControl(page);
  const saved = await downloadCapsule(page, slug);
  const status = await capsuleStatus(page, slug);
  assert(status?.state === 'saved', `${slug}: SW status is not saved (${JSON.stringify(status)})`);
  await page.close();
  return { saved, status };
}

function savedResult(slug, saved, status) {
  return {
    slug,
    totalBytes: saved.totalBytes ?? status.totalBytes ?? 0,
    manifestHash: saved.manifestHash ?? status.manifestHash ?? null,
  };
}

async function coldLaunch(context, slug) {
  const coldPage = await context.newPage();
  await gotoOffline(coldPage, `${origin}/run/${encodeURIComponent(slug)}`);
  await assertOfflineLaunch(coldPage, slug);
  await coldPage.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await assertOfflineLaunch(coldPage, slug);
  await coldPage.close().catch(() => {});
}

async function proveSlug(browser, slug) {
  const context = await browser.newContext(contextOptions);
  const { saved, status } = await sealSlug(context, slug);
  await context.setOffline(true);
  await coldLaunch(context, slug);
  await context.close();

  return savedResult(slug, saved, status);
}

async function assertOriginDown() {
  const probeUrl = new URL(`/__shippie-origin-down-probe-${Date.now()}`, origin);
  try {
    const res = await fetch(probeUrl, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(2000) });
    throw new Error(`origin still reachable (${res.status})`);
  } catch (err) {
    if (String(err?.message || err).includes('origin still reachable')) throw err;
  }
}

async function waitForOriginDown() {
  const deadline = Date.now() + killWaitMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await assertOriginDown();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError ?? new Error(`origin still reachable after ${killWaitMs}ms`);
}

async function proveWithOriginKilled(browser) {
  const context = await browser.newContext(contextOptions);
  const sealed = [];
  try {
    for (const slug of slugs) {
      const { saved, status } = await sealSlug(context, slug);
      sealed.push({ slug, saved, status });
    }

    console.log(`READY_TO_KILL_ORIGIN ${origin} within ${killWaitMs}ms`);
    await waitForOriginDown();

    const output = [];
    for (const item of sealed) {
      await coldLaunch(context, item.slug);
      output.push(savedResult(item.slug, item.saved, item.status));
    }
    return output;
  } finally {
    await context.close().catch(() => {});
  }
}

const browser = await engine.launch({ headless: true });
const results = [];
const failures = [];

try {
  if (originKilledMode) {
    try {
      results.push(...await proveWithOriginKilled(browser));
    } catch (err) {
      failures.push({ slug: '*', error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    for (const slug of slugs) {
      try {
        results.push(await proveSlug(browser, slug));
      } catch (err) {
        failures.push({ slug, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
} finally {
  await browser.close();
}

const report = { ok: failures.length === 0, engine: engineName, origin, mode: originKilledMode ? 'origin-killed' : 'browser-offline', checked: slugs.length, results, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
