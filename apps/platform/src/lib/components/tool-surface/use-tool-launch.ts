/**
 * use-tool-launch — the shared launch path extracted from ToolTile.svelte
 * so ToolRow and ToolCard inherit identical warm-launch, prefetch, and
 * hard-fallback behavior (spec §5). The bug-prone decisions live in the
 * pure helpers below and are unit-tested exhaustively; `createToolLaunch`
 * is thin glue over them that owns the prewarm flag + fallback timer.
 *
 * Behavior is a faithful port of ToolTile's warmLaunch /
 * scheduleHardLaunchFallback / launchAndRemember — do not change timings
 * or guards without updating the tests.
 */

/** The SPA hard-launch fallback fires this long after a plain click if the
 *  client-side navigation hasn't moved the page yet. */
export const HARD_LAUNCH_FALLBACK_MS = 900;

export interface LaunchActivationLike {
  button?: number;
  metaKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Only a plain left-click should trigger the hard-launch fallback. A
 * middle/right click or any modifier (⌘/ctrl/alt/shift) means the user is
 * opening a new tab / window — leave it to the browser. A missing event
 * (keyboard activation, programmatic open) counts as plain.
 */
export function isPlainActivation(event?: LaunchActivationLike | null): boolean {
  if (!event) return true;
  if (event.button !== undefined && event.button !== 0) return false;
  return !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

/**
 * Absolute URL to hard-navigate to, or null when navigation isn't needed
 * (target already equals the current URL) or the href is unusable.
 */
export function resolveHardFallbackTarget(
  launchHref: string,
  currentHref: string,
): string | null {
  try {
    const target = new URL(launchHref, currentHref).href;
    return target === currentHref ? null : target;
  } catch {
    return null;
  }
}

/** URLs to prefetch when warming a launch: the route, plus the embed
 *  frame when the tile actually launches a tool. */
export function prefetchTargets(
  slug: string,
  launchHref: string,
  launchesTool: boolean,
): string[] {
  const targets = [launchHref];
  if (launchesTool) {
    targets.push(`/__shippie-run/${encodeURIComponent(slug)}/?shippie_embed=1`);
  }
  return targets;
}

/**
 * Append a `<link rel="prefetch">` for a target, once. The href is
 * CSS-escaped before it enters the dedupe selector so a URL containing
 * `"` can't throw SyntaxError or widen the match. SSR-safe (no-op when
 * there is no document). Ported verbatim from ToolTile.
 */
export function addPrefetchLink(target: string): void {
  if (typeof document === 'undefined') return;
  const safeHref = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target) : target;
  if (document.head.querySelector(`link[rel="prefetch"][href="${safeHref}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = target;
  link.as = 'document';
  document.head.appendChild(link);
}

export interface ToolLaunchDeps {
  /** Present only for navigating tiles; absent for in-app frame swaps. */
  getHref: () => string | undefined;
  getLaunchHref: () => string;
  getSlug: () => string;
  launchesTool: () => boolean;
  /** Called instead of navigating when there is no href (drawer frame swap). */
  onOpen?: () => void;
  recordLaunch: (slug: string) => void;
  preloadData: (href: string) => Promise<unknown>;
  addPrefetchLink: (href: string) => void;
}

export interface ToolLaunchController {
  /** Idempotent — prefetches once. Wire to pointerdown/enter/focus/touchstart. */
  warmLaunch(): void;
  /** Wire to click. Records recency, swaps the frame or schedules the fallback. */
  launchAndRemember(event?: (LaunchActivationLike & { preventDefault?: () => void }) | undefined): void;
  /** Clear the pending fallback timer (call from onDestroy). */
  dispose(): void;
}

/**
 * Build a launch controller that owns the prewarm flag + fallback timer.
 * Deps are injected so the controller stays testable and SSR-safe.
 */
export function createToolLaunch(deps: ToolLaunchDeps): ToolLaunchController {
  let prewarmed = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  function warmLaunch() {
    const href = deps.getHref();
    if (prewarmed || !href) return; // only prefetch for navigating tiles
    prewarmed = true;
    void deps.preloadData(deps.getLaunchHref()).catch(() => {});
    for (const target of prefetchTargets(deps.getSlug(), deps.getLaunchHref(), deps.launchesTool())) {
      deps.addPrefetchLink(target);
    }
  }

  function scheduleHardLaunchFallback(event?: LaunchActivationLike) {
    const href = deps.getHref();
    if (!href || typeof window === 'undefined') return;
    if (!isPlainActivation(event)) return;

    const currentHref = window.location.href;
    const target = resolveHardFallbackTarget(deps.getLaunchHref(), currentHref);
    if (!target) return;

    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (window.location.href !== currentHref) return; // SPA nav already moved us
      window.location.assign(target);
    }, HARD_LAUNCH_FALLBACK_MS);
  }

  function launchAndRemember(
    event?: (LaunchActivationLike & { preventDefault?: () => void }) | undefined,
  ) {
    if (deps.launchesTool()) deps.recordLaunch(deps.getSlug());
    // No href → the tile can only open via the in-app swap callback
    // (navigation is impossible without a target anyway).
    if (!deps.getHref()) {
      event?.preventDefault?.();
      deps.onOpen?.();
      return;
    }
    scheduleHardLaunchFallback(event);
  }

  function dispose() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  return { warmLaunch, launchAndRemember, dispose };
}
