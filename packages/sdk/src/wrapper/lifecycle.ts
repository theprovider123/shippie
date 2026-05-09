// packages/sdk/src/wrapper/lifecycle.ts
/**
 * App -> container lifecycle contract.
 *
 * This is intentionally tiny and postMessage-based so every framework can
 * speak it. The container still keeps a visual paint fallback for older apps,
 * but SDK-enabled apps can now report boot, route, and error state directly.
 */

export const SHIPPIE_APP_LIFECYCLE_EVENT = 'shippie:app-lifecycle' as const;
export const SHIPPIE_APP_LIFECYCLE_VERSION = 1 as const;

export type AppLifecycleEventName = 'booting' | 'ready' | 'error' | 'navigation' | 'heartbeat';
export type AppLifecycleSource = 'sdk' | 'iframe-sdk' | 'observe' | 'manual';

export interface AppLifecycleTiming {
  sinceNavigationStartMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  firstPaintMs?: number;
  firstContentfulPaintMs?: number;
}

export interface AppLifecycleError {
  name?: string;
  message: string;
  stack?: string;
}

export interface AppLifecyclePayload {
  type: typeof SHIPPIE_APP_LIFECYCLE_EVENT;
  version: typeof SHIPPIE_APP_LIFECYCLE_VERSION;
  event: AppLifecycleEventName;
  source: AppLifecycleSource;
  appId?: string;
  at: number;
  href?: string;
  path?: string;
  title?: string;
  canGoBack?: boolean;
  navDepth?: number;
  timing?: AppLifecycleTiming;
  error?: AppLifecycleError;
}

export interface AppLifecycleInput {
  event: AppLifecycleEventName;
  source?: AppLifecycleSource;
  appId?: string;
  canGoBack?: boolean;
  navDepth?: number;
  error?: unknown;
}

export interface InstallAppLifecycleOptions {
  appId?: string;
  source?: AppLifecycleSource;
  /**
   * How long the automatic ready report waits for the DOM to show real content.
   * Apps with a custom boot step can call `reportAppReady()` manually instead.
   */
  readyTimeoutMs?: number;
}

const INSTALLED_FLAG = '__shippie_lifecycle_installed';

export function createAppLifecyclePayload(input: AppLifecycleInput): AppLifecyclePayload {
  const href = typeof location !== 'undefined' ? location.href : undefined;
  const path = typeof location !== 'undefined' ? `${location.pathname}${location.search}${location.hash}` : undefined;
  const title = typeof document !== 'undefined' ? document.title : undefined;
  return {
    type: SHIPPIE_APP_LIFECYCLE_EVENT,
    version: SHIPPIE_APP_LIFECYCLE_VERSION,
    event: input.event,
    source: input.source ?? 'sdk',
    appId: input.appId,
    at: now(),
    href,
    path,
    title,
    canGoBack: input.canGoBack,
    navDepth: input.navDepth,
    timing: collectLifecycleTiming(),
    error: input.error === undefined ? undefined : normalizeLifecycleError(input.error),
  };
}

export function postAppLifecycle(input: AppLifecycleInput): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(createAppLifecyclePayload(input), '*');
  } catch {
    /* parent may be unavailable */
  }
}

export function reportAppReady(options: Omit<AppLifecycleInput, 'event'> = {}): void {
  postAppLifecycle({ ...options, event: 'ready' });
}

export function reportAppError(error: unknown, options: Omit<AppLifecycleInput, 'event' | 'error'> = {}): void {
  postAppLifecycle({ ...options, event: 'error', error });
}

export function reportAppNavigation(options: Omit<AppLifecycleInput, 'event'> = {}): void {
  postAppLifecycle({ ...options, event: 'navigation' });
}

export function reportAppHeartbeat(options: Omit<AppLifecycleInput, 'event'> = {}): void {
  postAppLifecycle({ ...options, event: 'heartbeat' });
}

export function installAppLifecycleReporter(options: InstallAppLifecycleOptions = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w[INSTALLED_FLAG]) return;
  w[INSTALLED_FLAG] = true;

  const source = options.source ?? 'sdk';
  const base = { appId: options.appId, source };
  postAppLifecycle({ ...base, event: 'booting' });

  const reportReady = () => {
    void waitForPaintableDom(options.readyTimeoutMs ?? 2_000).then(() => {
      reportAppReady(base);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportReady, { once: true });
  } else {
    reportReady();
  }

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
    if (target && ('src' in target || 'href' in target)) {
      const url = 'src' in target ? target.src : target.href;
      reportAppError(new Error(`asset failed to load: ${url}`), base);
      return;
    }
    reportAppError(event.error ?? event.message, base);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    reportAppError(event.reason, base);
  });
}

function collectLifecycleTiming(): AppLifecycleTiming | undefined {
  if (typeof performance === 'undefined') return undefined;
  const out: AppLifecycleTiming = { sinceNavigationStartMs: Math.round(now()) };
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      if (nav.domContentLoadedEventEnd > 0) out.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
      if (nav.loadEventEnd > 0) out.loadMs = Math.round(nav.loadEventEnd);
    }
    for (const paint of performance.getEntriesByType?.('paint') ?? []) {
      if (paint.name === 'first-paint') out.firstPaintMs = Math.round(paint.startTime);
      if (paint.name === 'first-contentful-paint') out.firstContentfulPaintMs = Math.round(paint.startTime);
    }
  } catch {
    /* timing is advisory */
  }
  return out;
}

function normalizeLifecycleError(error: unknown): AppLifecycleError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || 'Unknown app error',
      stack: error.stack,
    };
  }
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String((error as { message?: unknown }).message ?? 'Unknown app error') };
  }
  return { message: 'Unknown app error' };
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function waitForPaintableDom(timeoutMs: number): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (domLooksPaintable()) return afterAnimationFrame();
  return new Promise((resolve) => {
    const finish = () => {
      observer?.disconnect();
      clearTimeout(timer);
      void afterAnimationFrame().then(resolve);
    };
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (domLooksPaintable()) finish();
          });
    observer?.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const timer = setTimeout(finish, timeoutMs);
    if (domLooksPaintable()) finish();
  });
}

function domLooksPaintable(): boolean {
  if (typeof document === 'undefined') return true;
  const body = document.body;
  if (!body) return false;
  const text = (body.innerText || body.textContent || '').trim();
  if (text.length > 0) return true;
  return Boolean(body.querySelector('canvas, svg, img, video, button, input, textarea, select, [role="button"], [role="main"], main, #root > *, #app > *'));
}

function afterAnimationFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
