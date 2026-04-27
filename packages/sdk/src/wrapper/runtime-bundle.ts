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
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let bipEvent: BeforeInstallPromptEvent | null = null;
let appMeta: AppMetaPayload | null = null;

const warn = (name: string) => () => {
  console.warn(`[shippie] ${name}() not wired yet — Phase 2+ of the rollout`);
  return Promise.resolve(null);
};

function captureBeforeInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bipEvent = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    bipEvent = null;
    emitProofEvent('installed');
  });
}

function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window === 'undefined') return;
  const register = () => {
    navigator.serviceWorker
      .register('/__shippie/sw.js', { scope: '/' })
      .catch((err) => console.warn('[shippie] sw register failed', err));
  };
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
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
    return;
  }

  configureProof({ appSlug: meta.slug });
  configureKindEmitter({
    workflowProbes: meta.workflow_probes ?? [],
    allowedHosts: meta.allowed_connect_domains ?? [],
  });
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
