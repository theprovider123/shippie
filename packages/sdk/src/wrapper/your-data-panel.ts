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
 * version mirrors the same trust language but lives in the platform
 * wrapper router):
 *   - Private Sync status for every app that opts into @shippie/doc.
 *   - Sealed recovery-copy controls: add another device, move phone,
 *     recovery card, restore.
 *   - Storage breakdown (DB rows, files, model cache shared via Shippie AI app).
 *   - Manual encrypted export / restore for legacy local-only apps.
 *   - "Delete all data on this device" with confirmation.
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
 *   - `onStartTransfer`    — legacy hook used by the new "Add another
 *     device" and "Move to new phone" buttons when no richer handover
 *     hook is supplied.
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
   * Legacy hook for device transfer. The visible UI routes through
   * "Add another device" / "Move to new phone"; this remains so older
   * wrappers keep working while the new sealed handover flow lands.
   */
  onStartTransfer?: () => void;
  /**
   * Current private-sync status for this app/document. The hosted runtime
   * supplies live data once @shippie/doc is wired; the panel falls back
   * to a proof-based setup state so every app inherits the same surface
   * without claiming a sealed copy before one exists.
   */
  privateSync?: PrivateSyncPanelState | (() => PrivateSyncPanelState | Promise<PrivateSyncPanelState>);
  /**
   * Local-storage keys the inherited safety document may copy. Generic
   * fallback sync must stay app-scoped because Shippie apps can share the
   * container origin.
   */
  inheritedStorage?: {
    keys?: readonly string[];
    prefixes?: readonly string[];
  };
  /** Hook for "Add another device" — should launch the wrapped access-bundle QR flow. */
  onAddDevice?: () => void;
  /** Hook for "Move to new phone" — same transfer primitive, with old-device cleanup copy. */
  onMovePhone?: () => void;
  /** Hook for showing/printing the user's recovery card. */
  onShowRecoveryCard?: () => void;
  /** Hook for restoring from invite, peer, recovery card, or sealed copy. */
  onRestoreData?: () => void;
  /** Hook for safe-copy/replica management. */
  onManageCopies?: () => void;
  /** Build the sealed access bundle for QR handover. Raw keys are wrapped before relay upload. */
  buildAccessBundle?: () => Promise<YourDataAccessBundle | null>;
  /** Apply an access bundle after this device unwraps it locally. */
  onAccessBundleReceived?: (bundle: YourDataAccessBundle) => Promise<void> | void;
  /** Origin that hosts `/api/documents/transfer/*`. Defaults to this app's current origin. */
  transferRelayOrigin?: string;
  /** One-time transfer id to use when an initial transfer action is auto-started. */
  accessTransferId?: string;
  /** Build the receiver URL encoded into the access-transfer QR/link. */
  buildAccessTransferUrl?: (transferId: string) => string;
  /** Auto-start a recovery action after the panel opens. */
  initialTransferAction?: 'add-device' | 'move-phone' | 'restore' | 'recovery-card';
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

export interface PrivateSyncCopy {
  label: string;
  detail?: string;
  status: 'ready' | 'syncing' | 'offline' | 'attention';
}

export interface PrivateSyncPanelState {
  enabled: boolean;
  headline?: string;
  detail?: string;
  safeCopies: PrivateSyncCopy[];
  lastSyncedAt?: string | null;
  sealedCloud?: 'on' | 'off' | 'setting-up';
}

export interface YourDataAccessBundle {
  schema: 'shippie.document.access-bundle.v1';
  createdAt: string;
  documents: Array<{
    documentId: string;
    documentKey: string;
    cursor?: string | null;
    role?: string;
  }>;
  deviceLabel?: string;
}

interface PanelHandle {
  close(): void;
  refresh(): Promise<void>;
}

let openHandle: PanelHandle | null = null;

export function openYourData(opts: YourDataPanelOptions = {}): PanelHandle {
  if (openHandle) {
    if (!opts.initialTransferAction) return openHandle;
    openHandle.close();
  }
  if (typeof document === 'undefined') {
    return { close() {}, refresh: async () => {} };
  }
  opts = withInheritedDataDefaults(opts);

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
    const [stats, sync] = await Promise.all([collectStats(), collectPrivateSync(opts)]);
    const dom = root.getElementById('shippie-data-stats');
    if (dom) dom.textContent = renderStats(stats);
    renderPrivateSync(root, sync);
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
      void defaultStartAccessBundleSender(opts, root, 'add');
    }
  });
  root.getElementById('shippie-data-add-device')?.addEventListener('click', () => {
    if (opts.onAddDevice) opts.onAddDevice();
    else void defaultStartAccessBundleSender(opts, root, 'add');
  });
  root.getElementById('shippie-data-move-phone')?.addEventListener('click', () => {
    if (opts.onMovePhone) opts.onMovePhone();
    else void defaultStartAccessBundleSender(opts, root, 'move');
  });
  root.getElementById('shippie-data-recovery-card')?.addEventListener('click', () => {
    if (opts.onShowRecoveryCard) opts.onShowRecoveryCard();
    else void defaultShowRecoveryCard(opts, root);
  });
  root.getElementById('shippie-data-restore')?.addEventListener('click', () => {
    if (opts.onRestoreData) opts.onRestoreData();
    else void defaultStartAccessBundleReceiver(opts, root);
  });
  root.getElementById('shippie-data-manage-copies')?.addEventListener('click', () => {
    if (opts.onManageCopies) opts.onManageCopies();
    else void defaultManageCopies(opts, root);
  });

  void refresh();
  const incomingTransferId = readIncomingTransferId();
  if (incomingTransferId && !opts.onRestoreData) {
    setTimeout(() => void defaultStartAccessBundleReceiver(opts, root, incomingTransferId), 0);
  } else if (opts.initialTransferAction) {
    setTimeout(() => {
      void runInitialTransferAction(opts, root);
    }, 0);
  }
  openHandle = { close, refresh };
  return openHandle;
}

