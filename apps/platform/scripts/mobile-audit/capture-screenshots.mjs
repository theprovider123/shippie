#!/usr/bin/env bun
/**
 * Mobile-audit screenshot capture.
 *
 * Spins up Playwright Chromium and snaps the launcher home page at the
 * QA matrix widths (360 / 390 / 430 / 768 / 1024 / 1440). Asserts no
 * horizontal scroll at each width. Writes images to
 * scripts/mobile-audit/screenshots/<route>/<width>.png and prints a
 * markdown table.
 *
 * Requires a running platform dev server. Default target is
 * http://localhost:4101 — override with TARGET=https://...
 *
 * Playwright is not a runtime dep of @shippie/platform; the script
 * `import()`s it lazily so the static rules script still runs when
 * Playwright isn't installed.
 *
 * Run:
 *   bun apps/platform/scripts/mobile-audit/capture-screenshots.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const OUT_DIR = join(HERE, 'screenshots');
const REPORT = join(HERE, 'screenshots-report.md');

const TARGET = process.env.TARGET ?? 'http://localhost:4101';
const ROUTES = (process.env.ROUTES ?? '/,/?q=pdf,/dev/launcher-lab').split(',');
const WIDTHS = [360, 390, 430, 768, 1024, 1440];

function safeName(route) {
  return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    console.error(
      '[mobile-audit] Playwright not installed. Run `bun add -d playwright @playwright/test` in apps/platform first.',
    );
    process.exit(2);
  }

  const browser = await chromium.launch();
  const findings = [];

  for (const route of ROUTES) {
    const slug = safeName(route);
    await mkdir(join(OUT_DIR, slug), { recursive: true });

    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        isMobile: width < 768,
      });
      const page = await context.newPage();
      const url = `${TARGET}${route}`;
      const result = { route, width, url, ok: true, errors: [] };

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        // Allow lazy fonts/icons to settle
        await page.waitForTimeout(500);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        if (scrollWidth > clientWidth + 1) {
          result.ok = false;
          result.errors.push(`horizontal scroll: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`);
        }

        const nested = await page.evaluate(() => {
          const selectors = ['a a', 'a button', 'button a', 'button button'];
          const offenders = [];
          for (const sel of selectors) {
            for (const el of document.querySelectorAll(sel)) {
              offenders.push(`${sel} @ ${el.outerHTML.slice(0, 80)}`);
            }
          }
          return offenders;
        });
        if (nested.length > 0) {
          result.ok = false;
          for (const offender of nested) result.errors.push(`nested interactive: ${offender}`);
        }

        const out = join(OUT_DIR, slug, `${width}.png`);
        await page.screenshot({ path: out, fullPage: true });
      } catch (err) {
        result.ok = false;
        result.errors.push(`navigation error: ${err.message}`);
      } finally {
        await context.close();
      }

      findings.push(result);
      console.log(
        `[mobile-audit] ${route} @ ${width}px — ${result.ok ? 'ok' : 'FAIL'}${result.errors.length ? ' (' + result.errors.length + ' issue(s))' : ''}`,
      );
    }
  }

  await browser.close();

  const md = [];
  md.push('# Mobile-audit — screenshot capture');
  md.push('');
  md.push(`_Generated ${new Date().toISOString()}_`);
  md.push('');
  md.push(`Target: \`${TARGET}\``);
  md.push('');
  md.push('| Route | Width | Status | Issues |');
  md.push('|---|---|---|---|');
  for (const f of findings) {
    const status = f.ok ? 'ok' : 'FAIL';
    const issues = f.errors.length ? f.errors.join('<br>') : '—';
    md.push(`| \`${f.route}\` | ${f.width} | ${status} | ${issues} |`);
  }
  md.push('');
  await writeFile(REPORT, md.join('\n'));

  const failed = findings.filter((f) => !f.ok);
  if (failed.length > 0) {
    console.error(`[mobile-audit] ${failed.length}/${findings.length} captures failed.`);
    console.error(`[mobile-audit] wrote ${relative(ROOT, REPORT)}`);
    process.exit(1);
  }
  console.log(`[mobile-audit] ${findings.length}/${findings.length} captures green.`);
  console.log(`[mobile-audit] wrote ${relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error('[mobile-audit] capture failed:', err);
  process.exit(1);
});
