// packages/sdk/src/wrapper/runtime-bundle.ts
/**
 * Runtime bundle entry — what gets served at /__shippie/sdk.js on every
 * maker subdomain. Auto-boots the wrapper SDK from /__shippie/meta with
 * zero maker code changes.
 *
 * Phase 1A scope:
 *   - Register the wrapper service worker (so Chrome considers the page
 *     installable and beforeinstallprompt fires).
 *   - Capture beforeinstallprompt and expose shippie.install.prompt().
 *   - Fetch /__shippie/meta and auto-configure proof + kind emitters
 *     using the app slug + declared policy hints.
 *   - Expose a window.shippie surface compatible with the existing dev
 *     stub so maker code that already calls shippie.* keeps working.
 *
 * Out of scope (deferred):
 *   - Real auth, db, files, notify, native bridge — those land with
 *     Phases 2-6 of the master plan.
 */
import {
  configureProof,
  emitProofEvent,
  flushNow as flushProofQueue,
} from './proof.ts';
import {
  configureKindEmitter,
  noteLocalWrite,
  noteGracefulDegrade,
  notePersonalDataLeak,
} from './kind-emitter.ts';
import { installAppLifecycleReporter } from './lifecycle.ts';
import { installRuntimeConnectionMonitor } from './runtime-connections.ts';
import { openYourData, type YourDataPanelOptions } from './your-data-panel.ts';
import { installLocalStorageKeyTracker } from './local-storage-tracker.ts';

interface AppMetaPayload {
  slug: string;
  name?: string;
  type?: string;
  theme_color?: string;
  background_color?: string;
  version?: number;
  backend_type?: string | null;
  backend_url?: string | null;
  workflow_probes?: string[];
  allowed_connect_domains?: string[];
  connection_guard?: {
    summary?: string;
    connections?: ConnectionNoticeConnection[];
  };
  data?: {
    localStorage?: {
      keys?: readonly string[];
      prefixes?: readonly string[];
    };
  };
}

interface ConnectionNoticeConnection {
  host?: string;
  purpose?: string;
  risk?: 'low' | 'medium' | 'high';
  category?: string;
  requiresConsent?: boolean;
  data?: string[];
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let bipEvent: BeforeInstallPromptEvent | null = null;
let appMeta: AppMetaPayload | null = null;
let controllerReloadInstalled = false;
let updatePollingInstalled = false;

const warn = (name: string) => () => {
  console.warn(`[shippie] ${name}() not wired yet — Phase 2+ of the rollout`);
  return Promise.resolve(null);
};

function captureBeforeInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bipEvent = e as BeforeInstallPromptEvent;
    emitProofEvent('pwa_installable');
  });
  window.addEventListener('appinstalled', () => {
    bipEvent = null;
    emitProofEvent('installed');
  });
}

function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window === 'undefined') return;
  installControllerReload();
  const register = () => {
    navigator.serviceWorker
      .register('/__shippie/sw.js', { scope: '/' })
      .then((reg) => {
        activateWaitingWorker(reg);
        watchInstallingWorker(reg.installing);
        reg.addEventListener('updatefound', () => watchInstallingWorker(reg.installing));
        installUpdatePolling(reg);
      })
      .catch((err) => console.warn('[shippie] sw register failed', err));
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}

function activateWaitingWorker(reg: ServiceWorkerRegistration): void {
  if (!navigator.serviceWorker.controller || !reg.waiting) return;
  try {
    reg.waiting.postMessage('SKIP_WAITING');
  } catch {
    /* activation is best-effort */
  }
}

function watchInstallingWorker(worker: ServiceWorker | null): void {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      try {
        worker.postMessage('SKIP_WAITING');
      } catch {
        /* activation is best-effort */
      }
    }
  });
}

function installControllerReload(): void {
  if (controllerReloadInstalled) return;
  controllerReloadInstalled = true;
  let refreshing = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function installUpdatePolling(reg: ServiceWorkerRegistration): void {
  if (updatePollingInstalled) return;
  updatePollingInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    reg.update().then(activateWaitingWorker).catch(() => {});
  });
}

