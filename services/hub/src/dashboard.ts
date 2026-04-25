/**
 * Hub dashboard — `http://hub.local/`.
 *
 * Tells the network admin what's cached, who's connected, and how
 * much disk is in use. Static HTML + a couple of JSON endpoints; no
 * client framework, no build step.
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HubState } from './state.ts';

export interface DashboardOptions {
  cacheRoot: string;
  state: HubState;
}

export async function renderDashboard(opts: DashboardOptions): Promise<string> {
  const apps = await listCachedApps(opts.cacheRoot);
  const models = await listCachedModels(opts.cacheRoot);
  const rooms = opts.state.stats();
  const totalApps = apps.reduce((n, a) => n + a.bytes, 0);
  const totalModels = models.reduce((n, a) => n + a.bytes, 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shippie Hub</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           max-width: 720px; margin: 32px auto; padding: 0 20px; color: #14120F; background: #FAF7EF; }
    h1 { font-size: 24px; letter-spacing: -0.01em; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #5C5751; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { text-align: left; padding: 6px 0; border-bottom: 1px solid #E8DDC9; font-size: 14px; }
    .muted { color: #5C5751; font-size: 13px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Shippie Hub</h1>
  <p class="muted">Local mesh + model cache for this network. No data leaves this device unless the model cache is fetching from <code>ai.shippie.app</code>.</p>

  <h2>Connected rooms (${rooms.length})</h2>
  <table>
    <tr><th>Room id</th><th>Peers</th><th>Last activity</th></tr>
    ${
      rooms
        .map(
          (r) =>
            `<tr><td><code>${escapeHtml(r.roomId.slice(0, 12))}…</code></td><td>${r.peerCount}</td><td>${new Date(r.lastActivityMs).toLocaleString()}</td></tr>`,
        )
        .join('') ||
      '<tr><td colspan="3" class="muted">No active rooms.</td></tr>'
    }
  </table>

  <h2>Cached apps (${apps.length}) — ${formatBytes(totalApps)}</h2>
  <table>
    <tr><th>Slug</th><th>Versions</th><th>Size</th></tr>
    ${
      apps
        .map(
          (a) =>
            `<tr><td><code>${escapeHtml(a.slug)}</code></td><td>${a.versions}</td><td>${formatBytes(a.bytes)}</td></tr>`,
        )
        .join('') ||
      '<tr><td colspan="3" class="muted">No apps cached yet.</td></tr>'
    }
  </table>

  <h2>Cached models — ${formatBytes(totalModels)}</h2>
  <table>
    <tr><th>Path</th><th>Size</th></tr>
    ${
      models
        .slice(0, 50)
        .map(
          (m) =>
            `<tr><td><code>${escapeHtml(m.path)}</code></td><td>${formatBytes(m.bytes)}</td></tr>`,
        )
        .join('') ||
      '<tr><td colspan="2" class="muted">No models cached yet.</td></tr>'
    }
  </table>

  <h2>Privacy</h2>
  <p class="muted">
    The Hub stores nothing about user data. Signalling is in-memory and never inspected.
    The model cache stores only the same files the cloud serves at <code>ai.shippie.app/models/*</code>.
  </p>
</body>
</html>`;
}

interface AppEntry {
  slug: string;
  versions: number;
  bytes: number;
}

interface ModelEntry {
  path: string;
  bytes: number;
}

async function listCachedApps(cacheRoot: string): Promise<AppEntry[]> {
  const dir = join(cacheRoot, 'apps');
  if (!existsSync(dir)) return [];
  const slugs = await readdir(dir);
  const out: AppEntry[] = [];
  for (const slug of slugs) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    const slugDir = join(dir, slug);
    let versions = 0;
    let bytes = 0;
    try {
      const ents = await readdir(slugDir);
      versions = ents.length;
      for (const e of ents) {
        bytes += await dirSize(join(slugDir, e));
      }
    } catch {
      // unreadable; skip.
    }
    out.push({ slug, versions, bytes });
  }
  return out;
}

async function listCachedModels(cacheRoot: string): Promise<ModelEntry[]> {
  const dir = join(cacheRoot, 'models');
  if (!existsSync(dir)) return [];
  const out: ModelEntry[] = [];
  await walk(dir, dir, out);
  out.sort((a, b) => b.bytes - a.bytes);
  return out;
}

async function walk(root: string, cur: string, into: ModelEntry[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(cur);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(cur, e);
    let s;
    try {
      s = await stat(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      await walk(root, p, into);
    } else {
      into.push({ path: p.slice(root.length + 1), bytes: s.size });
    }
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  await walkSize(dir, (b) => {
    total += b;
  });
  return total;
}

async function walkSize(p: string, addBytes: (n: number) => void): Promise<void> {
  let s;
  try {
    s = await stat(p);
  } catch {
    return;
  }
  if (s.isFile()) {
    addBytes(s.size);
    return;
  }
  if (!s.isDirectory()) return;
  let entries: string[];
  try {
    entries = await readdir(p);
  } catch {
    return;
  }
  for (const e of entries) await walkSize(join(p, e), addBytes);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