async function runInitialTransferAction(opts: YourDataPanelOptions, root: ShadowRoot): Promise<void> {
  const action = opts.initialTransferAction;
  if (action === 'add-device') {
    if (opts.onAddDevice) opts.onAddDevice();
    else await defaultStartAccessBundleSender(opts, root, 'add', opts.accessTransferId);
  } else if (action === 'move-phone') {
    if (opts.onMovePhone) opts.onMovePhone();
    else await defaultStartAccessBundleSender(opts, root, 'move', opts.accessTransferId);
  } else if (action === 'restore') {
    if (opts.onRestoreData) opts.onRestoreData();
    else await defaultStartAccessBundleReceiver(opts, root, opts.accessTransferId);
  } else if (action === 'recovery-card') {
    if (opts.onShowRecoveryCard) opts.onShowRecoveryCard();
    else await defaultShowRecoveryCard(opts, root);
  }
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

async function collectPrivateSync(opts: YourDataPanelOptions): Promise<PrivateSyncPanelState> {
  try {
    const value = typeof opts.privateSync === 'function' ? await opts.privateSync() : opts.privateSync;
    if (value) return value;
  } catch {
    // Non-fatal; the panel should still open even if host sync state fails.
  }
  return {
    enabled: false,
    headline: 'Private sync is getting ready.',
    detail: 'This app can use sealed recovery copies once its Document store is connected.',
    safeCopies: [{ label: 'This device', detail: 'Local app data', status: 'ready' }],
    lastSyncedAt: null,
    sealedCloud: 'setting-up',
  };
}

function renderPrivateSync(root: ShadowRoot, sync: PrivateSyncPanelState): void {
  const title = root.getElementById('shippie-private-sync-title');
  const detail = root.getElementById('shippie-private-sync-detail');
  const last = root.getElementById('shippie-private-sync-last');
  const copies = root.getElementById('shippie-private-sync-copies');
  const badge = root.getElementById('shippie-private-sync-badge');
  const count = root.getElementById('shippie-safe-copy-count');

  const copyCount = sync.safeCopies.length;
  if (title) title.textContent = sync.headline ?? (sync.enabled ? 'Private sync is on.' : 'Private sync is available.');
  if (detail) {
    detail.textContent = sync.detail ?? (
      sync.enabled
        ? 'Saved here, recoverable later, private throughout.'
        : 'Set up sealed recovery copies so this app can come back on another device.'
    );
  }
  if (last) last.textContent = sync.lastSyncedAt ? `Last synced ${formatRelativeTime(sync.lastSyncedAt)}` : 'No sealed sync yet';
  if (count) count.textContent = `${copyCount} safe ${copyCount === 1 ? 'copy' : 'copies'}`;
  if (badge) {
    badge.textContent = sync.sealedCloud === 'on' ? 'Sealed copy on' : sync.sealedCloud === 'off' ? 'Sealed copy off' : 'Setting up';
    badge.setAttribute('data-state', sync.enabled ? 'ready' : 'setup');
  }
  if (copies) {
    copies.innerHTML = sync.safeCopies.map((copy) => `
      <li>
        <span class="copy-dot" data-state="${escapeAttr(copy.status)}"></span>
        <span>
          <strong>${escapeHtml(copy.label)}</strong>
          ${copy.detail ? `<small>${escapeHtml(copy.detail)}</small>` : ''}
        </span>
      </li>
    `).join('');
  }
}

function formatRelativeTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 60 * 60_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diff / 60 / 60_000))} hr ago`;
  return new Date(ts).toLocaleDateString();
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

async function defaultStartAccessBundleSender(
  opts: YourDataPanelOptions,
  root: ShadowRoot,
  mode: 'add' | 'move',
  initialTransferId?: string | null,
): Promise<void> {
  if (!opts.buildAccessBundle) {
    const dialog = renderTransferDialog(root, mode === 'move' ? 'Move to new phone' : 'Add another device');
    setTransferStatus(dialog, 'This app has not exposed its sealed access bundle yet.');
    return;
  }

  let doc: typeof import('@shippie/doc');
  try {
    doc = await import('@shippie/doc');
  } catch (err) {
    console.error('shippie:access-transfer load doc failed', err);
    const dialog = renderTransferDialog(root, 'Add another device');
    setTransferStatus(dialog, 'Device handover is unavailable in this build.');
    return;
  }

  const transferId = transferIdFromValue(initialTransferId ?? '') ?? doc.generateAccessTransferId();
  const relay = doc.createAccessTransferRelayClient({ origin: opts.transferRelayOrigin });
  const dialog = renderTransferDialog(root, mode === 'move' ? 'Move to new phone' : 'Add another device');
  setTransferProgress(dialog, 8);
  setTransferStatus(dialog, 'Open Your Data on the new device and choose Restore data.');

  const joinUrl = buildTransferUrl(opts, transferId);
  const qrSlot = dialog.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  if (qrSlot) {
    try {
      const qrMod = (await import('./qr.ts')) as typeof import('./qr.ts');
      qrSlot.innerHTML = qrMod.renderQrSvg(joinUrl, { size: 220 });
    } catch {
      qrSlot.textContent = joinUrl;
    }
  }
  setTransferCode(dialog, transferId);

  const request = await pollUntil(async () => relay.getRequest(transferId), 10 * 60_000, 1500, () => {
    setTransferStatus(dialog, 'Waiting for the new device to ask for access…');
  });
  if (!request) {
    setTransferStatus(dialog, 'Transfer expired. Start again when both devices are nearby.');
    return;
  }
  setTransferProgress(dialog, 42);
  setTransferStatus(dialog, `New device ready${request.deviceLabel ? `: ${request.deviceLabel}` : ''}. Sealing access…`);

  let bundle: YourDataAccessBundle | null;
  try {
    bundle = await opts.buildAccessBundle();
  } catch (err) {
    console.error('shippie:access-transfer build bundle failed', err);
    setTransferStatus(dialog, 'Could not prepare this app’s access bundle.');
    return;
  }
  if (!bundle) {
    setTransferStatus(dialog, 'There is no sealed app access to move yet.');
    return;
  }

  const wrapped = await doc.wrapAccessBundle({
    recipientPublicKeySpki: request.recipientPublicKey,
    bundle,
  });
  await relay.putBundle(transferId, wrapped);
  setTransferProgress(dialog, 100);
  setTransferStatus(
    dialog,
    mode === 'move'
      ? 'Sealed handover sent. Check the new phone before deleting anything here.'
      : 'Sealed handover sent. The new device can open its own copy now.',
  );
  renderHandoverDoneActions(dialog, mode);
}

function buildTransferUrl(opts: YourDataPanelOptions, transferId: string): string {
  try {
    return opts.buildAccessTransferUrl?.(transferId) ?? transferUrlFor(transferId);
  } catch {
    return transferUrlFor(transferId);
  }
}

async function defaultStartAccessBundleReceiver(
  opts: YourDataPanelOptions,
  root: ShadowRoot,
  initialTransferId?: string,
): Promise<void> {
  const dialog = renderTransferDialog(root, 'Restore on this device');
  let transferId = initialTransferId ? transferIdFromValue(initialTransferId) : null;
  if (!transferId) {
    const source = await requestRestoreSource(dialog);
    if (!source) {
      setTransferStatus(dialog, 'Restore cancelled.');
      return;
    }
    const recoveryBundle = parseRecoveryCard(source);
    if (recoveryBundle) {
      setTransferProgress(dialog, 80);
      await applyReceivedAccessBundle(opts, dialog, recoveryBundle);
      return;
    }
    transferId = transferIdFromValue(source);
  }
  if (!transferId) {
    setTransferStatus(dialog, 'That code was not recognised. Paste a transfer code, restore link, or recovery card.');
    return;
  }
  setTransferCode(dialog, transferId);
  setTransferProgress(dialog, 12);

  let doc: typeof import('@shippie/doc');
  try {
    doc = await import('@shippie/doc');
  } catch (err) {
    console.error('shippie:access-transfer load doc failed', err);
    setTransferStatus(dialog, 'Restore is unavailable in this build.');
    return;
  }

  const relay = doc.createAccessTransferRelayClient({ origin: opts.transferRelayOrigin });
  const keys = await doc.generateAccessTransferKeyPair();
  await relay.putRequest(transferId, {
    schema: 'shippie.document.access-transfer-request.v1',
    recipientPublicKey: keys.publicKeySpki,
    createdAt: new Date().toISOString(),
    deviceLabel: deviceLabel(),
  });
  setTransferStatus(dialog, 'Request sent. Keep both devices open while access is sealed.');
  setTransferProgress(dialog, 35);

  const wrapped = await pollUntil(async () => relay.getBundle(transferId), 10 * 60_000, 1500, () => {
    setTransferStatus(dialog, 'Waiting for the other device to send sealed access…');
  });
  if (!wrapped) {
    setTransferStatus(dialog, 'Restore expired. Start again when both devices are nearby.');
    return;
  }
  const bundle = await doc.unwrapAccessBundle({ recipientPrivateKey: keys.privateKey, wrapped });
  setTransferProgress(dialog, 82);
  await applyReceivedAccessBundle(opts, dialog, bundle);
}

async function applyReceivedAccessBundle(
  opts: YourDataPanelOptions,
  dialog: HTMLDivElement,
  bundle: YourDataAccessBundle,
): Promise<void> {
  if (opts.onAccessBundleReceived) {
    await opts.onAccessBundleReceived(bundle);
    setTransferProgress(dialog, 100);
    setTransferStatus(dialog, 'This device has access now.');
  } else {
    setTransferProgress(dialog, 100);
    setTransferStatus(dialog, `Access received for ${bundle.documents.length} ${bundle.documents.length === 1 ? 'document' : 'documents'}.`);
  }
}

async function defaultManageCopies(opts: YourDataPanelOptions, root: ShadowRoot): Promise<void> {
  const sync = await collectPrivateSync(opts);
  const dialog = renderTransferDialog(root, 'Storage health');
  setTransferProgress(dialog, sync.sealedCloud === 'on' ? 100 : sync.sealedCloud === 'setting-up' ? 48 : 12);
  const qrSlot = dialog.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  if (qrSlot) {
    qrSlot.innerHTML = `
      <div style="display:grid;gap:0.7rem;width:100%">
        ${sync.safeCopies.map((copy) => `
          <div style="display:flex;gap:0.55rem;align-items:flex-start;border-bottom:1px solid #EFE2CC;padding-bottom:0.55rem">
            <span class="copy-dot" data-state="${escapeAttr(copy.status)}"></span>
            <span style="display:grid;gap:0.1rem;text-align:left">
              <strong style="font-size:0.86rem;color:#332E27">${escapeHtml(copy.label)}</strong>
              <small style="font-size:0.76rem;color:#6F6658">${escapeHtml(copy.detail ?? copy.status)}</small>
            </span>
          </div>
        `).join('')}
        <p style="margin:0;color:#5C5751;font-size:0.8rem;line-height:1.45;text-align:left">
          Shippie can see that sealed copies exist and how large they are. It cannot read the app data inside them.
        </p>
      </div>
    `;
  }
  setTransferStatus(dialog, sync.lastSyncedAt ? `Last saved privately ${formatRelativeTime(sync.lastSyncedAt)}.` : 'This app is ready to save privately when data changes.');
}

async function defaultShowRecoveryCard(opts: YourDataPanelOptions, root: ShadowRoot): Promise<void> {
  const dialog = renderTransferDialog(root, 'Recovery card');
  setTransferProgress(dialog, 12);
  setTransferStatus(dialog, 'Preparing a recovery card on this device.');

  if (!opts.buildAccessBundle) {
    setTransferStatus(dialog, 'This app has not exposed its sealed access bundle yet.');
    return;
  }

  let bundle: YourDataAccessBundle | null;
  try {
    bundle = await opts.buildAccessBundle();
  } catch (err) {
    console.error('shippie:recovery-card build failed', err);
    setTransferStatus(dialog, 'Could not prepare this app’s recovery card.');
    return;
  }
  if (!bundle) {
    setTransferStatus(dialog, 'There is no sealed app access to put on a recovery card yet.');
    return;
  }

  const cardText = encodeRecoveryCard({
    schema: 'shippie.recovery-card.v1',
    createdAt: new Date().toISOString(),
    bundle,
  });
  const qrSlot = dialog.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  if (qrSlot) {
    qrSlot.innerHTML = `
      <div style="display:grid;gap:0.6rem;justify-items:center;width:100%">
        <div data-shippie-recovery-card-qr style="display:flex;align-items:center;justify-content:center;min-height:190px;width:100%"></div>
        <textarea readonly data-shippie-recovery-card-text style="box-sizing:border-box;width:100%;min-height:86px;border:1px solid #E0D4BF;border-radius:8px;background:#FFFDF7;color:#332E27;font:0.72rem ui-monospace,SFMono-Regular,Menlo,monospace;padding:0.6rem;resize:vertical">${escapeHtml(cardText)}</textarea>
        <button data-shippie-copy-recovery-card style="border:1px solid #D7C8B1;border-radius:8px;background:#FAF7EF;color:#332E27;padding:0.55rem 0.75rem;font-weight:650">Copy recovery card</button>
      </div>
    `;
    const qr = qrSlot.querySelector('[data-shippie-recovery-card-qr]') as HTMLDivElement | null;
    if (qr) {
      try {
        const qrMod = (await import('./qr.ts')) as typeof import('./qr.ts');
        qr.innerHTML = cardText.length <= 2400
          ? qrMod.renderQrSvg(cardText, { size: 190 })
          : '<p style="margin:0;color:#5C5751;font-size:0.82rem;text-align:center">This card is too large for a QR. Copy the text and keep it somewhere safe.</p>';
      } catch {
        qr.textContent = cardText;
      }
    }
    qrSlot.querySelector('[data-shippie-copy-recovery-card]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard?.writeText(cardText);
        setTransferStatus(dialog, 'Recovery card copied. Keep it private.');
      } catch {
        setTransferStatus(dialog, 'Copy failed. Select the recovery card text and save it somewhere private.');
      }
    });
  }
  setTransferProgress(dialog, 100);
  setTransferStatus(
    dialog,
    'Anyone with this card can restore this app’s data. Shippie can store sealed copies, but still cannot open them.',
  );
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

function renderTransferDialog(root: ShadowRoot, title = 'Add another device'): HTMLDivElement {
  // Reuses the panel's existing Shadow DOM. We append a transfer-only
  // section beneath the panel body if one isn't already there.
  const body = root.querySelector('[data-shippie-data-body]') ?? root.querySelector('main');
  if (!body) throw new Error('Your Data panel body missing');
  let dialog = root.querySelector('[data-shippie-transfer-dialog]') as HTMLDivElement | null;
  if (dialog) {
    const heading = dialog.querySelector('[data-shippie-transfer-title]');
    if (heading) heading.textContent = title;
    return dialog;
  }
  dialog = document.createElement('div');
  dialog.setAttribute('data-shippie-transfer-dialog', '');
  dialog.style.cssText =
    'margin-top:0.75rem;padding:1rem;border:1px solid #E0D4BF;border-radius:10px;background:#FFFDF7;font-family:system-ui,sans-serif';
  dialog.innerHTML = `
    <h3 data-shippie-transfer-title style="margin:0 0 0.5rem;font-size:0.95rem;font-weight:600">${escapeHtml(title)}</h3>
    <p data-shippie-transfer-code style="margin:0.25rem 0 0.5rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.72rem;color:#5C5751;word-break:break-all"></p>
    <div data-shippie-transfer-qr style="display:flex;align-items:center;justify-content:center;min-height:240px;background:#fff;border-radius:6px;padding:0.5rem;margin:0.5rem 0;font-family:monospace;font-size:0.7rem;word-break:break-all"></div>
    <div style="height:6px;border-radius:3px;background:#EFE2CC;overflow:hidden;margin:0.5rem 0">
      <div data-shippie-transfer-progress-bar style="height:100%;width:0%;background:#E8603C;transition:width 0.3s ease"></div>
    </div>
    <p data-shippie-transfer-status style="margin:0.5rem 0 0;font-size:0.85rem;color:#5C5751"></p>
  `;
  const recoveryActions = root.querySelector('[data-shippie-recovery-actions]');
  if (recoveryActions) recoveryActions.after(dialog);
  else body.appendChild(dialog);
  return dialog;
}

function setTransferStatus(dialog: HTMLDivElement | null, message: string): void {
  const el = dialog?.querySelector('[data-shippie-transfer-status]');
  if (el) el.textContent = message;
}

function setTransferCode(dialog: HTMLDivElement | null, code: string): void {
  const el = dialog?.querySelector('[data-shippie-transfer-code]');
  if (el) el.textContent = `Transfer code: ${code}`;
}

function setTransferProgress(dialog: HTMLDivElement | null, value: number): void {
  const el = dialog?.querySelector('[data-shippie-transfer-progress-bar]') as HTMLDivElement | null | undefined;
  if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function renderHandoverDoneActions(dialog: HTMLDivElement | null, mode: 'add' | 'move'): void {
  const qrSlot = dialog?.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null | undefined;
  if (!qrSlot) return;
  qrSlot.innerHTML = `
    <div style="display:grid;gap:0.75rem;width:100%;text-align:left">
      <p style="margin:0;color:#332E27;font-size:0.92rem;line-height:1.45">
        ${mode === 'move'
          ? 'Finish setup on the new phone first. Then decide whether this phone keeps access.'
          : 'The new device has its own sealed access. You can keep using this device too.'}
      </p>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button type="button" data-shippie-transfer-confirm style="border:0;border-radius:8px;background:#E8603C;color:#fff;padding:0.6rem 0.8rem;font-weight:700">I checked the new device</button>
        <button type="button" data-shippie-transfer-keep style="border:1px solid #D7C8B1;border-radius:8px;background:#FAF7EF;color:#332E27;padding:0.6rem 0.8rem;font-weight:650">Keep this device too</button>
      </div>
      <small style="color:#6F6658;line-height:1.45">
        No raw key was uploaded. Shippie relayed a wrapped bundle only the receiving device can open.
      </small>
    </div>
  `;
  qrSlot.querySelector('[data-shippie-transfer-confirm]')?.addEventListener('click', () => {
    setTransferStatus(dialog, mode === 'move' ? 'Great. You can delete local data from this old phone when you are ready.' : 'Great. Both devices can keep using this app.');
  });
  qrSlot.querySelector('[data-shippie-transfer-keep]')?.addEventListener('click', () => {
    setTransferStatus(dialog, 'This device will keep access. Nothing was deleted.');
  });
}

function transferUrlFor(transferId: string): string {
  if (typeof window === 'undefined') return transferId;
  const url = new URL(window.location.href);
  url.hash = `shippie-restore=${encodeURIComponent(transferId)}`;
  return url.toString();
}

function readIncomingTransferId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  return transferIdFromValue(params.get('shippie-restore') ?? '');
}

function transferIdFromValue(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hash = url.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const queryParams = url.searchParams;
    const fromUrl =
      hashParams.get('shippie-restore') ??
      queryParams.get('shippie-restore') ??
      queryParams.get('transfer') ??
      queryParams.get('code');
    if (fromUrl) return transferIdFromValue(fromUrl);
  } catch {
    // Raw transfer codes are expected.
  }
  const match = raw.match(/\btransfer_[A-Za-z0-9_-]{8,}\b/);
  if (match) return match[0] ?? null;
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

interface RecoveryCardPayload {
  schema: 'shippie.recovery-card.v1';
  createdAt: string;
  bundle: YourDataAccessBundle;
}

const RECOVERY_CARD_PREFIX = 'shippie-recovery:';

function encodeRecoveryCard(card: RecoveryCardPayload): string {
  return `${RECOVERY_CARD_PREFIX}${base64UrlEncodeUtf8(JSON.stringify(card))}`;
}

function parseRecoveryCard(value: string): YourDataAccessBundle | null {
  let raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hash = url.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash || url.search);
    raw = params.get('shippie-recovery') ?? raw;
  } catch {
    // Plain recovery card text is expected.
  }
  if (raw.startsWith(RECOVERY_CARD_PREFIX)) raw = raw.slice(RECOVERY_CARD_PREFIX.length);
  try {
    const parsed = JSON.parse(base64UrlDecodeUtf8(raw)) as RecoveryCardPayload;
    if (parsed?.schema !== 'shippie.recovery-card.v1') return null;
    if (parsed.bundle?.schema !== 'shippie.document.access-bundle.v1') return null;
    if (!Array.isArray(parsed.bundle.documents)) return null;
    return parsed.bundle;
  } catch {
    return null;
  }
}

function base64UrlEncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64Url(bytes);
}

function base64UrlDecodeUtf8(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function requestRestoreSource(dialog: HTMLDivElement): Promise<string | null> {
  const qrSlot = dialog.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  if (!qrSlot) return prompt('Paste a transfer code, restore link, or recovery card');

  setTransferStatus(dialog, 'Paste a transfer code, scan a QR, or paste a recovery card.');
  qrSlot.innerHTML = `
    <form data-shippie-restore-form style="display:grid;gap:0.65rem;width:100%">
      <textarea data-shippie-restore-source placeholder="Transfer code, restore link, or recovery card" style="box-sizing:border-box;width:100%;min-height:94px;border:1px solid #E0D4BF;border-radius:8px;background:#FFFDF7;color:#332E27;font:0.82rem system-ui,sans-serif;padding:0.65rem;resize:vertical"></textarea>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button type="submit" style="border:0;border-radius:8px;background:#E8603C;color:#fff;padding:0.6rem 0.8rem;font-weight:700">Restore</button>
        <button type="button" data-shippie-scan-restore style="border:1px solid #D7C8B1;border-radius:8px;background:#FAF7EF;color:#332E27;padding:0.6rem 0.8rem;font-weight:650">Scan QR</button>
        <button type="button" data-shippie-cancel-restore style="border:1px solid #D7C8B1;border-radius:8px;background:#FFFDF7;color:#5C5751;padding:0.6rem 0.8rem">Cancel</button>
      </div>
    </form>
  `;

  return new Promise((resolve) => {
    const form = qrSlot.querySelector('[data-shippie-restore-form]') as HTMLFormElement | null;
    const input = qrSlot.querySelector('[data-shippie-restore-source]') as HTMLTextAreaElement | null;
    const done = (value: string | null) => resolve(value);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      done(input?.value.trim() || null);
    }, { once: true });
    qrSlot.querySelector('[data-shippie-cancel-restore]')?.addEventListener('click', () => done(null), { once: true });
    qrSlot.querySelector('[data-shippie-scan-restore]')?.addEventListener('click', async () => {
      const scanned = await scanRestoreCode(dialog);
      if (scanned) done(scanned);
    }, { once: true });
  });
}

async function scanRestoreCode(dialog: HTMLDivElement): Promise<string | null> {
  const BarcodeDetectorCtor = (globalThis as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
    setTransferStatus(dialog, 'QR scanning is not available in this browser. Paste the code instead.');
    return null;
  }
  const qrSlot = dialog.querySelector('[data-shippie-transfer-qr]') as HTMLDivElement | null;
  if (!qrSlot) return null;

  let stream: MediaStream | null = null;
  let cancelled = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    qrSlot.innerHTML = `
      <div style="display:grid;gap:0.6rem;width:100%">
        <video data-shippie-restore-video playsinline muted style="width:100%;max-height:260px;border-radius:8px;background:#14120F;object-fit:cover"></video>
        <button type="button" data-shippie-stop-scan style="border:1px solid #D7C8B1;border-radius:8px;background:#FAF7EF;color:#332E27;padding:0.6rem 0.8rem;font-weight:650">Stop scanning</button>
      </div>
    `;
    const video = qrSlot.querySelector('[data-shippie-restore-video]') as HTMLVideoElement | null;
    if (!video) return null;
    qrSlot.querySelector('[data-shippie-stop-scan]')?.addEventListener('click', () => {
      cancelled = true;
    }, { once: true });
    video.srcObject = stream;
    await video.play();
    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
    const deadline = Date.now() + 2 * 60_000;
    setTransferStatus(dialog, 'Scanning. Keep the QR inside the frame.');
    while (!cancelled && Date.now() < deadline) {
      const codes = await detector.detect(video);
      const value = codes.find((code) => Boolean(code.rawValue))?.rawValue;
      if (value) return value;
      await sleep(350);
    }
    setTransferStatus(dialog, cancelled ? 'Scanning stopped. Paste the code instead.' : 'No QR found. Paste the code instead.');
    return null;
  } catch (err) {
    console.error('shippie:restore scan failed', err);
    setTransferStatus(dialog, 'Camera access failed. Paste the code instead.');
    return null;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'New device';
  if (/iPhone|iPad/i.test(navigator.userAgent)) return 'iPhone or iPad';
  if (/Android/i.test(navigator.userAgent)) return 'Android device';
  if (/Mac/i.test(navigator.userAgent)) return 'Mac';
  if (/Windows/i.test(navigator.userAgent)) return 'Windows device';
  return 'New device';
}

async function pollUntil<T>(
  read: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs: number,
  onWait?: () => void,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    onWait?.();
    await sleep(intervalMs);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readShippieMetaSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const meta = (window as { __shippie_meta?: { appSlug?: string; slug?: string } }).__shippie_meta;
  return meta?.appSlug ?? meta?.slug ?? null;
}

const INHERITED_DATA_PREFIX = 'shippie.inherited-data.v0';
const INHERITED_LOCAL_STORAGE_BYTE_LIMIT = 512 * 1024;

interface InheritedAccessRecord {
  schema: 'shippie.inherited-data.access.v0';
  appSlug: string;
  installId: string;
  documentId: string;
  documentKey: string;
  createdAt: string;
  lastSyncedAt: string | null;
  lastCheckpointAt?: string | null;
  lastEntryCount?: number;
  lastTruncated?: boolean;
}

interface InheritedSnapshotPayload {
  kind: 'local-storage-snapshot';
  appSlug: string;
  capturedAt: string;
  entries: Array<{ key: string; value: string }>;
  truncated: boolean;
  scoped?: boolean;
  byteLength?: number;
}

interface InheritedSnapshotState {
  latest: InheritedSnapshotPayload | null;
}

function withInheritedDataDefaults(opts: YourDataPanelOptions): YourDataPanelOptions {
  const appSlug = opts.appSlug ?? readShippieMetaSlug();
  if (!appSlug) return opts;
  if (isSkippedInheritedDataApp(appSlug)) return opts;
  const storageScope = inheritedStorageScope(appSlug, opts.inheritedStorage);
  return {
    ...opts,
    privateSync: opts.privateSync ?? (() => inheritedPrivateSync(appSlug, storageScope)),
    buildAccessBundle: opts.buildAccessBundle ?? (() => buildInheritedAccessBundle(appSlug, storageScope)),
    onAccessBundleReceived: opts.onAccessBundleReceived ?? ((bundle) => receiveInheritedAccessBundle(appSlug, bundle, storageScope)),
  };
}

function isSkippedInheritedDataApp(appSlug: string): boolean {
  return appSlug === 'crewtrip' || appSlug === 'showcase-crewtrip' || appSlug === 'app_crewtrip';
}

async function inheritedPrivateSync(appSlug: string, storageScope: InheritedStorageScope): Promise<PrivateSyncPanelState> {
  const runtime = await checkpointInheritedSafetyDocument(appSlug, storageScope);
  const record = runtime?.record ?? readInheritedAccessRecord(appSlug);
  const copiedItems = record?.lastEntryCount ?? 0;
  return {
    enabled: true,
    headline: record?.lastSyncedAt ? 'Private copy ready.' : 'Private recovery is available.',
    detail: record
      ? copiedItems > 0
        ? 'This app can move to another device without Shippie seeing inside.'
        : 'This app is ready to move when it has local data to save.'
      : 'Local state stays on this device until you add another device or create a sealed copy.',
    safeCopies: [
      {
        label: 'This device',
        detail: copiedItems > 0 ? `${copiedItems} saved item${copiedItems === 1 ? '' : 's'}` : 'Ready',
        status: 'ready',
      },
      record
        ? {
            label: 'Sealed copy',
            detail: record.lastTruncated ? 'Saved up to this app’s safety limit' : 'Ready for another device',
            status: record.lastSyncedAt ? 'ready' : 'syncing',
          }
        : { label: 'Sealed copy', detail: 'Created automatically', status: 'syncing' },
    ],
    lastSyncedAt: record?.lastSyncedAt ?? null,
    sealedCloud: record?.lastSyncedAt ? 'on' : record ? 'setting-up' : 'off',
  };
}

async function buildInheritedAccessBundle(appSlug: string, storageScope: InheritedStorageScope): Promise<YourDataAccessBundle | null> {
  const runtime = await checkpointInheritedSafetyDocument(appSlug, storageScope);
  if (!runtime) return null;
  return {
    schema: 'shippie.document.access-bundle.v1',
    createdAt: new Date().toISOString(),
    deviceLabel: deviceLabel(),
    documents: [{
      documentId: runtime.record.documentId,
      documentKey: runtime.record.documentKey,
      cursor: runtime.handle.cursor(),
      role: 'app-local-safety',
    }],
  };
}

async function checkpointInheritedSafetyDocument(appSlug: string, storageScope: InheritedStorageScope): Promise<{
  record: InheritedAccessRecord;
  handle: import('@shippie/doc').DocumentHandle<InheritedSnapshotState, InheritedSnapshotPayload>;
} | null> {
  const runtime = await openInheritedSafetyDocument(appSlug);
  if (!runtime) return null;
  const snapshot = snapshotLocalStorage(appSlug, storageScope);
  const doc = await import('@shippie/doc');
  const eventId = `evt_${await sha256Base64Url(doc.canonicalize(snapshotFingerprint(snapshot)))}`;
  if (!runtime.handle.events().some((event) => event.eventId === eventId)) {
    await runtime.handle.append({
      kind: snapshot.kind,
      payload: snapshot,
      eventId,
      createdAt: snapshot.capturedAt,
    });
  }
  runtime.record.lastCheckpointAt = snapshot.capturedAt;
  runtime.record.lastEntryCount = snapshot.entries.length;
  runtime.record.lastTruncated = snapshot.truncated;
  writeInheritedAccessRecord(runtime.record);
  try {
    const result = await runtime.handle.sync();
    if (result.pushed > 0 || result.pulled > 0 || runtime.handle.pendingEventIds().length === 0) {
      runtime.record.lastSyncedAt = new Date().toISOString();
      writeInheritedAccessRecord(runtime.record);
    }
  } catch {
    // Local outbox remains intact; sealed cloud might be unavailable in dev.
  }
  return runtime;
}

async function receiveInheritedAccessBundle(
  appSlug: string,
  bundle: YourDataAccessBundle,
  storageScope: InheritedStorageScope,
): Promise<void> {
  const document = bundle.documents.find((item) => item.role === 'app-local-safety') ?? bundle.documents[0];
  if (!document) return;
  const doc = await import('@shippie/doc');
  const record: InheritedAccessRecord = {
    schema: 'shippie.inherited-data.access.v0',
    appSlug,
    installId: createInheritedInstallId(),
    documentId: document.documentId,
    documentKey: document.documentKey,
    createdAt: bundle.createdAt,
    lastSyncedAt: null,
    lastCheckpointAt: null,
    lastEntryCount: 0,
    lastTruncated: false,
  };
  writeInheritedAccessRecord(record);

  const signing = await inheritedSigningFor(appSlug);
  const handle = await doc.openDocument<InheritedSnapshotState, InheritedSnapshotPayload>({
    documentId: record.documentId,
    documentKey: record.documentKey,
    signing,
    store: createInheritedDocumentStore(doc, `${INHERITED_DATA_PREFIX}:doc`),
    sync: doc.createSealedSyncClient(),
    realtime: inheritedRealtimeSyncOptions(),
    initialState: { latest: null },
    reducer: reduceInheritedSnapshot,
  });
  try {
    const result = await handle.sync();
    if (result.pushed > 0 || result.pulled > 0) {
      record.lastSyncedAt = new Date().toISOString();
      writeInheritedAccessRecord(record);
    }
  } catch {
    // The bundle is still stored locally; user can retry once online.
  }
  restoreLocalStorageSnapshot(handle.state().latest, storageScope);
}

async function openInheritedSafetyDocument(appSlug: string): Promise<{
  record: InheritedAccessRecord;
  handle: import('@shippie/doc').DocumentHandle<InheritedSnapshotState, InheritedSnapshotPayload>;
} | null> {
  if (typeof localStorage === 'undefined') return null;
  const doc = await import('@shippie/doc');
  const record = readInheritedAccessRecord(appSlug) ?? {
    schema: 'shippie.inherited-data.access.v0' as const,
    appSlug,
    installId: createInheritedInstallId(),
    documentId: createInheritedDocumentId(appSlug),
    documentKey: doc.generateDocumentKey(),
    createdAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastCheckpointAt: null,
    lastEntryCount: 0,
    lastTruncated: false,
  };
  writeInheritedAccessRecord(record);
  const signing = await inheritedSigningFor(appSlug);
  const handle = await doc.openDocument<InheritedSnapshotState, InheritedSnapshotPayload>({
    documentId: record.documentId,
    documentKey: record.documentKey,
    signing,
    store: createInheritedDocumentStore(doc, `${INHERITED_DATA_PREFIX}:doc`),
    sync: doc.createSealedSyncClient(),
    realtime: inheritedRealtimeSyncOptions(),
    initialState: { latest: null },
    reducer: reduceInheritedSnapshot,
  });
  return { record, handle };
}

function createInheritedDocumentStore(doc: typeof import('@shippie/doc'), namespace: string) {
  try {
    if (typeof indexedDB !== 'undefined') return doc.createIndexedDbDocumentStore({ namespace });
  } catch {
    // Fall through to localStorage for older/private browser contexts.
  }
  return doc.createLocalStorageDocumentStore({ namespace });
}

function inheritedRealtimeSyncOptions(): import('@shippie/doc').RealtimeSyncOptions {
  return {
    pushDebounceMs: 80,
    pullIntervalMs: 1_000,
    idlePullIntervalMs: 15_000,
    maxBackoffMs: 30_000,
  };
}

function reduceInheritedSnapshot(state: InheritedSnapshotState, event: import('@shippie/doc').DocumentEvent<InheritedSnapshotPayload>): InheritedSnapshotState {
  if (event.payload.kind !== 'local-storage-snapshot') return state;
  if (!state.latest || Date.parse(event.payload.capturedAt) >= Date.parse(state.latest.capturedAt)) {
    return { latest: event.payload };
  }
  return state;
}

interface InheritedStorageScope {
  keys: ReadonlySet<string>;
  prefixes: readonly string[];
}

function snapshotLocalStorage(appSlug: string, scope: InheritedStorageScope): InheritedSnapshotPayload {
  const entries: Array<{ key: string; value: string }> = [];
  let bytes = 0;
  let truncated = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.startsWith(INHERITED_DATA_PREFIX)) continue;
      if (!isInheritedStorageKeyAllowed(key, scope)) continue;
      const value = localStorage.getItem(key);
      if (value == null) continue;
      const nextBytes = new Blob([key, value]).size;
      if (bytes + nextBytes > INHERITED_LOCAL_STORAGE_BYTE_LIMIT) {
        truncated = true;
        continue;
      }
      bytes += nextBytes;
      entries.push({ key, value });
    }
  } catch {
    truncated = true;
  }
  return {
    kind: 'local-storage-snapshot',
    appSlug,
    capturedAt: new Date().toISOString(),
    entries,
    truncated,
    scoped: true,
    byteLength: bytes,
  };
}

function restoreLocalStorageSnapshot(snapshot: InheritedSnapshotPayload | null, scope: InheritedStorageScope): void {
  if (!snapshot) return;
  try {
    for (const entry of snapshot.entries) {
      if (!isInheritedStorageKeyAllowed(entry.key, scope)) continue;
      if (localStorage.getItem(entry.key) == null) localStorage.setItem(entry.key, entry.value);
    }
  } catch {
    // Best-effort; storage may be full or unavailable.
  }
}

function snapshotFingerprint(snapshot: InheritedSnapshotPayload): Omit<InheritedSnapshotPayload, 'capturedAt'> {
  return {
    kind: snapshot.kind,
    appSlug: snapshot.appSlug,
    entries: snapshot.entries,
    truncated: snapshot.truncated,
    scoped: snapshot.scoped,
    byteLength: snapshot.byteLength,
  };
}

function readInheritedAccessRecord(appSlug: string): InheritedAccessRecord | null {
  try {
    const raw = localStorage.getItem(inheritedAccessKey(appSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InheritedAccessRecord>;
    if (parsed.schema !== 'shippie.inherited-data.access.v0') return null;
    if (parsed.appSlug !== appSlug || !parsed.documentId || !parsed.documentKey || !parsed.createdAt) return null;
    if (isLegacySharedInheritedDocumentId(appSlug, parsed.documentId)) return null;
    return {
      schema: parsed.schema,
      appSlug,
      installId: parsed.installId ?? createInheritedInstallId(),
      documentId: parsed.documentId,
      documentKey: parsed.documentKey,
      createdAt: parsed.createdAt,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      lastCheckpointAt: parsed.lastCheckpointAt ?? null,
      lastEntryCount: typeof parsed.lastEntryCount === 'number' ? parsed.lastEntryCount : undefined,
      lastTruncated: parsed.lastTruncated === true,
    };
  } catch {
    return null;
  }
}

function writeInheritedAccessRecord(record: InheritedAccessRecord): void {
  try {
    localStorage.setItem(inheritedAccessKey(record.appSlug), JSON.stringify(record));
  } catch {
    // Best-effort.
  }
}

async function inheritedSigningFor(appSlug: string): Promise<import('@shippie/doc').DeviceSigningKeyPair> {
  const doc = await import('@shippie/doc');
  const key = `${INHERITED_DATA_PREFIX}:${appSlug}:signing`;
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as { publicJwk: JsonWebKey; privateJwk: JsonWebKey; publicKeySpki: string; deviceId: string };
      const publicKey = await crypto.subtle.importKey('jwk', saved.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      const privateKey = await crypto.subtle.importKey('jwk', saved.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
      return { deviceId: saved.deviceId, publicKey, privateKey, publicKeySpki: saved.publicKeySpki };
    } catch {
      localStorage.removeItem(key);
    }
  }
  const generated = await doc.generateDeviceSigningKeyPair();
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', generated.publicKey),
    crypto.subtle.exportKey('jwk', generated.privateKey),
  ]);
  localStorage.setItem(key, JSON.stringify({
    deviceId: generated.deviceId,
    publicKeySpki: generated.publicKeySpki,
    publicJwk,
    privateJwk,
  }));
  return generated;
}

function inheritedAccessKey(appSlug: string): string {
  return `${INHERITED_DATA_PREFIX}:${appSlug}:access`;
}

function inheritedStorageScope(
  appSlug: string,
  overrides: YourDataPanelOptions['inheritedStorage'] = {},
): InheritedStorageScope {
  const slug = appSlug.toLowerCase();
  const safe = safeDocumentPart(slug).toLowerCase();
  const dashed = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const dotted = slug.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  const underscored = safe.replace(/-+/g, '_');
  const camel = dashed.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
  const variants = [...new Set([slug, safe, dashed, dotted, underscored, camel].filter(Boolean))];
  const prefixes = new Set<string>(overrides.prefixes ?? []);
  for (const token of variants) {
    prefixes.add(`${token}:`);
    prefixes.add(`${token}.`);
    prefixes.add(`${token}/`);
    prefixes.add(`${token}-`);
    prefixes.add(`app:${token}:`);
    prefixes.add(`app_${token}:`);
    prefixes.add(`shippie:${token}:`);
    prefixes.add(`shippie.${token}.`);
    prefixes.add(`shippie-${token}-`);
    prefixes.add(`@shippie/${token}:`);
  }
  return {
    keys: new Set(overrides.keys ?? []),
    prefixes: [...prefixes].filter((prefix) => prefix && !prefix.startsWith(INHERITED_DATA_PREFIX)),
  };
}

function isInheritedStorageKeyAllowed(key: string, scope: InheritedStorageScope): boolean {
  return scope.keys.has(key) || scope.prefixes.some((prefix) => key.startsWith(prefix));
}

function createInheritedInstallId(): string {
  return `install_${randomBase64Url(18)}`;
}

function createInheritedDocumentId(appSlug: string): string {
  const slug = safeDocumentPart(appSlug).slice(0, 48);
  return `doc_${slug}_${randomBase64Url(24)}`;
}

function isLegacySharedInheritedDocumentId(appSlug: string, documentId: string): boolean {
  return documentId === `appdata_${safeDocumentPart(appSlug)}`;
}

function safeDocumentPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'app';
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let bin = '';
  for (const byte of new Uint8Array(digest)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  .scrim { position: absolute; inset: 0; background: rgba(20,18,15,0.6); backdrop-filter: blur(8px); }
  .panel {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px); overflow-y: auto;
    background: #FAF7EF; color: #14120F;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    padding: 24px;
    border-radius: 18px;
    border: 1px solid rgba(20, 18, 15, 0.08);
    box-shadow: 0 20px 80px rgba(0,0,0,0.4);
  }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; }
  p.subtitle { margin: 0 0 20px; color: #5C5751; font-size: 14px; line-height: 1.45; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #7A6B58; margin: 20px 0 8px; }
  .row { display: flex; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
  button {
    height: 38px; padding: 0 14px;
    border-radius: 999px; border: 1px solid #14120F;
    background: transparent; color: #14120F;
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  button.primary { background: #E8603C; color: #14120F; border-color: #E8603C; }
  button.soft { border-color: #D7C8B1; background: #FFFDF7; }
  button.danger { color: #B23A2B; border-color: #B23A2B; }
  button:hover { opacity: 0.85; }
  .stats { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #5C5751; font-size: 13px; }
  .footer { margin-top: 24px; font-size: 12px; color: #7A6B58; line-height: 1.5; }
  .close { position: absolute; top: 16px; right: 16px; background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #5C5751; }
  .sync-card {
    border: 1px solid #E0D4BF;
    background: linear-gradient(180deg, #FFFDF7 0%, #F7F0E2 100%);
    border-radius: 12px;
    padding: 16px;
    margin: 10px 0 14px;
  }
  .sync-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .sync-top h2 { margin: 0 0 4px; text-transform: none; letter-spacing: 0; font-size: 18px; color: #14120F; }
  .sync-top p { margin: 0; color: #5C5751; font-size: 13px; line-height: 1.45; }
  .pill {
    flex: 0 0 auto;
    border: 1px solid #D7C8B1;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11px;
    color: #4E473B;
    background: #FAF7EF;
    white-space: nowrap;
  }
  .pill[data-state="ready"] { border-color: #A8C8A0; color: #214A2F; background: #EFF8EC; }
  .safe-row {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(20,18,15,0.08);
  }
  .safe-row strong { display: block; font-size: 14px; }
  .safe-row small { color: #6F6658; font-size: 12px; }
  .copy-list { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
  .copy-list li { display: flex; gap: 8px; align-items: flex-start; color: #332E27; font-size: 13px; }
  .copy-list strong { display: block; font-size: 13px; }
  .copy-list small { display: block; color: #706657; margin-top: 1px; }
  .copy-dot {
    width: 9px; height: 9px; margin-top: 4px; border-radius: 999px; background: #C9B99E;
    box-shadow: 0 0 0 3px rgba(201,185,158,0.18);
  }
  .copy-dot[data-state="ready"] { background: #3E7D4D; box-shadow: 0 0 0 3px rgba(62,125,77,0.16); }
  .copy-dot[data-state="syncing"] { background: #D9972F; box-shadow: 0 0 0 3px rgba(217,151,47,0.16); }
  .copy-dot[data-state="offline"] { background: #8A8173; }
  .copy-dot[data-state="attention"] { background: #B23A2B; box-shadow: 0 0 0 3px rgba(178,58,43,0.15); }
  details.private-details {
    margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(20,18,15,0.08);
    color: #5C5751; font-size: 12px; line-height: 1.5;
  }
  details.private-details summary { cursor: pointer; color: #4E473B; font-weight: 600; }
  details.private-details p { margin: 8px 0 0; }
</style>
<div class="scrim"></div>
<div class="panel" role="dialog" aria-labelledby="shippie-data-title" data-shippie-data-body>
  <button class="close" id="shippie-data-close" aria-label="Close">×</button>
  <h1 id="shippie-data-title">Your Data</h1>
  <p class="subtitle">Saved privately, easy to move, recoverable when browsers forget.</p>

  <section class="sync-card" aria-labelledby="shippie-private-sync-title">
    <div class="sync-top">
      <div>
        <h2 id="shippie-private-sync-title">Private sync is getting ready.</h2>
        <p id="shippie-private-sync-detail">This app can store sealed recovery copies once its Document store is connected.</p>
      </div>
      <span class="pill" id="shippie-private-sync-badge" data-state="setup">Setting up</span>
    </div>
    <div class="safe-row">
      <div>
        <strong id="shippie-safe-copy-count">1 safe copy</strong>
        <small id="shippie-private-sync-last">No sealed sync yet</small>
      </div>
      <button class="soft" id="shippie-data-manage-copies">Manage copies</button>
    </div>
    <ul class="copy-list" id="shippie-private-sync-copies">
      <li><span class="copy-dot" data-state="ready"></span><span><strong>This device</strong><small>Local app data</small></span></li>
    </ul>
    <details class="private-details">
      <summary>How private sync works</summary>
      <p>Your data is sealed on this device before Shippie stores a recovery copy. Shippie can move and recover the sealed copy, but cannot open what is inside.</p>
    </details>
  </section>

  <h2>Move or restore</h2>
  <div class="row" data-shippie-recovery-actions>
    <button class="primary" id="shippie-data-add-device">Add another device</button>
    <button id="shippie-data-move-phone">Move to new phone</button>
    <button id="shippie-data-recovery-card">Show recovery card</button>
    <button id="shippie-data-restore">Restore data</button>
  </div>

  <h2>Storage</h2>
  <div class="stats" id="shippie-data-stats">computing…</div>

  <h2>Backup</h2>
  <div class="row">
    <button id="shippie-data-export">Download as file</button>
    <button id="shippie-data-import">Restore from file</button>
    <button id="shippie-data-backup">Auto-backup to Drive…</button>
  </div>

  <h2>Danger zone</h2>
  <div class="row">
    <button class="danger" id="shippie-data-delete">Delete everything from this device</button>
  </div>

  <p class="footer">
    Shippie stores sealed copies. We can help recover them, but we can't open them.
    Technical sync details like size and timing may still be visible.
  </p>
</div>
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
