/**
 * Preflight runner + default rules tests.
 *
 * Run with `bun test` from apps/web.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ShippieJson } from '@shippie/shared';
import { runPreflight } from './runner.ts';
import { defaultRules } from './rules/index.ts';
import type { PreflightInput } from './types.ts';

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
    sourceFiles: ['index.html', 'src/app.ts'],
    outputFiles: ['index.html', 'assets/app.abc.js', 'assets/app.abc.css'],
    packageManager: 'bun',
    framework: 'vite',
    outputBytes: 2 * 1024 * 1024,
    reservedSlugs: new Set(['shippie', 'admin', 'apple']),
    ...overrides,
  };
}

test('preflight passes on a clean Vite project', async () => {
  const report = await runPreflight(baseInput(), defaultRules);
  assert.equal(report.passed, true);
  assert.equal(report.blockers.length, 0);
});

test('preflight blocks reserved slug "admin"', async () => {
  const report = await runPreflight(
    baseInput({
      manifest: baseManifest({ slug: 'admin' }),
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  const blocker = report.blockers.find((f) => f.rule === 'slug-validation');
  assert.ok(blocker, 'slug-validation should block');
  assert.match(blocker!.title, /reserved/);
});

test('preflight blocks invalid slug format', async () => {
  const report = await runPreflight(
    baseInput({
      manifest: baseManifest({ slug: 'Recipes!' }),
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'slug-validation'));
});

test('preflight auto-drafts slug from name when missing', async () => {
  const manifest = baseManifest({ name: 'My Great App', slug: undefined });
  const report = await runPreflight(
    baseInput({
      manifest,
    }),
    defaultRules,
  );
  assert.equal(report.passed, true, 'auto-drafted slug should pass');
  assert.equal(manifest.slug, 'my-great-app');
  assert.ok(report.remediations.some((f) => f.remediation?.kind === 'derive-slug-from-name'));
});

test('preflight blocks when source contains __shippie/ files', async () => {
  const report = await runPreflight(
    baseInput({
      sourceFiles: ['index.html', '__shippie/sdk.js'],
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  const blocker = report.blockers.find((f) => f.rule === 'reserved-paths-collision');
  assert.ok(blocker);
  assert.match(blocker!.title, /collide/);
});

test('preflight blocks when output contains __shippie/ files', async () => {
  const report = await runPreflight(
    baseInput({
      outputFiles: ['index.html', '__shippie/sw.js'],
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'reserved-paths-collision'));
});

test('preflight blocks maker root service workers', async () => {
  const report = await runPreflight(
    baseInput({
      outputFiles: ['index.html', 'sw.js', 'assets/app.js'],
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  const blocker = report.blockers.find((f) => f.rule === 'service-worker-ownership');
  assert.ok(blocker);
  assert.match(blocker!.title, /service worker/i);
});

test('preflight blocks empty output', async () => {
  const report = await runPreflight(
    baseInput({
      outputFiles: [],
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'entry-file-present'));
});

test('preflight blocks output without index.html for type=app', async () => {
  const report = await runPreflight(
    baseInput({
      outputFiles: ['assets/main.js', 'assets/main.css'],
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'entry-file-present'));
});

test('preflight allows type=website without index.html', async () => {
  const report = await runPreflight(
    baseInput({
      manifest: baseManifest({ type: 'website' }),
      outputFiles: ['README.md', 'assets/style.css'],
    }),
    defaultRules,
  );
  assert.equal(report.passed, true);
});

test('preflight warns on 150MB output', async () => {
  const report = await runPreflight(
    baseInput({
      outputBytes: 150 * 1024 * 1024,
    }),
    defaultRules,
  );
  assert.equal(report.passed, true);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0]?.rule, 'output-size');
});

test('preflight blocks at 250MB output', async () => {
  const report = await runPreflight(
    baseInput({
      outputBytes: 250 * 1024 * 1024,
    }),
    defaultRules,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((f) => f.rule === 'output-size'));
});

test('preflight records auto-drafted shippie.json as a fix', async () => {
  const report = await runPreflight(
    baseInput({
      manifestSource: 'auto-drafted',
    }),
    defaultRules,
  );
  assert.equal(report.passed, true);
  // The shippie-json-present rule emits a 'fix' finding (not a remediation)
  assert.ok(
    report.findings.some((f) => f.rule === 'shippie-json-present' && f.severity === 'fix'),
  );
});
