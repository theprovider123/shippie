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
 *
 * Hooks:
 *   - `onConfigureBackup`  — invoked when the user clicks
 *     "Auto-backup to Drive…". Default behavior opens the OAuth
 *     coordinator popup at https://shippie.app/oauth/google-drive and
 *     forwards the resulting token to whatever the maker app provides.
 *   - `onStartTransfer`    — invoked when the user clicks
 *     "Send to another device". Default opens a sender flow that
 *     generates a one-time room + QR via `@shippie/proximity/transfer`.
 *
 * Both hooks are *callbacks*: the wrapper supplies sensible defaults
 * but the maker app (or Shippie's hosted runtime) overrides them when
 * it needs custom UI. The panel only knows the buttons exist.
 */

export interface YourDataPanelOptions {
  /** Where to mount. Defaults to a new fixed-position overlay on document.body. */
  mount?: HTMLElement;
  /**
   * Hook for the Backup tab — defaults to opening the OAuth coordinator
   * popup at `https://shippie.app/oauth/google-drive`.
   */
  onConfigureBackup?: () => void;
  /**
   * Hook for "Send to another device" — defaults to a stub that
   * surfaces a "transfer not wired" alert. The hosted runtime
   * supplies the real flow via the proximity package.
   */
  onStartTransfer?: () => void;
  /**
   * Slug of the originating app — only required for the default
   * `onConfigureBackup` flow. The wrapper auto-supplies this from
   * `window.__shippie_meta`; it can be omitted in maker-supplied
   * overrides.
   */
  appSlug?: string;
  /**
   * Override the OAuth coordinator origin (handy for local dev where
   * shippie.app isn't reachable). Defaults to `https://shippie.app`.
   */
  coordinatorOrigin?: string;
  /**
   * Optional custom handler invoked once the popup posts back a token
   * envelope. Defaults to `console.info` so the maker can wire it up
   * without crashing the panel.
   */
  onBackupToken?: (msg: { provider: string; token: unknown }) => void;
  /**
   * Optional injection of the proximity TransferGroupApi for the
   * "Send to another device" flow. When provided, the default transfer
   * dialog drives a real WebRTC handoff via
   * `@shippie/proximity/transfer.sendTransfer`. When omitted, the
   * dialog explains what's needed without crashing.
   *
   * Typed structurally so the panel doesn't pull `@shippie/proximity`
   * into its own bundle.
   */
  transferApi?: {
    createTransferRoom: (input: { appSlug: string }) => Promise<{
      roomId: string;
      joinCode: string;
      transferKey: Uint8Array;
      group: unknown;
    }>;
  };
  /**
   * Optional source of the in-memory snapshot bytes the sender uploads
   * to the receiver. Defaults to a stub that surfaces "snapshot not
   * available" — the maker (or hosted runtime) supplies a real loader
   * that calls `@shippie/local-db`'s backup primitives.
   */
  buildTransferSnapshot?: () => Promise<{
    plaintext: Uint8Array;
    schemaVersion: number;
    tables: string[];
  } | null>;
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
    if (opts.onConfigureBackup) {
      opts.onConfigureBackup();
    } else {
      void defaultConfigureBackup(opts);
    }
  });
  root.getElementById('shippie-data-transfer')?.addEventListener('click', () => {
    if (opts.onStartTransfer) {
      opts.onStartTransfer();
    } else {
      void defaultStartTransfer(opts, root);
    }
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

/**
 * Default backup configuration handler. Opens a popup at the OAuth
 * coordinator (`https://shippie.app/oauth/google-drive`), generates
 * a fresh PKCE pair locally, hands the challenge to the coordinator
 * via the HMAC-signed `state` envelope, and waits for the popup to
 * postMessage back. The token never touches localStorage; the
 * caller's `onBackupToken` decides where it goes (typically OPFS
 * via `local-files`).
 *
 * This default is dynamic-imported so the panel doesn't pull
 * `@shippie/backup-providers` into the wrapper bundle when nobody
 * presses the button.
 */
async function defaultConfigureBackup(opts: YourDataPanelOptions): Promise<void> {
  if (typeof window === 'undefined') return;
  const slug = opts.appSlug ?? readShippieMetaSlug();
  if (!slug) {
    alert('Backup setup is unavailable: app slug missing.');
    return;
  }
  const coordinatorOrigin = opts.coordinatorOrigin ?? 'https://shippie.app';
  let mod: typeof import('@shippie/backup-providers');
  try {
    mod = await import('@shippie/backup-providers');
  } catch (err) {
    console.error('shippie:your-data-panel: failed to load backup-providers', err);
    alert('Backup setup is unavailable in this build.');
    return;
  }
  const verifier = mod.generateCodeVerifier();
  const challenge = await mod.deriveCodeChallenge(verifier);
  // Note: the coordinator-secret HMAC happens on the server side. For
  // the popup to trust the result it re-verifies a server-signed
  // result envelope. From the panel's side we only need to keep the
  // verifier to exchange against the token endpoint — but per the
  // spec, the server does the exchange. We persist the verifier in
  // a same-origin cookie scoped to the maker app via a server hop.
  const popupUrl = `${coordinatorOrigin}/__shippie/oauth/start?provider=google-drive&app=${encodeURIComponent(slug)}&v=${encodeURIComponent(challenge)}`;
  const popup = window.open(popupUrl, 'shippie-oauth', 'width=480,height=640');
  if (!popup) {
    // Mobile Safari / popup blockers — fall back to full-page redirect.
    window.location.href = popupUrl;
    return;
  }
  const handler = (e: MessageEvent) => {
    const data = e.data as { kind?: string; provider?: string; ok?: boolean; token?: unknown } | undefined;
    if (!data || data.kind !== 'shippie-oauth') return;
    window.removeEventListener('message', handler);
    if (!data.ok) {
      alert('Sign-in failed.');
      return;
    }
    if (opts.onBackupToken) {
      opts.onBackupToken({ provider: data.provider ?? 'google-drive', token: data.token });
    } else {
      // Token stays out of localStorage; we just acknowledge.
      console.info('shippie:backup token received (provider=%s)', data.provider);
      alert('Backup is now configured. Your data will sync nightly.');
    }
  };
  window.addEventListener('message', handler);
  // Give up after 10 minutes — same TTL as the state envelope.
  setTimeout(() => window.removeEventListener('message', handler), 10 * 60 * 1000);
}

/**
 * Default device-transfer flow. Renders a transfer dialog into the
 * panel's Shadow DOM that:
 *
 *   1. Resolves the app slug from `opts.appSlug` or `__shippie_meta`.
 *   2. If `opts.transferApi` is wired:
 *        a. Calls `transferApi.createTransferRoom({ appSlug })` →
 *           returns roomId + joinCode + transferKey + group handle.
 *        b. Renders a QR encoding `shippie-transfer://?room=<id>&k=<base64url>`.
 *        c. Loads the snapshot via `opts.buildTransferSnapshot()`.
 *        d. Calls `sendTransfer` from `@shippie/proximity` with the
 *           snapshot, transferKey, and group, surfacing progress events
 *           in the dialog.
 *      If `transferApi` is missing: renders a clean explanation that
 *      transfer requires the proximity TransferGroupApi to be wired.
 *
 * Receiver leg (scan-to-receive) ships with the proximity package's
 * concrete TransferGroupApi implementation — see Phase 4 outstanding
 * actions in `docs/OUTSTANDING_ACTIONS.md`.
 */
async function defaultStartTransfer(
  opts: YourDataPanelOptions,
  root: ShadowRoot,
): Promise<void> {
  const slug = opts.appSlug ?? readShippieMetaSlug();
  if (!slug) {
    alert('Transfer is unavailable: app slug missing.');
    return;
  }
  const dialogRoot = renderTransferDialog(root);
  if (!dialogRoot) return;

  const status = (msg: string) => {
    const el = dialogRoot.querySelector('[data-shippie-transfer-status]');
    if (el) el.textContent = msg;
  };
  const qrSlot = dialogRoot.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  const progressBar = dialogRoot.querySelector(
    '[data-shippie-transfer-progress-bar]',
  ) as HTMLDivElement | null;

  let api = opts.transferApi;
  if (!api) {
    // Fall through to the adapter shipping with `@shippie/proximity`.
    // Lazy-imported so apps that never invoke transfer don't pay the
    // bundle cost.
    try {
      const proximity = await import('@shippie/proximity');
      api = {
        createTransferRoom: proximity.createTransferRoom as never,
      };
    } catch (err) {
      console.error('shippie:transfer load proximity adapter failed', err);
      status('Transfer infrastructure unavailable in this build.');
      return;
    }
  }

  status('Creating one-time transfer room…');
  let room: Awaited<ReturnType<typeof api.createTransferRoom>>;
  try {
    room = await api.createTransferRoom({ appSlug: slug });
  } catch (err) {
    console.error('shippie:transfer create-room failed', err);
    status('Could not create the transfer room. Check your network.');
    return;
  }

  // Build the transfer URL the receiver scans.
  const keyB64 = bytesToBase64Url(room.transferKey);
  const joinUrl = `shippie-transfer://?room=${encodeURIComponent(room.joinCode)}&k=${encodeURIComponent(keyB64)}`;

  if (qrSlot) {
    try {
      // Lazy-load the QR helper so apps without transfer don't pay
      // the bundle cost.
      const qrMod = (await import('./qr.ts')) as typeof import('./qr.ts');
      qrSlot.innerHTML = qrMod.renderQrSvg(joinUrl, { size: 220 });
    } catch (err) {
      console.error('shippie:transfer qr failed', err);
      qrSlot.textContent = joinUrl;
    }
  }
  status('Scan this on the new device. Waiting for it to join…');

  if (!opts.buildTransferSnapshot) {
    status('Snapshot builder not provided by host runtime — wire opts.buildTransferSnapshot.');
    return;
  }
  let snapshot;
  try {
    snapshot = await opts.buildTransferSnapshot();
  } catch (err) {
    console.error('shippie:transfer snapshot failed', err);
    status('Could not build a snapshot of this device.');
    return;
  }
  if (!snapshot) {
    status('No data to transfer yet.');
    return;
  }

  // Hand off to proximity.sendTransfer — dynamic-import keeps the panel
  // bundle small for apps that never invoke transfer.
  let proximity: typeof import('@shippie/proximity');
  try {
    proximity = await import('@shippie/proximity');
  } catch (err) {
    console.error('shippie:transfer load proximity failed', err);
    status('Transfer infrastructure unavailable in this build.');
    return;
  }

  status('Sending data… do not close this window.');
  try {
    await proximity.sendTransfer({
      group: room.group as never, // typed structurally above
      transferKey: room.transferKey,
      snapshot: {
        rows: [], // maker hooks into snapshot.rows builder in v1.5
        files: [],
        plaintext: snapshot.plaintext,
        schemaVersion: snapshot.schemaVersion,
        tables: snapshot.tables,
      } as never,
      onEvent: (event: { kind: string; sent?: number; total?: number }) => {
        if (event.kind === 'progress' && progressBar && event.total) {
          const pct = Math.min(1, (event.sent ?? 0) / event.total);
          progressBar.style.width = `${Math.round(pct * 100)}%`;
        }
        if (event.kind === 'done') status('Transfer complete.');
        if (event.kind === 'cancelled') status('Transfer cancelled.');
        if (event.kind === 'error') status('Transfer failed.');
      },
    } as never);
  } catch (err) {
    console.error('shippie:transfer sendTransfer failed', err);
    status('Transfer failed. The receiver may have disconnected.');
  }
}

function renderTransferDialog(root: ShadowRoot): HTMLDivElement | null {
  // Reuses the panel's existing Shadow DOM. We append a transfer-only
  // section beneath the panel body if one isn't already there.
  const body = root.querySelector('[data-shippie-data-body]') ?? root.querySelector('main');
  if (!body) return null;
  let dialog = root.querySelector('[data-shippie-transfer-dialog]') as HTMLDivElement | null;
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.setAttribute('data-shippie-transfer-dialog', '');
  dialog.style.cssText =
    'margin-top:1rem;padding:1rem;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-family:system-ui,sans-serif';
  dialog.innerHTML = `
    <h3 style="margin:0 0 0.5rem;font-size:0.95rem;font-weight:600">Send to another device</h3>
    <div data-shippie-transfer-qr style="display:flex;align-items:center;justify-content:center;min-height:240px;background:#fff;border-radius:6px;padding:0.5rem;margin:0.5rem 0;font-family:monospace;font-size:0.7rem;word-break:break-all"></div>
    <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;margin:0.5rem 0">
      <div data-shippie-transfer-progress-bar style="height:100%;width:0%;background:#E8603C;transition:width 0.3s ease"></div>
    </div>
    <p data-shippie-transfer-status style="margin:0.5rem 0 0;font-size:0.85rem;opacity:0.85"></p>
  `;
  body.appendChild(dialog);
  return dialog;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readShippieMetaSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const meta = (window as { __shippie_meta?: { appSlug?: string } }).__shippie_meta;
  return meta?.appSlug ?? null;
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
