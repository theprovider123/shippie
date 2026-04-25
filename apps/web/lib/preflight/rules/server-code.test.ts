/**
 * server-code rule tests.
 *
 * Positive cases (should block): .vercel/output/, pages/api/, Next SSR
 * config, package.json with `next start`.
 *
 * Negative cases (should pass): plain static bundle, Vite dist/ tree,
 * Next static export (`output: 'export'`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ShippieJson } from '@shippie/shared';
import { runPreflight } from '../runner.ts';
import { serverCodeRule } from './server-code.ts';
import type { PreflightInput } from '../types.ts';

function baseManifest(overrides: Partial<ShippieJson> = {}): ShippieJson {
  return {
    version: 1,
    name: 'Recipes',
    slug: 'recipes',
    type: 'app',
    category: 'food_and_drink',
    ...overrides,
  };
}

function baseInput(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    manifest: baseManifest(),
    manifestSource: 'maker',
    sourceFiles: ['index.html', 'assets/app.js'],
    outputFiles: ['index.html', 'assets/app.js'],
    outputBytes: 1024,
    reservedSlugs: new Set<string>(),
    ...overrides,
  };
}

// --------------------------------------------------------------------
// Positive cases — rule should block
// --------------------------------------------------------------------

test('blocks on .vercel/output/ functions bundle', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: [
        'index.html',
        '.vercel/output/functions/api/hello.func/index.js',
        '.vercel/output/config.json',
      ],
      outputFiles: [
        'index.html',
        '.vercel/output/functions/api/hello.func/index.js',
        '.vercel/output/config.json',
      ],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
  const blocker = report.blockers.find((f) => f.rule === 'server-code');
  assert.ok(blocker, 'server-code should block');
  assert.match(blocker!.detail ?? '', /Wrap mode/);
  assert.match(blocker!.detail ?? '', /\/new/);
  assert.equal(blocker!.remediation?.kind, 'use-wrap-mode');
});

test('blocks on pages/api/ route files', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'pages/api/hello.js', 'pages/index.js'],
      outputFiles: ['index.html', 'pages/api/hello.js', 'pages/index.js'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'server-code'));
});

test('blocks on app/api/ route handlers', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'app/api/hello/route.ts'],
      outputFiles: ['index.html', 'app/api/hello/route.ts'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'server-code'));
});

test('blocks on netlify/functions/', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'netlify/functions/hello.js'],
      outputFiles: ['index.html', 'netlify/functions/hello.js'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

test('blocks on Firebase functions/', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'functions/index.js', 'functions/package.json'],
      outputFiles: ['index.html', 'functions/index.js', 'functions/package.json'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

test('blocks on Nuxt/Nitro .output/server/', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', '.output/server/index.mjs', '.output/public/index.html'],
      outputFiles: ['index.html', '.output/server/index.mjs', '.output/public/index.html'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

test('blocks on package.json with scripts.start = "next start"', async () => {
  const pkg = Buffer.from(
    JSON.stringify({
      name: 'myapp',
      scripts: { start: 'next start', build: 'next build' },
    }),
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['package.json', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([
        ['package.json', pkg],
      ]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
  const blocker = report.blockers.find((f) => f.rule === 'server-code');
  assert.ok(blocker);
  assert.match(blocker!.detail ?? '', /next start/);
});

test('blocks on package.json with scripts.start = "node server.js"', async () => {
  const pkg = Buffer.from(
    JSON.stringify({ name: 'x', scripts: { start: 'node server.js' } }),
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['package.json', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([['package.json', pkg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

test('blocks on next.config.js with output: "server"', async () => {
  const cfg = Buffer.from(
    `module.exports = { output: 'server', reactStrictMode: true };\n`,
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['next.config.js', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([['next.config.js', cfg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

test('blocks on next.config.mjs with no output field (defaults to server)', async () => {
  const cfg = Buffer.from(
    `export default { reactStrictMode: true };\n`,
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['next.config.mjs', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([['next.config.mjs', cfg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, false);
});

// --------------------------------------------------------------------
// Negative cases — rule should pass
// --------------------------------------------------------------------

test('passes on plain static bundle (index.html + assets)', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'style.css', 'script.js', 'images/logo.png'],
      outputFiles: ['index.html', 'style.css', 'script.js', 'images/logo.png'],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true);
  assert.equal(report.blockers.length, 0);
});

test('passes on Vite dist/ style bundle', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: [
        'index.html',
        'assets/index.abc123.js',
        'assets/index.abc123.css',
        'assets/logo.def456.svg',
      ],
      outputFiles: [
        'index.html',
        'assets/index.abc123.js',
        'assets/index.abc123.css',
        'assets/logo.def456.svg',
      ],
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true);
});

test('passes on Next static export (next.config sets output: "export")', async () => {
  // A Next project that DOES static export may still include a
  // next.config file in the zip; we should not flag it.
  const cfg = Buffer.from(
    `module.exports = { output: 'export', trailingSlash: true };\n`,
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['next.config.js', 'index.html', '_next/static/chunks/main.js'],
      outputFiles: ['index.html', '_next/static/chunks/main.js'],
      fileContents: new Map<string, Buffer>([['next.config.js', cfg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true, JSON.stringify(report.blockers));
});

test('passes on package.json with static-site scripts', async () => {
  const pkg = Buffer.from(
    JSON.stringify({
      name: 'vite-app',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
    }),
  );
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['package.json', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([['package.json', pkg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true);
});

test('passes when fileContents is omitted and no server dir patterns exist', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', 'app.js'],
      outputFiles: ['index.html', 'app.js'],
      // fileContents intentionally omitted
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true);
});

test('tolerates malformed package.json without throwing', async () => {
  const pkg = Buffer.from('{ not: valid json');
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['package.json', 'index.html'],
      outputFiles: ['index.html'],
      fileContents: new Map<string, Buffer>([['package.json', pkg]]),
    }),
    [serverCodeRule],
  );
  assert.equal(report.passed, true);
});
