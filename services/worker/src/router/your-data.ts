/**
 * /__shippie/data — standalone "Your Data" panel.
 *
 * Served by the Worker at the per-app subdomain (e.g.
 * `chiwit.shippie.app/__shippie/data`). Renders a self-contained HTML
 * page that reads OPFS / IndexedDB / Cache Storage directly via
 * client-side JS — no maker code involved.
 *
 * The point: if the maker's app crashes on load, the user can still
 * reach their data, export it, or wipe it. The wrapper's promise
 * outlasts the maker's bug.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const yourDataRouter = new Hono<AppBindings>();

yourDataRouter.get('/', (c) => {
  const slug = c.var.slug;
  return c.html(renderHtml(slug));
});

function renderHtml(slug: string): string {
  // Inline page; deliberately no external dependencies, no React, no
  // bundler. Everything client-side runs on web standards alone.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Your Data — ${escapeHtml(slug)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #FAF7EF;
      --fg: #14120F;
      --muted: #5C5751;
      --line: #E8DDC9;
      --accent: #E8603C;
      --danger: #B23A2B;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #14120F; --fg: #FAF7EF; --muted: #C4BAA8; --line: #2A2520; }
    }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
                 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
    main { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
    h1 { font-size: 28px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em; }
    p.subtitle { margin: 0 0 28px; color: var(--muted); font-size: 15px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;
         color: var(--muted); margin: 28px 0 10px; }
    section { padding: 16px 0; border-top: 1px solid var(--line); }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { height: 40px; padding: 0 16px; border-radius: 999px;
             border: 1px solid var(--fg); background: transparent;
             color: var(--fg); font-size: 14px; font-weight: 500; cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #14120F; }
    button.danger { color: var(--danger); border-color: var(--danger); }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px; color: var(--muted); margin: 0; white-space: pre-wrap; }
    .footer { margin-top: 40px; font-size: 12px; color: var(--muted); line-height: 1.6; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px;
           background: var(--line); color: var(--muted); font-size: 11px;
           font-family: ui-monospace, monospace; margin-left: 6px; }
  </style>
</head>
<body>
  <main>
    <h1>Your Data <span class="tag">${escapeHtml(slug)}</span></h1>
    <p class="subtitle">Everything on this device, only on this device. This page works even if the app is broken.</p>

    <section>
      <h2>Storage</h2>
      <pre id="stats">computing…</pre>
    </section>

    <section>
      <h2>Backup</h2>
      <div class="row">
        <button id="export">Download as encrypted file</button>
        <button id="import">Restore from file</button>
      </div>
    </section>

    <section>
      <h2>Danger zone</h2>
      <div class="row">
        <button class="danger" id="wipe">Delete everything from this device</button>
      </div>
    </section>

    <p class="footer">
      Shippie's promise: your data lives on this device, encrypted, under your control.
      The developer of this app can't see it. Shippie can't see it.
      Backups go to your own Drive — never ours.
    </p>
  </main>
  <script>
${CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}

const CLIENT_SCRIPT = `
(async function() {
  const fmt = (n) => {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };

  async function refreshStats() {
    const out = document.getElementById('stats');
    if (!out) return;
    try {
      const est = await navigator.storage.estimate();
      const used = fmt(est.usage || 0);
      const quota = fmt(est.quota || 0);
      out.textContent = used + ' used · ' + quota + ' quota';
    } catch (e) {
      out.textContent = 'unable to estimate (browser does not support storage.estimate)';
    }
  }

  async function wipe() {
    if (!confirm("Delete ALL data this app has stored on this device? You can't undo this.")) return;
    try {
      const dbs = await (indexedDB.databases ? indexedDB.databases() : []);
      for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const root = await navigator.storage.getDirectory().catch(() => null);
      if (root && typeof root.entries === 'function') {
        for await (const [name] of root.entries()) {
          await root.removeEntry(name, { recursive: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('wipe partial failure', e);
    }
    await refreshStats();
    alert('Done. Reload to start fresh.');
  }

  document.getElementById('export').addEventListener('click', () => {
    alert('Encrypted export wires up alongside the backup providers — coming soon. For now, your data is here, on this device, untouched.');
  });
  document.getElementById('import').addEventListener('click', () => {
    alert('Restore wires up alongside the backup providers — coming soon.');
  });
  document.getElementById('wipe').addEventListener('click', () => {
    void wipe();
  });

  await refreshStats();
})();
`;

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