function installStatus(): 'installed' | 'installable' | 'not-yet-available' | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return 'installed';
  }
  return bipEvent ? 'installable' : 'not-yet-available';
}

async function promptInstall(): Promise<{ outcome: string }> {
  if (!bipEvent) return { outcome: 'unavailable' };
  const evt = bipEvent;
  bipEvent = null;
  await evt.prompt();
  return evt.userChoice;
}

async function loadMeta(): Promise<AppMetaPayload | null> {
  if (appMeta) return appMeta;
  try {
    const r = await fetch('/__shippie/meta');
    if (!r.ok) return null;
    const data = (await r.json()) as AppMetaPayload;
    appMeta = data;
    if (typeof window !== 'undefined') {
      (window as unknown as { __shippie_meta?: { appSlug?: string } & AppMetaPayload }).__shippie_meta = {
        ...data,
        appSlug: data.slug,
      };
    }
    return data;
  } catch {
    return null;
  }
}

async function bootstrap(): Promise<void> {
  registerServiceWorker();
  captureBeforeInstallPrompt();

  const meta = await loadMeta();
  if (!meta?.slug) {
    // No metadata available — proof + kind emission can't bind without a
    // slug. Surface installs still work because the BIP capture is set
    // up above. Log once and return.
    console.warn('[shippie] /__shippie/meta unavailable — proof + kind disabled this session');
    installAppLifecycleReporter({ source: 'sdk' });
    return;
  }

  installAppLifecycleReporter({ appId: meta.slug, source: 'sdk' });
  installRuntimeConnectionMonitor({ slug: meta.slug, version: meta.version ?? null });
  installLocalStorageKeyTracker(meta.slug);
  installConnectionNotice(meta);

  configureProof({ appSlug: meta.slug });
  configureKindEmitter({
    workflowProbes: meta.workflow_probes ?? [],
    allowedHosts: meta.allowed_connect_domains ?? [],
  });
}

function installConnectionNotice(meta: AppMetaPayload): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const connections = notableConnections(meta.connection_guard?.connections ?? []);
  if (connections.length === 0) return;

  const noticeKey = [
    'shippie:connection-notice',
    meta.slug,
    String(meta.version ?? 0),
    connections.map((c) => c.host ?? 'unknown').sort().join(','),
  ].join(':');
  try {
    if (window.localStorage.getItem(noticeKey) === '1') return;
  } catch {
    /* localStorage can be unavailable in private contexts */
  }

  const show = () => showConnectionNotice(meta, connections, noticeKey);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show, { once: true });
  } else {
    show();
  }
}

function notableConnections(connections: ConnectionNoticeConnection[]): ConnectionNoticeConnection[] {
  return connections
    .filter((connection) => {
      if (!connection.host) return false;
      if (connection.risk === 'high') return true;
      if (connection.category === 'external-ai') return true;
      if (connection.requiresConsent) return true;
      return (connection.data ?? []).some((item) =>
        ['user_data', 'personal_context', 'text', 'images', 'files'].includes(item),
      );
    })
    .slice(0, 4);
}

