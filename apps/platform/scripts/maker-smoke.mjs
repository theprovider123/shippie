// Maker-flow smoke test.
//
// Walks the maker backend (shell, apps list, app detail) and asserts each
// route renders real content — never a blank shell — at mobile width. Maker
// is auth-gated: without a session, routes redirect to /auth/login (which is
// itself non-blank). Provide a session cookie to exercise the maker UI:
//
//   BASE=https://shippie.app node apps/platform/scripts/maker-smoke.mjs
//   BASE=http://localhost:5173 SESSION="auth_session=…" \
//     SLUG=my-app node apps/platform/scripts/maker-smoke.mjs
//
// Exits non-zero if any probed route renders blank, or (when authed) if a
// maker route bounces to login. Sibling to pwa-smoke.mjs. Not wired into
// `bun run check` (CI has no browser) — run manually. Needs playwright-core.
import { chromium } from 'playwright-core';

const BASE = (process.env.BASE || 'https://shippie.app').replace(/\/$/, '');
const SESSION = process.env.SESSION || '';
const SLUG = process.env.SLUG || '';
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 5000);

const routes = ['/maker', '/maker/apps', '/maker/feedback'];
if (SLUG) routes.push(`/maker/apps/${SLUG}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

if (SESSION) {
  const cookies = SESSION.split(';').map((pair) => {
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    return { name, value, url: BASE };
  });
  await ctx.addCookies(cookies);
}

let failed = 0;

async function probe(page) {
  return page.evaluate(() => {
    const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const hasLandmark = !!document.querySelector('main, [role=main], header, h1, h2');
    const onLogin = /\/auth\/login/.test(location.pathname);
    return { len: txt.length, hasLandmark, blank: txt.length < 5 && !hasLandmark, onLogin };
  });
}

for (const route of routes) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(TIMEOUT);
  const r = await probe(page);
  const bounced = SESSION && r.onLogin;
  const bad = r.blank || bounced;
  const note = r.blank ? 'BLANK' : bounced ? 'BOUNCED→login' : r.onLogin ? 'login (no session)' : 'ok';
  console.log(`${bad ? 'FAIL' : 'pass'}  ${route.padEnd(24)} ${note}  (text=${r.len}, landmark=${r.hasLandmark})`);
  if (bad) failed++;
  await page.close();
}

await browser.close();

if (failed > 0) {
  console.error(`\n${failed} maker route(s) failed the smoke test.`);
  process.exit(1);
}
console.log(`\nAll ${routes.length} maker routes rendered content.`);
