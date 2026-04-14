import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFramework } from './framework.ts';

test('detects Vite SPA with bun lockfile', () => {
  const result = detectFramework({
    files: ['package.json', 'vite.config.ts', 'bun.lockb', 'index.html'],
    packageJson: {
      scripts: { build: 'vite build' },
      devDependencies: { vite: '^5' },
    },
  });
  assert.equal(result.framework, 'vite');
  assert.equal(result.packageManager, 'bun');
  assert.equal(result.outputDir, 'dist');
  assert.equal(result.installCommand, 'bun install --frozen-lockfile --ignore-scripts');
  assert.equal(result.suggestedType, 'app');
});

test('detects Next.js static export', () => {
  const result = detectFramework({
    files: ['package.json', 'next.config.js', 'package-lock.json'],
    packageJson: {
      scripts: { build: 'next build' },
      dependencies: { next: '^16' },
    },
  });
  assert.equal(result.framework, 'next');
  assert.equal(result.outputDir, 'out');
  assert.equal(result.packageManager, 'npm');
});

test('detects Astro', () => {
  const result = detectFramework({
    files: ['package.json', 'astro.config.mjs', 'pnpm-lock.yaml'],
    packageJson: {
      scripts: { build: 'astro build' },
      devDependencies: { astro: '^4' },
    },
  });
  assert.equal(result.framework, 'astro');
  assert.equal(result.suggestedType, 'website');
  assert.equal(result.packageManager, 'pnpm');
});

test('detects SvelteKit', () => {
  const result = detectFramework({
    files: ['package.json', 'svelte.config.js', 'yarn.lock'],
    packageJson: {
      scripts: { build: 'vite build' },
      devDependencies: { '@sveltejs/kit': '^2' },
    },
  });
  assert.equal(result.framework, 'sveltekit');
  assert.equal(result.packageManager, 'yarn');
  assert.equal(result.outputDir, 'build');
});

test('detects Nuxt', () => {
  const result = detectFramework({
    files: ['package.json', 'nuxt.config.ts'],
    packageJson: {
      scripts: { generate: 'nuxt generate' },
      dependencies: { nuxt: '^3' },
    },
  });
  assert.equal(result.framework, 'nuxt');
  assert.equal(result.outputDir, '.output/public');
});

test('detects static HTML at root with no package.json', () => {
  const result = detectFramework({
    files: ['index.html', 'style.css', 'app.js'],
  });
  assert.equal(result.framework, 'static-html');
  assert.equal(result.suggestedType, 'website');
  assert.equal(result.outputDir, '.');
});

test('detects Jekyll', () => {
  const result = detectFramework({
    files: ['_config.yml', '_layouts/default.html', 'index.md'],
  });
  assert.equal(result.framework, 'jekyll');
  assert.equal(result.outputDir, '_site');
});

test('unknown Node project with build script gets generic handling + low confidence', () => {
  const result = detectFramework({
    files: ['package.json', 'webpack.config.js'],
    packageJson: { scripts: { build: 'webpack' } },
  });
  assert.equal(result.framework, 'unknown-node');
  assert.ok(result.confidence < 0.5);
  assert.ok(result.notes && result.notes.length > 0);
});

test('empty source tree falls through to static', () => {
  const result = detectFramework({ files: [] });
  assert.equal(result.framework, 'static');
  assert.ok(result.confidence < 0.5);
});