function showConnectionNotice(
  meta: AppMetaPayload,
  connections: ConnectionNoticeConnection[],
  noticeKey: string,
): void {
  if (document.getElementById('shippie-connection-notice')) return;
  const root = document.createElement('div');
  root.id = 'shippie-connection-notice';
  root.setAttribute('role', 'status');
  root.style.cssText =
    'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483646;display:flex;justify-content:center;pointer-events:none';

  const panel = document.createElement('div');
  panel.style.cssText =
    'max-width:520px;width:100%;box-sizing:border-box;border:1px solid rgba(20,18,15,.16);border-radius:14px;background:#fffaf0;color:#14120f;box-shadow:0 18px 50px rgba(20,18,15,.18);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:14px;pointer-events:auto';

  const title = document.createElement('div');
  title.textContent = 'This app uses external services';
  title.style.cssText = 'font-weight:700;font-size:15px;margin:0 0 4px';
  panel.appendChild(title);

  const body = document.createElement('div');
  const appName = meta.name || meta.slug;
  const hostList = connections.map((c) => c.host).filter(Boolean).join(', ');
  body.textContent = `${appName} can connect to ${hostList}. Shippie allows this, and shows it so data movement is not hidden.`;
  body.style.cssText = 'color:#554c40;margin:0 0 10px';
  panel.appendChild(body);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0 0 12px;padding:0;list-style:none;display:grid;gap:5px;color:#554c40';
  for (const connection of connections) {
    const item = document.createElement('li');
    const data = (connection.data ?? []).slice(0, 3).join(', ');
    item.textContent = `${connection.host}: ${connection.purpose || 'External connection'}${data ? ` (${data})` : ''}`;
    list.appendChild(item);
  }
  panel.appendChild(list);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end';

  const details = document.createElement('button');
  details.type = 'button';
  details.textContent = 'View details';
  details.style.cssText =
    'height:36px;border:1px solid rgba(20,18,15,.22);border-radius:999px;background:transparent;color:#14120f;padding:0 13px;font:600 13px system-ui,-apple-system,sans-serif;cursor:pointer';
  details.addEventListener('click', () => {
    window.location.assign('/__shippie/data');
  });
  actions.appendChild(details);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Got it';
  dismiss.style.cssText =
    'height:36px;border:1px solid #14120f;border-radius:999px;background:#14120f;color:#fffaf0;padding:0 14px;font:700 13px system-ui,-apple-system,sans-serif;cursor:pointer';
  dismiss.addEventListener('click', () => {
    try {
      window.localStorage.setItem(noticeKey, '1');
    } catch {
      /* ignore */
    }
    root.remove();
  });
  actions.appendChild(dismiss);
  panel.appendChild(actions);
  root.appendChild(panel);
  document.body.appendChild(root);
}

const shippie = {
  version: '1.0.0-runtime',
  get origin() {
    return typeof location !== 'undefined' ? location.origin : '';
  },
  meta: loadMeta,
  install: {
    prompt: promptInstall,
    status: installStatus,
  },
  track: (event: string, props?: Record<string, unknown>) => {
    // Custom analytics events land with Phase 6 (privacy-first beacons).
    // For now, log so makers can verify their instrumentation locally.
    console.debug('[shippie] track', event, props);
  },
  proof: {
    emit: emitProofEvent,
    flush: flushProofQueue,
    noteLocalWrite,
    noteGracefulDegrade,
    notePersonalDataLeak,
  },
  // Mounts the Shadow-DOM "Your Data" panel so makers can drop a
  // `<button onClick={() => shippie.openYourData()}>` anywhere and
  // users see backup / export / receipts in one place.
  openYourData: (options?: YourDataPanelOptions) => openYourData({
    ...options,
    appSlug: options?.appSlug ?? appMeta?.slug,
    inheritedStorage: options?.inheritedStorage ?? appMeta?.data?.localStorage,
  }),
  // Phase 2+ surfaces — keep the API shape stable for maker code,
  // forward to dev-stub warnings until the real wiring lands.
  auth: {
    getUser: warn('auth.getUser'),
    signIn: warn('auth.signIn'),
    signOut: warn('auth.signOut'),
    onChange: () => () => {},
  },
  db: {
    set: warn('db.set'),
    get: warn('db.get'),
    list: warn('db.list'),
    delete: warn('db.delete'),
  },
  files: {
    upload: warn('files.upload'),
    get: warn('files.get'),
    delete: warn('files.delete'),
  },
  notify: {
    send: warn('notify.send'),
    subscribe: warn('notify.subscribe'),
  },
  feedback: {
    open: () => console.warn('[shippie] feedback.open() lands in Phase 6'),
    submit: warn('feedback.submit'),
  },
  native: {
    share: warn('native.share'),
    haptics: { impact: () => Promise.resolve() },
    deviceInfo: warn('native.deviceInfo'),
  },
};

if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { shippie: typeof shippie }).shippie = shippie;
}
if (typeof window !== 'undefined') {
  (window as unknown as { shippie: typeof shippie }).shippie = shippie;
}

void bootstrap();

export {};
