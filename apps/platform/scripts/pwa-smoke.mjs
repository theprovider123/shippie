// PWA blank-shell smoke test.
// Catches the "PWA opens to a full white screen" regression: asserts that the
// core routes render a real landmark/header/content (and don't leave <body>
// blank) on fresh load, service-worker-warm reload, and offline reload.
//
// Run against production or a local build (needs a Chromium via playwright):
//   BASE=https://shippie.app node apps/platform/scripts/pwa-smoke.mjs
//   BASE=http://localhost:5173 node apps/platform/scripts/pwa-smoke.mjs
// Exits non-zero if any probed route renders a blank shell.
//
// NOTE: not yet wired into `bun run check` (CI has no browser); run manually
// or add a Playwright CI job. Uses the platform package's `playwright` dev dep.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://shippie.app';
const ROUTES = ['/dock', '/you', '/tools', '/dock?app=palate'];
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 5000);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
let failed = 0;

async function rendersContent(page) {
  return page.evaluate(() => {
    const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().length;
    const hasLandmark = !!document.querySelector('main, [role=main], header, h1, h2');
    return { txt, hasLandmark, blank: txt < 5 && !hasLandmark };
  });
}

async function check(label, navigate) {
  const page = await ctx.newPage();
  await navigate(page).catch(() => {});
  await page.waitForTimeout(TIMEOUT);
  const r = await rendersContent(page);
  console.log(`${r.blank ? 'FAIL  BLANK' : 'pass  ok   '}  ${label}  (text=${r.txt}, landmark=${r.hasLandmark})`);
  if (r.blank) failed++;
  return page;
}

for (const route of ROUTES) {
  await check(`fresh ${route}`, (p) => p.goto(`${BASE}${route}`, { waitUntil: 'load' }));
}
// Service-worker-warm reload
const warm = await check('warm /dock', (p) => p.goto(`${BASE}/dock`, { waitUntil: 'load' }));
await warm.waitForTimeout(1500);
await warm.reload({ waitUntil: 'load' }).catch(() => {});
await warm.waitForTimeout(TIMEOUT);
{
  const r = await rendersContent(warm);
  console.log(`${r.blank ? 'FAIL  BLANK' : 'pass  ok   '}  reload /dock (SW warm)  (text=${r.txt}, landmark=${r.hasLandmark})`);
  if (r.blank) failed++;
}
// Offline reload should show the offline shell, never a blank body
await ctx.setOffline(true);
await warm.reload({ waitUntil: 'load' }).catch(() => {});
await warm.waitForTimeout(TIMEOUT);
{
  const r = await rendersContent(warm);
  console.log(`${r.blank ? 'FAIL  BLANK' : 'pass  ok   '}  reload /dock (offline)  (text=${r.txt}, landmark=${r.hasLandmark})`);
  if (r.blank) failed++;
}
await ctx.setOffline(false);

await browser.close();
console.log(failed ? `\n${failed} blank-shell failure(s)` : '\nAll routes rendered content.');
process.exit(failed ? 1 : 0);
