import { chromium } from 'playwright';

const base = process.env.BASE || 'http://127.0.0.1:4182';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 }
];

const routes = [
  '/dock',
  '/tools',
  '/you',
  '/auth/login',
  '/maker',
  '/maker/apps',
  '/new',
  '/new?remix=golazo',
  '/apps/golazo',
  '/run/golazo/'
];

const ignoredConsole = [
  /Failed to load resource: the server responded with a status of 404.*favicon/i,
  /\[vite\]/i
];

function isIgnored(message) {
  return ignoredConsole.some((pattern) => pattern.test(message));
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const bodyText = (document.body?.innerText || '').trim();
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controlSelector = 'button, input, select, textarea, [role="button"], [role="switch"], [role="tab"]';
    const smallControls = Array.from(document.querySelectorAll(controlSelector))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.textContent?.trim().slice(0, 80) ||
          el.tagName.toLowerCase();
        return { label, tag: el.tagName.toLowerCase(), width: rect.width, height: rect.height };
      })
      .filter((item) => item.width < 44 || item.height < 44);

    return {
      title: document.title,
      bodyChars: bodyText.length,
      horizontalOverflow: doc.scrollWidth - doc.clientWidth,
      smallControls
    };
  });
}

async function switcherMetrics(page) {
  const openers = [
    'button[aria-label*="switcher" i]',
    'button[aria-label*="drawer" i]',
    'button[aria-label*="launcher" i]',
    'button[aria-label*="dock" i]',
    'button:has-text("🚀")'
  ];
  let openedBy = null;
  for (const selector of openers) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 1000 });
      openedBy = selector;
      break;
    } catch {
      // Try the next plausible opener.
    }
  }
  await page.waitForTimeout(350);

  const metrics = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const drawer =
      Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="drawer"], [class*="switcher"], [class*="launcher"]'))
        .filter(visible)
        .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] ||
      document.body;

    const qrCount = drawer.querySelectorAll('canvas, svg, img[alt*="QR" i], [aria-label*="QR" i]').length;
    const tagged = Array.from(drawer.querySelectorAll('[class*="tag"], [class*="pill"], [class*="badge"], [class*="state"], [class*="status"]'))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim().slice(0, 40),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      });
    const overlaps = [];
    for (let i = 0; i < tagged.length; i += 1) {
      for (let j = i + 1; j < tagged.length; j += 1) {
        const a = tagged[i];
        const b = tagged[j];
        const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (x * y > 24) overlaps.push([a.text, b.text]);
      }
    }
    return { qrCount, tagCount: tagged.length, overlaps };
  });

  let copied = false;
  for (const selector of ['button:has-text("Copy")', 'button[aria-label*="copy" i]']) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 1000 });
      copied = true;
      break;
    } catch {
      // Clipboard permissions can be unavailable in headless mode.
    }
  }

  return { openedBy, copied, ...metrics };
}

const browser = await chromium.launch({ headless: true });
const failures = [];
const observations = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.name === 'desktop' ? 1 : 2,
    isMobile: viewport.name !== 'desktop',
    hasTouch: viewport.name !== 'desktop',
    permissions: ['clipboard-read', 'clipboard-write']
  });

  for (const route of routes) {
    const page = await context.newPage();
    const consoleProblems = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if ((msg.type() === 'error' || msg.type() === 'warning') && !isIgnored(text)) {
        consoleProblems.push(`${msg.type()}: ${text}`);
      }
    });
    page.on('pageerror', (err) => consoleProblems.push(`pageerror: ${err.message}`));

    const url = new URL(route, base).href;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(600);
    const metrics = await pageMetrics(page);
    const record = { viewport: viewport.name, route, status: response?.status() ?? 0, ...metrics };

    if (!response || response.status() >= 500) failures.push({ ...record, reason: 'bad-status' });
    if (metrics.bodyChars < 20) failures.push({ ...record, reason: 'blank-or-nearly-blank' });
    if (metrics.horizontalOverflow > 2) failures.push({ ...record, reason: 'horizontal-overflow' });
    const relevantSmallControls = metrics.smallControls.filter((item) => item.tag !== 'input' || item.height < 36);
    if (relevantSmallControls.length > 0) failures.push({ ...record, reason: 'small-controls', smallControls: relevantSmallControls });
    if (consoleProblems.length > 0) failures.push({ ...record, reason: 'console', consoleProblems });

    if (route === '/run/golazo/') {
      const switcher = await switcherMetrics(page);
      observations.push({ viewport: viewport.name, route, switcher });
      if (!switcher.openedBy) failures.push({ viewport: viewport.name, route, reason: 'switcher-not-opened', switcher });
      if (switcher.qrCount < 1) failures.push({ viewport: viewport.name, route, reason: 'qr-missing', switcher });
      if (switcher.overlaps.length > 0) failures.push({ viewport: viewport.name, route, reason: 'tag-overlap', switcher });
    }

    observations.push(record);
    await page.close();
  }
  await context.close();
}

await browser.close();

const output = { base, failures, observations };
console.log(JSON.stringify(output, null, 2));
if (failures.length > 0) process.exit(1);
