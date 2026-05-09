/**
 * shippie init — scaffold a shippie.json + starter index.html, styles.css,
 * manifest.webmanifest, and main.ts in the current directory.
 *
 * The HTML/CSS/manifest are templates the maker is meant to LEARN from —
 * the deploy pipeline (apps/platform/.../deploy/pipeline.ts:injectEssentials)
 * enforces the same baseline at deploy time regardless. The scaffold's
 * job is to teach the dvh + safe-area + sharp-corners + touch-action
 * pattern so the maker writes new code in that style.
 *
 * Existing files are never overwritten. Run `shippie init` in an empty
 * dir or fold the missing pieces into an existing project at your own
 * pace.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

export async function initCommand() {
  const cwd = process.cwd();
  const target = resolve(cwd, 'shippie.json');
  const created: string[] = [];
  const skipped: string[] = [];

  const name = basename(cwd)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const slug = basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // shippie.json
  if (existsSync(target)) {
    skipped.push('shippie.json');
  } else {
    const config = {
      version: 1,
      name,
      icon: './icon.png',
      theme_color: '#E8603C',
      display: 'standalone',
      categories: ['tools'],
      description: `An installable Shippie app called ${name}.`,
      badge: true,
      transitions: 'slide',
      haptics: true,
      sound: false,
      ambient: false,
      local: {
        database: false,
        files: false,
        ai: [],
        sync: false,
      },
    };
    writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
    created.push('shippie.json');
  }

  // index.html — viewport + iOS standalone metas baked in. The deploy
  // pipeline re-injects these idempotently, but having them in source
  // means local previews behave identically to production.
  const indexHtmlPath = resolve(cwd, 'index.html');
  if (existsSync(indexHtmlPath)) {
    skipped.push('index.html');
  } else {
    writeFileSync(indexHtmlPath, INDEX_HTML_TEMPLATE(name));
    created.push('index.html');
  }

  // styles.css — dvh body, safe-area padding, sharp corners,
  // touch-action: manipulation. The Shippie hallmarks.
  const stylesCssPath = resolve(cwd, 'styles.css');
  if (existsSync(stylesCssPath)) {
    skipped.push('styles.css');
  } else {
    writeFileSync(stylesCssPath, STYLES_CSS_TEMPLATE);
    created.push('styles.css');
  }

  // manifest.webmanifest — for documentation. The Shippie shell's own
  // manifest takes precedence at runtime, but a per-app manifest is
  // useful when running the app standalone outside Shippie for testing.
  const manifestPath = resolve(cwd, 'manifest.webmanifest');
  if (existsSync(manifestPath)) {
    skipped.push('manifest.webmanifest');
  } else {
    writeFileSync(manifestPath, MANIFEST_TEMPLATE(name, slug));
    created.push('manifest.webmanifest');
  }

  // main.ts — wires the SDK helpers (useKeyboard for cross-origin
  // keyboard signalling, useSafeArea for fixed positioning, useViewport
  // for breakpoint logic). All three are no-ops outside Shippie so the
  // app still works when previewed standalone.
  const mainTsPath = resolve(cwd, 'main.ts');
  if (existsSync(mainTsPath)) {
    skipped.push('main.ts');
  } else {
    writeFileSync(mainTsPath, MAIN_TS_TEMPLATE);
    created.push('main.ts');
  }

  if (created.length > 0) {
    console.log(`Created for "${name}":`);
    for (const f of created) console.log(`  + ${f}`);
  }
  if (skipped.length > 0) {
    console.log('Skipped (already present):');
    for (const f of skipped) console.log(`  - ${f}`);
  }
}

function INDEX_HTML_TEMPLATE(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content">
    <meta name="theme-color" content="#E8603C">

    <!-- iOS / Android standalone — Add-to-Home-Screen launches without
         browser chrome. The Shippie deploy pipeline re-injects these
         idempotently; keeping them in source means local previews
         behave like production. -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}">
    <meta name="mobile-web-app-capable" content="yes">

    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="stylesheet" href="./styles.css">
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <main id="main">
      <h1>${escapeHtml(name)}</h1>
      <p>Replace this with your app.</p>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`;
}

const STYLES_CSS_TEMPLATE = `/* Shippie hallmarks: sharp corners, dynamic viewport units, safe-area
   insets, touch-action manipulation. The deploy pipeline injects an
   immersive baseline regardless, but writing in this style makes your
   intent clear and previews accurate. */

:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
}

*, *::before, *::after { box-sizing: border-box; }

html {
  min-height: 100%;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: contain;
}

body {
  margin: 0;
  /* Cascade — svh fallback for browsers without dvh, then dvh where
     supported. dvh shrinks when the iOS keyboard opens so layouts
     don't get pushed off-screen. */
  min-height: 100svh;
  min-height: 100dvh;
  /* Honour the device's safe area on every side. */
  padding:
    var(--safe-top)
    var(--safe-right)
    var(--safe-bottom)
    var(--safe-left);
  font-family: system-ui, sans-serif;
  background: #14120F;
  color: #EDE4D3;
  overscroll-behavior-y: contain;
}

main { padding: 1.5rem; }

/* Sharp corners — Shippie hallmark. No border-radius. */
button,
input,
.card {
  border-radius: 0;
  /* Touch targets must be ≥44px (Apple HIG) / ≥48dp (Android). */
  min-height: 44px;
}

input, textarea, select, [contenteditable="true"] {
  /* iOS zooms inputs <16px on focus — this prevents that. */
  font-size: 16px;
}
`;

function MANIFEST_TEMPLATE(name: string, slug: string): string {
  return JSON.stringify(
    {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      id: `/${slug}/`,
      start_url: './',
      display: 'standalone',
      background_color: '#14120F',
      theme_color: '#E8603C',
      orientation: 'any',
      icons: [
        { src: './icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  ) + '\n';
}

const MAIN_TS_TEMPLATE = `/**
 * Wire the Shippie SDK helpers so the chrome around your app cooperates
 * with what's happening inside it (keyboard rises → host steps out of
 * the way; orientation changes → safe-area insets refresh).
 *
 * Each helper is a no-op outside Shippie (e.g. when previewed standalone
 * via vite or a static server), so the app keeps working in both
 * contexts.
 */
import { useKeyboard, useSafeArea, useViewport, matchesStandalone } from '@shippie/sdk';

// Tells the Shippie shell when a text input is focused so the chrome
// can hide / reposition for the keyboard. Origin-safe — only posts to
// the parent that loaded this iframe.
useKeyboard();

// One-shot read of the current viewport + safe-area, useful for
// breakpoint decisions or for fixed-position elements that need to
// avoid the home-indicator / notch.
const viewport = useViewport();
const safe = useSafeArea();
console.log('[shippie] viewport', viewport, 'safe-area', safe);

if (matchesStandalone()) {
  document.documentElement.dataset.standalone = 'true';
}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
