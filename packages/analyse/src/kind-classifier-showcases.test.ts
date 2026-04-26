/**
 * Showcase smoke test for the kind classifier. Runs the classifier
 * against the four real showcase apps' source trees and asserts the
 * expected labels. This is the Phase 1 exit criterion called out in
 * `docs/superpowers/plans/2026-04-26-app-kinds-rollout.md`.
 *
 * Expected labels (verified against HEAD on 2026-04-26):
 *   - showcase-recipe     → connected (Open Food Facts API)
 *   - showcase-journal    → local
 *   - showcase-whiteboard → connected (multi-peer via SignalRoom DO)
 *   - showcase-live-room  → connected (guest/host quiz via SignalRoom DO)
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyKind } from './kind-classifier.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

function loadSrcFiles(showcaseRoot: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const srcDir = join(showcaseRoot, 'src');

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') {
          continue;
        }
        walk(full);
      } else if (stat.isFile()) {
        const rel = relative(showcaseRoot, full);
        files.set(rel, readFileSync(full));
      }
    }
  }

  walk(srcDir);
  return files;
}

describe('kind-classifier showcase smoke', () => {
  test('showcase-recipe classifies as Connected (Open Food Facts API)', () => {
    const files = loadSrcFiles(join(REPO_ROOT, 'apps', 'showcase-recipe'));
    expect(files.size).toBeGreaterThan(0);
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(result.externalDomains).toContain('world.openfoodfacts.org');
    expect(result.backendProviders).toEqual([]);
  });

  test('showcase-journal classifies as Local', () => {
    const files = loadSrcFiles(join(REPO_ROOT, 'apps', 'showcase-journal'));
    expect(files.size).toBeGreaterThan(0);
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.backendProviders).toEqual([]);
  });

  test('showcase-whiteboard classifies as Connected (multi-peer)', () => {
    const files = loadSrcFiles(join(REPO_ROOT, 'apps', 'showcase-whiteboard'));
    expect(files.size).toBeGreaterThan(0);
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(result.backendProviders).toEqual([]);
    expect(
      result.reasons.some((r) => r.startsWith('multi-peer via Shippie')),
    ).toBe(true);
  });

  test('showcase-live-room classifies as Connected (multi-peer)', () => {
    const files = loadSrcFiles(join(REPO_ROOT, 'apps', 'showcase-live-room'));
    expect(files.size).toBeGreaterThan(0);
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(result.backendProviders).toEqual([]);
    expect(
      result.reasons.some((r) => r.startsWith('multi-peer via Shippie')),
    ).toBe(true);
  });
});
