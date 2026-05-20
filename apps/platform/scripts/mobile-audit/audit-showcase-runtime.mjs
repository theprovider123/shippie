#!/usr/bin/env bun
/**
 * Showcase RUNTIME mobile-overflow audit.
 *
 * The static sweep (audit-showcase-overflow.mjs) reads CSS/JSX and guesses.
 * It missed Dough — a `datetime-local` input whose intrinsic width blows
 * past `width:100%` on WebKit/iOS. This script renders each showcase for
 * real and measures actual layout boxes.
 *
 * Mechanism: each showcase is a Vite + React app with a prebuilt `dist/`.
 * We serve `dist/` over a tiny static HTTP server (one server reused for
 * the whole run; the slug is the first path segment) and drive it with
 * Playwright at the QA phone widths 360 / 390 / 430.
 *
 * ENGINES: we test BOTH Chromium and WebKit. WebKit is the engine iOS
 * Safari ships — datetime-local / date / time inputs have a wide intrinsic
 * minimum width on WebKit that Chromium does not reproduce, so a
 * Chromium-only audit misses exactly the Dough failure class. The report
 * records which engine each finding came from.
 *
 * Per app, per engine, per width we:
 *   - load (networkidle + settle), tolerate failure as "load-failed"
 *   - detect horizontal overflow:
 *       document.documentElement.scrollWidth > innerWidth + 1
 *   - when overflow exists, walk the DOM and collect every element whose
 *     getBoundingClientRect().right exceeds the viewport, report worst 5
 *   - separately flag position:fixed / position:absolute elements whose
 *     rect right/bottom spills past the viewport (overlap risk)
 *
 * Playwright is not a runtime dep of @shippie/platform; we `import()` it
 * lazily so the rest of the audit suite still runs when it is absent.
 *
 * Run:
 *   bun apps/platform/scripts/mobile-audit/audit-showcase-runtime.mjs
 *
 * Env:
 *   WIDTHS=360,390,430        override the width matrix
 *   ONLY=dough,chess          restrict to a comma list of slugs
 *   ENGINES=chromium,webkit   override the engine list
 */
import { createServer } from 'node:http';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const APPS = join(ROOT, 'apps');
const REPORT = join(HERE, 'showcase-runtime-overflow-report.md');

const WIDTHS = (process.env.WIDTHS ?? '360,390,430')
  .split(',')
  .map((w) => Number(w.trim()))
  .filter((w) => Number.isFinite(w) && w > 0);
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

async function showcaseSlugs() {
  const entries = await readdir(APPS, { withFileTypes: true });
  let slugs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('showcase-'))
    .map((e) => e.name.slice('showcase-'.length))
    .sort();
  if (ONLY.length) slugs = slugs.filter((s) => ONLY.includes(s));
  return slugs;
}

/**
 * One static server for the whole run. URL shape:
 *   /<slug>/                -> apps/showcase-<slug>/dist/index.html
 *   /<slug>/assets/x.js     -> apps/showcase-<slug>/dist/assets/x.js
 * Unknown paths inside a slug fall back to that slug's index.html so a
 * client-side router (BrowserRouter) still resolves.
 */
function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);
        const slug = parts.shift();
        if (!slug) {
          res.writeHead(404).end('no slug');
          return;
        }
        const distRoot = join(APPS, `showcase-${slug}`, 'dist');
        let rel = parts.join('/') || 'index.html';
        let filePath = normalize(join(distRoot, rel));
        if (!filePath.startsWith(distRoot)) {
          res.writeHead(403).end('forbidden');
          return;
        }
        let info = await stat(filePath).catch(() => null);
        if (info && info.isDirectory()) {
          filePath = join(filePath, 'index.html');
          info = await stat(filePath).catch(() => null);
        }
        // SPA fallback: any miss without a file extension -> index.html
        if (!info && !/\.[a-z0-9]+$/i.test(rel)) {
          filePath = join(distRoot, 'index.html');
          info = await stat(filePath).catch(() => null);
        }
        if (!info) {
          res.writeHead(404).end('not found');
          return;
        }
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        res.writeHead(200, {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500).end(String(err?.message ?? err));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

/**
 * Runs inside the page. Returns overflow geometry + offender lists.
 * Kept as a plain function string-evaluated by Playwright.
 */
function inspectPage() {
  const doc = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollWidth = doc.scrollWidth;
  const overflowPx = scrollWidth - vw;

  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const cls =
      typeof el.className === 'string'
        ? el.className.trim()
        : (el.getAttribute && el.getAttribute('class')) || '';
    const cs = window.getComputedStyle(el);
    let text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 60) text = text.slice(0, 60) + '…';
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute ? el.getAttribute('type') : null,
      cls: cls.slice(0, 120),
      id: el.id || '',
      position: cs.position,
      rect: {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      text,
    };
  };

  // Elements whose box extends past the right viewport edge. We keep only
  // the *deepest* offenders: if an offending element has an offending
  // child, the child is the more precise culprit.
  const all = Array.from(document.body.querySelectorAll('*'));
  const rightOffenders = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1) {
      const hasOffendingChild = Array.from(el.children).some((c) => {
        const cr = c.getBoundingClientRect();
        return cr.width > 0 && cr.right > vw + 1;
      });
      if (!hasOffendingChild) rightOffenders.push(el);
    }
  }
  rightOffenders.sort(
    (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right,
  );

  // position:fixed / absolute elements spilling past right or bottom edge.
  const spillOffenders = [];
  for (const el of all) {
    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1) {
      spillOffenders.push(el);
    }
  }
  spillOffenders.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return br.right - br.left - (ar.right - ar.left);
  });

  return {
    vw,
    vh,
    scrollWidth,
    overflowPx,
    hasOverflow: overflowPx > 1,
    rightOffenders: rightOffenders.slice(0, 6).map(describe),
    spillOffenders: spillOffenders.slice(0, 6).map(describe),
  };
}

