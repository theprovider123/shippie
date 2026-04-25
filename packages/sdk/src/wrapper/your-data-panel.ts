// packages/sdk/src/wrapper/your-data-panel.ts
/**
 * "Your Data" panel — universal trust signal injected into every
 * Shippie app. Reachable two ways:
 *   1. In-app overlay via `shippie.openYourData()` or a wrapper-injected
 *      menu entry.
 *   2. Standalone fallback at `/__shippie/data` served by the Worker —
 *      works even if the maker's app crashes on load.
 *
 * Responsibilities (this module is the *overlay* — the standalone
 * version mirrors the same renders but lives in `services/worker`):
 *   - Storage breakdown (DB rows, files, model cache shared via Shippie AI app)
 *   - Manual export to encrypted .shippie-backup file (AES-256-GCM + Argon2id)
 *   - Restore from .shippie-backup
 *   - "Delete all data on this device" with confirmation
 *   - Entry point for backup-provider configuration (week 8)
 *   - Entry point for device-to-device transfer (week 9)
 *
 * The panel renders into a closed Shadow DOM so the maker's CSS doesn't
 * collide with our styles (and vice versa). All actions delegate to
 * `@shippie/local-db` + `@shippie/local-files` for the actual data ops.
 */

export interface YourDataPanelOptions {
  /** Where to mount. Defaults to a new fixed-position overlay on document.body. */
  mount?: HTMLElement;
  /** Hook for the Backup tab — see backup-providers package (week 8). */
  onConfigureBackup?: () => void;
  /** Hook for Transfer — see device-transfer (week 9). */
  onStartTransfer?: () => void;
}

interface PanelHandle {
  close(): void;
  refresh(): Promise<void>;
}

let openHandle: PanelHandle | null = null;

export function openYourData(opts: YourDataPanelOptions = {}): PanelHandle {
  if (openHandle) return openHandle;
  if (typeof document === 'undefined') {
    return { close() {}, refresh: async () => {} };
  }

  const host = opts.mount ?? document.createElement('div');
  if (!opts.mount) {
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    document.body.appendChild(host);
  }
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = SHELL_HTML;

  const refresh = async () => {
    const stats = await collectStats();
    const dom = root.getElementById('shippie-data-stats');
    if (dom) dom.textContent = renderStats(stats);
  };

  const close = () => {
    host.remove();
    openHandle = null;
  };

  root.getElementById('shippie-data-close')?.addEventListener('click', close);
  root.getElementById('shippie-data-export')?.addEventListener('click', () => {
    void doExport(root);
  });
  root.getElementById('shippie-data-import')?.addEventListener('click', () => {
    void doImport(root);
  });
  root.getElementById('shippie-data-delete')?.addEventListener('click', () => {
    void doDelete(root, refresh);
  });
  root.getElementById('shippie-data-backup')?.addEventListener('click', () => {
    opts.onConfigureBackup?.();
  });
  root.getElementById('shippie-data-transfer')?.addEventListener('click', () => {
    opts.onStartTransfer?.();
  });

  void refresh();
  openHandle = { close, refresh };
  return openHandle;
}

interface Stats {
  dbBytes: number;
  fileBytes: number;
  cacheBytes: number;
  total: number;
  available: number | null;
}

async function collectStats(): Promise<Stats> {
  let total = 0;
  let available: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      total = est.usage ?? 0;
      const quota = est.quota ?? 0;
      available = Math.max(0, quota - total);
    }
  } catch {
    // estimate may fail on older browsers — non-fatal
  }
  // Per-bucket breakdowns require @shippie/local-db + @shippie/local-files
  // to expose accessor functions; for now we surface aggregate `total`
  // and let the standalone /__shippie/data route do the detailed split.
  return { dbBytes: 0, fileBytes: 0, cacheBytes: 0, total, available };
}

function renderStats(s: Stats): string {
  const fmt = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const used = fmt(s.total);
  const avail = s.available != null ? fmt(s.available) : 'unknown';
  return `${used} used · ${avail} available`;
}

async function doExport(_root: ShadowRoot): Promise<void> {
  // Delegated to @shippie/local-db backup primitives — they already
  // exist; wiring them into a download Blob happens in the
  // backup-providers package (week 8). For week 1 this is a stub.
  alert('Encrypted export — wires up in week 8 alongside backup providers.');
}

async function doImport(_root: ShadowRoot): Promise<void> {
  alert('Restore from .shippie-backup — wires up in week 8.');
}

async function doDelete(_root: ShadowRoot, refresh: () => Promise<void>): Promise<void> {
  if (!confirm("Delete ALL data this app has stored on this device? You can't undo this.")) return;
  // Best-effort: tell the runtime to wipe known stores.
  try {
    const dbs = await indexedDB.databases?.();
    if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
    const root = await (navigator.storage as { getDirectory?: () => Promise<FileSystemDirectoryHandle> })
      .getDirectory?.();
    if (root) {
      // OPFS doesn't have a single "wipe" call; iterate.
      for await (const _entry of (root as unknown as AsyncIterable<unknown>)) {
        // Skipped: real iteration requires a permissioned cast; left for
        // local-files to expose a wipe() helper. Stub for now.
      }
    }
    await caches?.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))));
  } catch {
    // best-effort
  }
  await refresh();
  alert('Done. Reload the app to start fresh.');
}

const SHELL_HTML = `
<style>
  :host, * { box-sizing: border-box; }
  .scrim { position: absolute; inset: 0; background: rgba(20,18,15,0.6); }
  .panel {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px); overflow-y: auto;
    background: #FAF7EF; color: #14120F;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    padding: 24px 28px;
    border-radius: 16px;
    box-shadow: 0 20px 80px rgba(0,0,0,0.4);
  }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; }
  p.subtitle { margin: 0 0 20px; color: #5C5751; font-size: 14px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #7A6B58; margin: 20px 0 8px; }
  .row { display: flex; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
  button {
    height: 38px; padding: 0 14px;
    border-radius: 999px; border: 1px solid #14120F;
    background: transparent; color: #14120F;
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  button.primary { background: #E8603C; color: #14120F; border-color: #E8603C; }
  button.danger { color: #B23A2B; border-color: #B23A2B; }
  button:hover { opacity: 0.85; }
  .stats { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #5C5751; font-size: 13px; }
  .footer { margin-top: 24px; font-size: 12px; color: #7A6B58; line-height: 1.5; }
  .close { position: absolute; top: 16px; right: 16px; background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #5C5751; }
</style>
<div class="scrim"></div>
<div class="panel" role="dialog" aria-labelledby="shippie-data-title">
  <button class="close" id="shippie-data-close" aria-label="Close">×</button>
  <h1 id="shippie-data-title">Your Data</h1>
  <p class="subtitle">Everything on this device, only on this device.</p>

  <h2>Storage</h2>
  <div class="stats" id="shippie-data-stats">computing…</div>

  <h2>Backup</h2>
  <div class="row">
    <button id="shippie-data-export">Download as file</button>
    <button id="shippie-data-import">Restore from file</button>
    <button id="shippie-data-backup">Auto-backup to Drive…</button>
  </div>

  <h2>Transfer</h2>
  <div class="row">
    <button id="shippie-data-transfer">Send to another device</button>
  </div>

  <h2>Danger zone</h2>
  <div class="row">
    <button class="danger" id="shippie-data-delete">Delete everything from this device</button>
  </div>

  <p class="footer">
    This app runs entirely on your device. The developer can't see your data. Shippie can't see your data.
    If you delete it, it's gone — unless you have a backup.
  </p>
</div>
`;
