// Uniti QA screenshot harness. Logs in via the demo path, then captures every
// screen at desktop 1440x900 (DPR2) and mobile 390x844, recording console/page
// errors per screen. Run: bun scripts/uniti-qa-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

// Bun isolated-installs hoist packages under node_modules/.bun; import the
// resolved module file directly.
const { chromium } = await import(
  'file:///Users/devante/Documents/Shippie/.worktrees/uniti-cloudlet-phase-1a/node_modules/.bun/playwright-core@1.60.0/node_modules/playwright-core/index.mjs'
);

const BASE = process.env.QA_BASE ?? 'http://localhost:8788';
const OUT =
  '/Users/devante/Documents/Shippie/.worktrees/uniti-cloudlet-phase-1a/docs/uniti-qa-screens';
const exe = chromium.executablePath();

const LESSON_ID = 'l1';
const PUPIL_ID = 'p1';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dsf: 2, dir: `${OUT}/desktop` },
  { name: 'mobile', width: 390, height: 844, dsf: 3, dir: `${OUT}/mobile`, mobile: true },
];

// screen → { path, prep?(page) }
const SCREENS = [
  { id: '01-login', path: '/uniti/login', noAuth: true },
  { id: '02-today', path: '/uniti' },
  {
    id: '03-lesson-classmap',
    path: `/uniti/lessons/${LESSON_ID}`,
  },
  {
    id: '04-lesson-drawer',
    path: `/uniti/lessons/${LESSON_ID}`,
    async prep(page) {
      // Open the first pupil's feedback drawer.
      const pupil = page.locator('[data-pupil], .pupil-tile, .pupil-card, button:has-text("")').first();
      const tile = page.locator('.pupil-tile, .pupil, [class*="pupil"]').first();
      try {
        await tile.click({ timeout: 3000 });
        await page.waitForTimeout(600);
      } catch { /* drawer selector may differ; capture as-is */ }
    },
  },
  { id: '05-adaptations', path: '/uniti/adaptations' },
  {
    id: '06-adaptations-suggested',
    path: '/uniti/adaptations',
    async prep(page) {
      const btn = page.getByRole('button', { name: /suggest/i }).first();
      try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(900); } catch {}
    },
  },
  { id: '07-pupil-timeline', path: `/uniti/pupils/${PUPIL_ID}` },
  { id: '08-leadership', path: '/uniti/leadership' },
  {
    id: '09-leadership-drilldown',
    path: '/uniti/leadership',
    async prep(page) {
      const english = page.getByText(/English/i).first();
      try { await english.click({ timeout: 3000 }); await page.waitForTimeout(500); } catch {}
    },
  },
  { id: '10-roster', path: '/uniti/roster' },
  { id: '11-privacy', path: '/uniti/privacy' },
  { id: '12-setup', path: '/uniti/setup' },
  // Join needs auth + a token param (bare /uniti/join legitimately 404s).
  { id: '13-join', path: '/uniti/join/demo-invite-token-preview' },
];

async function run() {
  for (const vp of VIEWPORTS) mkdirSync(vp.dir, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe });
  const report = {};

  const shoot = async (page, vp, sc) => {
    const errors = [];
    const onErr = (e) => errors.push(`pageerror: ${e.message}`);
    const onConsole = (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); };
    page.on('pageerror', onErr);
    page.on('console', onConsole);
    try {
      await page.goto(`${BASE}${sc.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(500);
      if (sc.prep) await sc.prep(page);
      await page.waitForTimeout(300);
    } catch (e) {
      errors.push(`nav: ${e.message}`);
    }
    await page
      .screenshot({ path: `${vp.dir}/${sc.id}.png`, fullPage: true })
      .catch((e) => errors.push(`shot: ${e.message}`));
    report[`${vp.name}/${sc.id}`] = errors;
    page.off('pageerror', onErr);
    page.off('console', onConsole);
  };

  for (const vp of VIEWPORTS) {
    const ctxOpts = {
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    };

    // 1. Unauthenticated screens in a fresh, never-logged-in context.
    const anonCtx = await browser.newContext(ctxOpts);
    const anonPage = await anonCtx.newPage();
    for (const sc of SCREENS.filter((s) => s.noAuth)) await shoot(anonPage, vp, sc);
    await anonCtx.close();

    // 2. Authenticated screens — demo login then capture.
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();
    await page.goto(`${BASE}/uniti/login`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Sarah Mitchell/i }).click();
    await page.waitForURL('**/uniti', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    for (const sc of SCREENS.filter((s) => !s.noAuth)) await shoot(page, vp, sc);
    await context.close();
  }

  await browser.close();
  writeFileSync(`${OUT}/errors.json`, JSON.stringify(report, null, 2));
  // Print a compact error summary.
  let any = false;
  for (const [k, v] of Object.entries(report)) {
    if (v.length) { any = true; console.log(`\n[${k}]`); v.forEach((e) => console.log('  ' + e.slice(0, 200))); }
  }
  if (!any) console.log('No console/page errors on any screen.');
}

run().catch((e) => { console.error(e); process.exit(1); });