/**
 * Returns candidate selectors to click for exploring secondary states.
 * Runs in-page. We prefer tab/nav controls and the first prominent
 * content card/list-item — these are where detail forms (and the wide
 * date/time inputs that overflow) typically live. The known Dough bug
 * lives on the Recipe detail page, reachable only by clicking a card.
 */
function collectInteractionTargets() {
  const seen = new Set();
  const targets = [];
  const push = (el, label) => {
    if (!el || seen.has(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    seen.add(el);
    // give each a stable marker so the driver can re-find it
    const marker = `data-audit-target-${targets.length}`;
    el.setAttribute(marker, '1');
    targets.push({ marker, label });
  };
  // nav / tab controls
  for (const el of document.querySelectorAll(
    '[role="tab"], nav button, nav a, .tab, .tabs button, [class*="tab"] button, footer button, footer a',
  )) {
    push(el, 'nav');
  }
  // first few content cards / list rows
  const cards = document.querySelectorAll(
    'main button, main a, [class*="card"], [class*="row"], [class*="item"], li button, li a, ul > li',
  );
  let added = 0;
  for (const el of cards) {
    if (added >= 6) break;
    const tag = el.tagName.toLowerCase();
    const clickable =
      tag === 'a' ||
      tag === 'button' ||
      el.getAttribute('role') === 'button' ||
      getComputedStyle(el).cursor === 'pointer' ||
      el.querySelector('button, a');
    if (!clickable) continue;
    push(el, 'card');
    added++;
  }
  return targets;
}

/**
 * Drive one page through landing + a bounded set of secondary states,
 * measuring after each. Returns the worst inspect snapshot seen plus a
 * label describing where it came from.
 */
async function inspectWithInteraction(page) {
  let worst = await page.evaluate(inspectPage);
  worst = { ...worst, state: 'landing' };

  let targets = [];
  try {
    targets = await page.evaluate(collectInteractionTargets);
  } catch {
    return worst;
  }

  for (const { marker, label } of targets.slice(0, 10)) {
    try {
      const handle = await page.$(`[${marker}]`);
      if (!handle) continue;
      await handle.click({ timeout: 1500, trial: false });
      await page.waitForTimeout(350);
      const snap = await page.evaluate(inspectPage);
      if (snap.overflowPx > worst.overflowPx) {
        worst = { ...snap, state: label };
      } else if (
        snap.spillOffenders.length > worst.spillOffenders.length &&
        !worst.hasOverflow
      ) {
        worst = { ...snap, state: label };
      }
    } catch {
      // a click that navigates away, opens a file dialog, or detaches the
      // node is fine — keep going with whatever state we landed in.
    }
  }
  return worst;
}

async function main() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.error(
      '[runtime-audit] Playwright not installed. Run `bun add -d playwright` in apps/platform first.',
    );
    process.exit(2);
  }

  const slugs = await showcaseSlugs();
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  console.log(`[runtime-audit] serving showcases from ${base}`);
  console.log(
    `[runtime-audit] ${slugs.length} showcases, engines ${ENGINES.join('+')}, widths ${WIDTHS.join('/')}`,
  );

  // Launch each requested engine. An engine that fails to launch (e.g. its
  // browser binary was never installed) is skipped, not fatal.
  const browsers = [];
  for (const engineName of ENGINES) {
    const engine = playwright[engineName];
    if (!engine) {
      console.warn(`[runtime-audit] unknown engine '${engineName}', skipping`);
      continue;
    }
    try {
      const browser = await engine.launch();
      browsers.push({ name: engineName, browser });
    } catch (err) {
      console.warn(
        `[runtime-audit] engine '${engineName}' failed to launch (${err.message}); skipping. ` +
          `Install with: npx playwright install ${engineName}`,
      );
    }
  }
  if (!browsers.length) {
    console.error('[runtime-audit] no usable browser engine; aborting.');
    server.close();
    process.exit(2);
  }

  const enginesUsed = browsers.map((b) => b.name);
  const results = [];

  for (const slug of slugs) {
    // appResult.runs: flat list, each tagged with engine + width.
    const appResult = { slug, runs: [], loadFailed: false };

    for (const { name: engineName, browser } of browsers) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('pageerror', (e) => consoleErrors.push(e.message));
        const url = `${base}/${slug}/`;
        const run = {
          engine: engineName,
          width,
          loaded: true,
          inspect: null,
          note: null,
        };

        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          await page.waitForTimeout(700); // fonts / wasm / lazy layout settle
          const bodyLen = await page.evaluate(
            () => document.body && document.body.innerText.trim().length,
          );
          // landing + bounded interaction sweep; keeps the worst state seen
          const inspect = await inspectWithInteraction(page);
          run.inspect = inspect;
          if (bodyLen === 0 && consoleErrors.length) {
            run.loaded = false;
            run.note = `empty body; pageerror: ${consoleErrors[0]}`;
          }
        } catch (err) {
          run.loaded = false;
          run.note = `nav error: ${err.message}`;
        } finally {
          await context.close();
        }

        appResult.runs.push(run);
      }
    }

    appResult.loadFailed = appResult.runs.every((r) => !r.loaded);
    const anyOverflow = appResult.runs.some(
      (r) => r.loaded && r.inspect && r.inspect.hasOverflow,
    );
    const anySpill = appResult.runs.some(
      (r) => r.loaded && r.inspect && r.inspect.spillOffenders.length > 0,
    );
    results.push(appResult);

    const tag = appResult.loadFailed
      ? 'LOAD-FAILED'
      : anyOverflow
        ? 'OVERFLOW'
        : anySpill
          ? 'spill-only'
          : 'ok';
    console.log(`[runtime-audit] ${slug.padEnd(22)} ${tag}`);
  }

  for (const { browser } of browsers) await browser.close();
  server.close();

  // ---- classify severity -------------------------------------------------
  // P0: overflow > ~24px on any engine/width (content likely clipped/
  //     overlapping), or a fixed/absolute element visibly spilling.
  // P1: 2-24px overflow on any engine/width (scrollable but readable).
  // P2: <=2px or spill-only with small magnitude.
  const classify = (app) => {
    if (app.loadFailed) return null;
    const ok = app.runs.filter((r) => r.loaded && r.inspect);
    const maxPx = Math.max(0, ...ok.map((r) => r.inspect.overflowPx));
    const spill = ok.some((r) => r.inspect.spillOffenders.length > 0);
    const engines = [
      ...new Set(ok.filter((r) => r.inspect.hasOverflow).map((r) => r.engine)),
    ];
    if (maxPx <= 1 && !spill) return { sev: null, maxPx, engines };
    if (maxPx > 24) return { sev: 'P0', maxPx, engines };
    if (maxPx > 2) return { sev: 'P1', maxPx, engines };
    return { sev: 'P2', maxPx, engines };
  };

  const offenderLine = (o) => {
    const sel = `${o.tag}${o.id ? '#' + o.id : ''}${
      o.cls ? '.' + o.cls.split(/\s+/).join('.') : ''
    }`;
    const t = o.type ? `[type=${o.type}]` : '';
    return `\`${sel}${t}\` right=${o.rect.right} w=${o.rect.width} pos=${o.position}${
      o.text ? ' — "' + o.text + '"' : ''
    }`;
  };

  const buckets = { P0: [], P1: [], P2: [], clean: [], loadFailed: [] };
  for (const app of results) {
    if (app.loadFailed) {
      buckets.loadFailed.push(app);
      continue;
    }
    const c = classify(app);
    if (!c || !c.sev) buckets.clean.push(app);
    else buckets[c.sev].push({ app, ...c });
  }

  // ---- markdown report ---------------------------------------------------
  const md = [];
  md.push('# Showcase runtime mobile-overflow report');
  md.push('');
  md.push(`_Generated ${new Date().toISOString()}_`);
  md.push('');
  md.push(
    `Runtime audit: each showcase’s built \`dist/\` served statically and rendered in Playwright (${enginesUsed.join(
      ' + ',
    )}) at widths ${WIDTHS.join(' / ')}px (iPhone-class viewports, isMobile + touch).`,
  );
  md.push('');
  md.push(
    'WebKit is the engine iOS Safari ships; date/time inputs have a wide intrinsic min-width on WebKit that Chromium does not reproduce. Findings note which engine they came from.',
  );
  md.push('');
  md.push(
    'Overflow = `documentElement.scrollWidth > innerWidth + 1`. Offenders = deepest elements whose `getBoundingClientRect().right` exceeds the viewport. Spill = `position:fixed`/`absolute` boxes past the viewport edge.',
  );
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push(`- Audited: ${results.length} showcases`);
  md.push(`- P0 (content clipped / overlap risk): ${buckets.P0.length}`);
  md.push(`- P1 (horizontal scroll, readable): ${buckets.P1.length}`);
  md.push(`- P2 (minor, <=2px / small spill): ${buckets.P2.length}`);
  md.push(`- Clean: ${buckets.clean.length}`);
  md.push(`- Load-failed: ${buckets.loadFailed.length}`);
  md.push('');

  const writeBucket = (title, entries) => {
    md.push(`## ${title}`);
    md.push('');
    if (!entries.length) {
      md.push('_None._');
      md.push('');
      return;
    }
    entries.sort((a, b) => b.maxPx - a.maxPx);
    for (const { app, maxPx, engines } of entries) {
      const ok = app.runs.filter((r) => r.loaded && r.inspect);
      const grid = ok
        .map(
          (r) =>
            `${r.engine}/${r.width}:${
              r.inspect.overflowPx > 1 ? '+' + r.inspect.overflowPx + 'px' : 'ok'
            }`,
        )
        .join('  ');
      md.push(`### showcase-${app.slug}`);
      md.push('');
      md.push(
        `Worst overflow: **${maxPx}px**${
          engines.length ? ` (engine: ${engines.join(', ')})` : ''
        }.`,
      );
      md.push('');
      md.push(`Per engine/width: ${grid}`);
      md.push('');
      // worst-overflow run drives the offender detail
      const worst = ok
        .filter((r) => r.inspect.hasOverflow)
        .sort((a, b) => b.inspect.overflowPx - a.inspect.overflowPx)[0];
      if (worst) {
        md.push(
          `Offending elements (@ ${worst.engine} ${worst.width}px, ${worst.inspect.overflowPx}px over, state: ${worst.inspect.state ?? 'landing'}):`,
        );
        for (const o of worst.inspect.rightOffenders.slice(0, 5)) {
          md.push(`- ${offenderLine(o)}`);
        }
        md.push('');
      }
      const spillRun = ok
        .filter((r) => r.inspect.spillOffenders.length)
        .sort((a, b) => a.width - b.width)[0];
      if (spillRun) {
        md.push(
          `Fixed/absolute spill (@ ${spillRun.engine} ${spillRun.width}px):`,
        );
        for (const o of spillRun.inspect.spillOffenders.slice(0, 4)) {
          md.push(`- ${offenderLine(o)} bottom=${o.rect.bottom}`);
        }
        md.push('');
      }
    }
  };

  writeBucket('P0 — content clipped / overlap risk', buckets.P0);
  writeBucket('P1 — horizontal scroll, readable', buckets.P1);
  writeBucket('P2 — minor', buckets.P2);

  md.push('## Clean showcases');
  md.push('');
  md.push(
    buckets.clean.length
      ? buckets.clean.map((a) => `showcase-${a.slug}`).join(', ')
      : '_None._',
  );
  md.push('');
  md.push('## Load-failed showcases');
  md.push('');
  if (!buckets.loadFailed.length) {
    md.push('_None — all showcases rendered._');
  } else {
    for (const app of buckets.loadFailed) {
      const note = app.runs.find((r) => r.note)?.note ?? 'unknown';
      md.push(`- showcase-${app.slug}: ${note}`);
    }
  }
  md.push('');

  await writeFile(REPORT, md.join('\n'));

  console.log('');
  console.log(`[runtime-audit] P0=${buckets.P0.length} P1=${buckets.P1.length} P2=${buckets.P2.length} clean=${buckets.clean.length} load-failed=${buckets.loadFailed.length}`);
  console.log(`[runtime-audit] wrote ${relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error('[runtime-audit] failed:', err);
  process.exit(1);
});
