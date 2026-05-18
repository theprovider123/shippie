/**
 * /__shippie/data — standalone "Your Data" panel.
 * Ported from services/worker/src/router/your-data.ts.
 */
import type { WrapperContext } from '../env';

export function handleYourData(ctx: WrapperContext): Response {
  return new Response(renderHtml(ctx.slug), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function renderHtml(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Your Data — ${escapeHtml(slug)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #FAF7EF; --fg: #14120F; --muted: #5C5751;
      --line: #E8DDC9; --accent: #E8603C; --danger: #B23A2B;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #14120F; --fg: #FAF7EF; --muted: #C4BAA8; --line: #2A2520; }
    }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
                 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
    main { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
    h1 { font-size: 28px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em; }
    p.subtitle { margin: 0 0 24px; color: var(--muted); font-size: 15px; line-height: 1.5; }
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
    .sealed {
      margin: 0 0 20px;
      padding: 16px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--line) 22%, transparent);
    }
    .sealed h2 { margin-top: 0; }
    .sealed p { margin: 0 0 12px; color: var(--muted); line-height: 1.5; }
    .copy-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
    .copy-list li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
    .copy-dot { width: 8px; height: 8px; border-radius: 99px; background: #3E7D4D; box-shadow: 0 0 0 3px rgba(62,125,77,0.16); }
    .footer { margin-top: 40px; font-size: 12px; color: var(--muted); line-height: 1.6; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px;
           background: var(--line); color: var(--muted); font-size: 11px;
           font-family: ui-monospace, monospace; margin-left: 6px; }
    .status { margin: 14px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .status.success { color: #3E7D4D; }
    .status.warning { color: var(--danger); }
    .status[hidden] { display: none; }
  </style>
</head>
<body>
  <main>
    <h1>Your Data <span class="tag">${escapeHtml(slug)}</span></h1>
    <p class="subtitle">Saved privately, easy to move, recoverable when browsers forget. This page works even if the app is broken.</p>

    <section class="sealed">
      <h2>Private recovery</h2>
      <p>Shippie stores sealed copies for apps that use Private Sync. We can move and recover those copies, but we can't open what is inside.</p>
      <div class="row">
        <button class="primary" id="add-device">Add another device</button>
        <button id="move-phone">Move to new phone</button>
        <button id="recovery-card">Show recovery card</button>
        <button id="restore-data">Restore data</button>
      </div>
      <ul class="copy-list">
        <li><span class="copy-dot"></span><span>This device is the local copy for ${escapeHtml(slug)}.</span></li>
        <li><span class="copy-dot"></span><span>Device handover uses wrapped access only. Raw keys are not uploaded.</span></li>
      </ul>
    </section>

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
    <p class="status" id="status" role="status" aria-live="polite" hidden></p>

    <p class="footer">
      Shippie stores sealed copies. We can help recover them, but we can't open them.
      Technical sync details like size and timing may still be visible.
    </p>
  </main>
  <script src="/__shippie/sdk.js"></script>
  <script>
${clientScript(slug)}
  </script>
</body>
</html>`;
}

function clientScript(slug: string): string {
  return `
(async function() {
  const appSlug = ${JSON.stringify(slug)};
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

  function setStatus(message, state) {
    const out = document.getElementById('status');
    if (!out) return;
    out.textContent = message || '';
    out.className = 'status' + (state ? ' ' + state : '');
    out.hidden = !message;
  }

  async function wipe() {
    const button = document.getElementById('wipe');
    if (!button) return;
    const now = Date.now();
    const armedAt = Number(button.dataset.confirmDeleteAt || 0);
    if (!armedAt || now - armedAt > 8000) {
      button.dataset.confirmDeleteAt = String(now);
      button.textContent = 'Tap again to delete';
      setStatus("This deletes all data this app stored on this device. You can't undo it.", 'warning');
      window.setTimeout(() => {
        if (button.dataset.confirmDeleteAt === String(now)) {
          delete button.dataset.confirmDeleteAt;
          button.textContent = 'Delete everything from this device';
          setStatus('', '');
        }
      }, 8000);
      return;
    }

    delete button.dataset.confirmDeleteAt;
    button.disabled = true;
    button.textContent = 'Deleting...';
    setStatus('Deleting local data...', '');
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
    setStatus('Done. Reloading to start fresh...', 'success');
    window.setTimeout(() => window.location.reload(), 600);
  }

  document.getElementById('export').addEventListener('click', () => {
    setStatus('Encrypted export is coming soon. For now, your data stays here on this device.', '');
  });
  document.getElementById('import').addEventListener('click', () => {
    setStatus('Restore from file is coming soon.', '');
  });
  document.getElementById('add-device').addEventListener('click', () => {
    openInheritedPanel('add-device');
  });
  document.getElementById('move-phone').addEventListener('click', () => {
    openInheritedPanel('move-phone');
  });
  document.getElementById('recovery-card').addEventListener('click', () => {
    openInheritedPanel('recovery-card');
  });
  document.getElementById('restore-data').addEventListener('click', () => {
    openInheritedPanel('restore');
  });
  document.getElementById('wipe').addEventListener('click', () => {
    void wipe();
  });

  await refreshStats();

  function openInheritedPanel(action) {
    const api = window.shippie;
    if (api && typeof api.openYourData === 'function') {
      api.openYourData({
        appSlug,
        privateSync: {
          enabled: false,
          headline: 'Private sync is available.',
          detail: 'Open the app when you need app-specific sealed keys. This fallback still gives you the inherited recovery surface.',
          safeCopies: [{ label: 'This device', detail: 'Fallback data surface', status: 'ready' }],
          sealedCloud: 'setting-up',
        },
      });
      return;
    }
    const messages = {
      'add-device': 'Open the app, then Your Data, to start sealed device handover.',
      'move-phone': 'Open the app on the old phone, then Restore data on the new phone.',
      'recovery-card': 'Open the app to generate the app-specific recovery card.',
      restore: 'Open the app so this device can unwrap restored access locally.',
    };
    setStatus(messages[action] || 'Open the app to continue.', '');
  }
})();
`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
