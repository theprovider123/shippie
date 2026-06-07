<!--
  Container app-switcher gesture. The load-bearing deliverable for
  the unification plan — this is the moment the user discovers
  "all my apps are in here, switching is instant."

  Triggers:
    1. Edge swipe from the left of the viewport (≥20px horizontal,
       angle <30° from horizontal) → drawer slides in from the left.
    2. Subtle 4×80px pill at the bottom-centre → tap pulls the drawer up.
    3. Browser back gesture → drawer (handled by parent via popstate).
    4. Keyboard `Escape` for desktop / external keyboards → drawer.

  Animation contract:
    - Entry: 200ms spring; current app `scale 1→0.95`, `opacity 1→0.5`,
      drawer `translateX -100% → 0` (left) or `translateY 100% → 0` (bottom).
    - Slight ~3% overshoot on the spring for a physical feel.
    - Exit: 150ms reverse curve.
    - `prefers-reduced-motion` → instant transitions, opacity-only.

  This component owns the gesture detection + the drawer chrome. The
  PARENT decides what's in the drawer (typically a mini app grid) and
  what changes when the user taps a tile. Drawer content slots in via
  the default snippet so the same gesture works for the dashboard
  drawer, an "all apps" drawer, or any future surface.

  Real-phone tuning lives at /dev/gesture-prototype — open on
  iPhone Safari + Android Chrome, tweak the constants below until
  it feels like opening a drawer in a beautifully-built piece of
  furniture. Don't ship the rest of the unification plan until the
  gesture is right.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    APP_OPACITY_AT_OPEN,
    APP_SCALE_AT_OPEN,
    ENTRY_DURATION_MS,
    EXIT_DURATION_MS,
    SPRING_OVERSHOOT,
    isHorizontalDrawerGesture,
    shouldCancelBottomTap,
    shouldDismissDrawer,
  } from './app-switcher-gesture';

  interface Props {
    /** Drawer content. Typically a mini app grid. */
    children: Snippet;
    /** Whether the drawer should currently be open. Two-way bound. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Edge from which the drawer enters. Default 'left'. */
    edge?: 'left' | 'bottom' | 'right';
    /**
     * Minimum horizontal pull in CSS px before we commit to the
     * drawer-open gesture. Below this, the touch is treated as a
     * vertical scroll on the underlying iframe.
     */
    edgeSwipeThreshold?: number;
    /** Maximum angle in degrees from horizontal we still call a swipe. */
    edgeSwipeMaxAngle?: number;
    /** Width in CSS px of the touch zone along the left edge. */
    edgeGrabberWidth?: number;
    /** Whether invisible edge gestures should be active. */
    gestureEnabled?: boolean;
    /** Whether the parent has a meaningful in-tool back action. */
    canGoBack?: boolean;
    /** Triggered by a right-edge swipe when `canGoBack` is true. */
    onBack?: () => void;
  }

  let {
    children,
    open,
    onOpenChange,
    edge = 'left',
    edgeSwipeThreshold = 20,
    edgeSwipeMaxAngle = 30,
    edgeGrabberWidth = 24,
    gestureEnabled = true,
    canGoBack = false,
    onBack = () => {},
  }: Props = $props();

  // Gesture-tuning constants live in `./app-switcher-gesture.ts` so
  // `/dev/gesture-prototype` and any future telemetry can read the
  // same source. Edit the .ts to retune real-phone QA.

  // Detect reduced-motion preference once at mount; respect it for
  // every transition.
  let reducedMotion = $state(false);
  let documentVisible = $state(true);
  let drawerSettled = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mql.matches;
    const listener = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  });
  $effect(() => {
    if (typeof document === 'undefined') return;
    const updateVisibility = () => {
      documentVisible = !document.hidden;
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  });
  $effect(() => {
    if (!open || typeof window === 'undefined') {
      drawerSettled = false;
      return;
    }
    drawerSettled = false;
    const timer = window.setTimeout(() => {
      drawerSettled = true;
    }, ENTRY_DURATION_MS + 60);
    return () => window.clearTimeout(timer);
  });

  // One-shot pulse on the (invisible) back-edge grabber the first time
  // a user encounters an in-tool back action. The touch zone is invisible
  // by design — without this hint, the back-swipe is undiscoverable.
  // Gated by localStorage so it never repeats, and suppressed under
  // prefers-reduced-motion.
  const BACK_GESTURE_HINT_KEY = 'shippie:platform:back-gesture-seen-v1';
  let backGesturePulse = $state(false);
  let backGestureHintConsumed = false;
  $effect(() => {
    if (!canGoBack || backGestureHintConsumed || typeof window === 'undefined') return;
    if (reducedMotion) {
      backGestureHintConsumed = true;
      return;
    }
    try {
      if (localStorage.getItem(BACK_GESTURE_HINT_KEY)) {
        backGestureHintConsumed = true;
        return;
      }
      localStorage.setItem(BACK_GESTURE_HINT_KEY, '1');
    } catch {
      // localStorage may be blocked. Fire the pulse once for the session
      // anyway — at worst we re-cue the hint next visit, which is benign.
    }
    backGestureHintConsumed = true;
    backGesturePulse = true;
    const timer = window.setTimeout(() => {
      backGesturePulse = false;
    }, 1400);
    return () => window.clearTimeout(timer);
  });

  // First-run "Switch" label on the bottom switcher handle. The handle is a
  // quiet grabber by design; a one-time label makes it discoverable. Shown
  // until the user opens the switcher once, then persisted off (and stays
  // quiet thereafter, per the design tuning note).
  const TOOLS_HANDLE_HINT_KEY = 'shippie:platform:tools-handle-seen-v1';
  let toolsHintVisible = $state(false);
  let toolsHintInitialized = false;
  $effect(() => {
    if (toolsHintInitialized || typeof window === 'undefined') return;
    toolsHintInitialized = true;
    if (edge !== 'bottom' || !gestureEnabled) return;
    try {
      if (!localStorage.getItem(TOOLS_HANDLE_HINT_KEY)) toolsHintVisible = true;
    } catch {
      toolsHintVisible = true;
    }
  });
  $effect(() => {
    if (open && toolsHintVisible) {
      toolsHintVisible = false;
      try {
        localStorage.setItem(TOOLS_HANDLE_HINT_KEY, '1');
      } catch {
        // localStorage blocked — re-cue next session, benign.
      }
    }
  });

  // Pointer state for the edge-swipe.
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerActive = false;
  // Last horizontal delta seen during an in-progress swipe. Recorded
  // even when the move is sub-threshold, so handlePointerUp can detect
  // "user tried to swipe but didn't pull far enough" and fire a
  // confirmation haptic.
  let lastPointerDx = 0;
  let lastPointerDy = 0;
  let bottomTapCancelled = false;
  let backPointerStartX = 0;
  let backPointerStartY = 0;
  let backPointerActive = false;
  let lastBackPointerDx = 0;
  let drawerNode: HTMLElement | null = null;
  let dismissPointerId: number | null = null;
  let dismissStartX = 0;
  let dismissStartY = 0;
  let dismissStartTime = 0;
  let dismissFromChrome = false;
  let drawerDragY = $state(0);
  let drawerDismissActive = $state(false);
  let keyboardInset = $state(0);

  $effect(() => {
    if (typeof document === 'undefined') return;
    if (!open) return;
    lockBody();
    return unlockBody;
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    const update = () => {
      if (!viewport) {
        keyboardInset = 0;
        return;
      }
      keyboardInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  function handlePointerDown(event: PointerEvent) {
    if (open) return;
    if (edge === 'left' && event.clientX > edgeGrabberWidth) return;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerActive = true;
    lastPointerDx = 0;
    lastPointerDy = 0;
    bottomTapCancelled = false;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!pointerActive || open) return;
    const dx = event.clientX - pointerStartX;
    const dy = event.clientY - pointerStartY;
    lastPointerDx = dx;
    lastPointerDy = dy;

    if (edge === 'bottom') {
      const upwardPull = pointerStartY - event.clientY;
      if (shouldCancelBottomTap(dx, dy)) {
        bottomTapCancelled = true;
      }
      if (bottomTapCancelled) return;
      if (upwardPull < edgeSwipeThreshold) return;
      const angle = (Math.atan2(Math.abs(dx), Math.abs(upwardPull)) * 180) / Math.PI;
      if (angle > edgeSwipeMaxAngle) return;
      pointerActive = false;
      onOpenChange(true);
      return;
    }

    if (Math.abs(dx) < edgeSwipeThreshold) return;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angle > edgeSwipeMaxAngle) return;
    if (dx <= 0) return;
    pointerActive = false;
    onOpenChange(true);
  }

  function handlePointerUp() {
    if (pointerActive && edge === 'bottom') {
      const cancelBottomTap = bottomTapCancelled || shouldCancelBottomTap(lastPointerDx, lastPointerDy);
      pointerActive = false;
      lastPointerDx = 0;
      lastPointerDy = 0;
      bottomTapCancelled = false;
      if (cancelBottomTap) {
        void fireSubThresholdHaptic();
      } else {
        onOpenChange(true);
      }
      return;
    }

    // Sub-threshold release: user started swiping but didn't pull far
    // enough. Without feedback, the gesture reads as broken. Fire a
    // confirmation haptic — "we noticed, but you didn't pull far
    // enough" — without changing any visual state.
    if (pointerActive && edge === 'left' && lastPointerDx > 0 && lastPointerDx < edgeSwipeThreshold) {
      void fireSubThresholdHaptic();
    }
    pointerActive = false;
    lastPointerDx = 0;
    lastPointerDy = 0;
    bottomTapCancelled = false;
  }

  async function fireSubThresholdHaptic() {
    if (typeof window === 'undefined') return;
    try {
      const mod = await import('@shippie/sdk/wrapper');
      mod.haptic?.('tap');
    } catch {
      // SDK not available in this context — silent. iOS doesn't have
      // navigator.vibrate either, so nothing else to fall back to.
    }
  }

  function handleBackPointerDown(event: PointerEvent) {
    if (open || !canGoBack || typeof window === 'undefined') return;
    if (window.innerWidth - event.clientX > edgeGrabberWidth) return;
    backPointerStartX = event.clientX;
    backPointerStartY = event.clientY;
    backPointerActive = true;
    lastBackPointerDx = 0;
  }

  function handleBackPointerMove(event: PointerEvent) {
    if (!backPointerActive || open || !canGoBack) return;
    const dx = backPointerStartX - event.clientX;
    const dy = event.clientY - backPointerStartY;
    lastBackPointerDx = dx;
    if (dx < edgeSwipeThreshold) return;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angle > edgeSwipeMaxAngle) return;
    backPointerActive = false;
    onBack();
  }

  function handleBackPointerUp() {
    if (backPointerActive && lastBackPointerDx > 0 && lastBackPointerDx < edgeSwipeThreshold) {
      void fireSubThresholdHaptic();
    }
    backPointerActive = false;
    lastBackPointerDx = 0;
  }

  function handleDrawerDismissPointerDown(event: PointerEvent) {
    if (!open || edge !== 'bottom' || !drawerNode) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const grip = target.closest('[data-drawer-grip]');
    const handle = target.closest('[data-drawer-drag-handle]');
    const fromChrome = Boolean(grip || handle);
    const atScrollTop = drawerNode.scrollTop <= 1;
    if (!fromChrome && !atScrollTop) return;
    dismissPointerId = event.pointerId;
    dismissStartX = event.clientX;
    dismissStartY = event.clientY;
    dismissStartTime = performance.now();
    dismissFromChrome = fromChrome || atScrollTop;
    drawerDragY = 0;
    drawerDismissActive = false;
  }

  function handleDrawerDismissPointerMove(event: PointerEvent) {
    if (dismissPointerId !== event.pointerId) return;
    const dx = event.clientX - dismissStartX;
    const dy = event.clientY - dismissStartY;
    if (isHorizontalDrawerGesture(dx, dy) || dy < -12) {
      dismissPointerId = null;
      dismissFromChrome = false;
      drawerDismissActive = false;
      drawerDragY = 0;
      return;
    }
    if (dy <= 0) return;
    if (!dismissFromChrome && drawerNode && drawerNode.scrollTop > 1) return;
    if (!drawerDismissActive) {
      if (dy < 4) return;
      drawerDismissActive = true;
      drawerNode?.setPointerCapture?.(event.pointerId);
    }
    drawerDragY = Math.max(0, dy);
    if (drawerDragY > 0) event.preventDefault();
  }

  function handleDrawerDismissPointerUp(event: PointerEvent) {
    if (dismissPointerId !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - dismissStartY);
    const elapsed = Math.max(1, performance.now() - dismissStartTime);
    const shouldDismiss = drawerDismissActive && shouldDismissDrawer(dy, elapsed);
    dismissPointerId = null;
    dismissFromChrome = false;
    drawerDismissActive = false;
    drawerNode?.releasePointerCapture?.(event.pointerId);
    drawerDragY = 0;
    if (shouldDismiss) onOpenChange(false);
  }

  function lockBody() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __shippieSheetLockCount?: number };
    const count = (w.__shippieSheetLockCount ?? 0) + 1;
    w.__shippieSheetLockCount = count;
    if (count !== 1) return;
    const scrollY = window.scrollY;
    document.body.dataset.shippieSheetScrollY = String(scrollY);
    document.body.dataset.shippieSheetOverflow = document.body.style.overflow;
    document.body.dataset.shippieSheetPosition = document.body.style.position;
    document.body.dataset.shippieSheetTop = document.body.style.top;
    document.body.dataset.shippieSheetWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
  }

  function unlockBody() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __shippieSheetLockCount?: number };
    const count = Math.max(0, (w.__shippieSheetLockCount ?? 0) - 1);
    w.__shippieSheetLockCount = count;
    if (count !== 0) return;
    const scrollY = Number(document.body.dataset.shippieSheetScrollY ?? '0');
    document.body.style.overflow = document.body.dataset.shippieSheetOverflow ?? '';
    document.body.style.position = document.body.dataset.shippieSheetPosition ?? '';
    document.body.style.top = document.body.dataset.shippieSheetTop ?? '';
    document.body.style.width = document.body.dataset.shippieSheetWidth ?? '';
    delete document.body.dataset.shippieSheetScrollY;
    delete document.body.dataset.shippieSheetOverflow;
    delete document.body.dataset.shippieSheetPosition;
    delete document.body.dataset.shippieSheetTop;
    delete document.body.dataset.shippieSheetWidth;
    window.scrollTo(0, scrollY);
  }

  // Backdrop tap → close.
  function handleBackdropTap(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onOpenChange(false);
    }
  }

  // Keyboard: Escape closes.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onOpenChange(false);
    }
  }

  // Animation values driven by `open`. We compute them as derived
  // CSS variables so the underlying iframe can transform.
  const drawerTransform = $derived.by(() => {
    if (open && edge === 'bottom' && drawerDragY > 0) return `translate3d(0, ${drawerDragY}px, 0)`;
    if (open) return 'translate(0, 0)';
    if (edge === 'left') return 'translateX(-100%)';
    if (edge === 'right') return 'translateX(100%)';
    return 'translateY(100%)';
  });
  const dimmedAppTransform = $derived(open ? `scale(${APP_SCALE_AT_OPEN})` : 'scale(1)');
  const dimmedAppOpacity = $derived(open ? APP_OPACITY_AT_OPEN : 1);
  const instantTransition = $derived(reducedMotion || !documentVisible || drawerSettled);
  const transitionDuration = $derived(
    instantTransition ? '0ms' : open ? `${ENTRY_DURATION_MS}ms` : `${EXIT_DURATION_MS}ms`,
  );
  const transitionEase = $derived(
    reducedMotion
      ? 'linear'
      : `cubic-bezier(0.32, ${SPRING_OVERSHOOT}, 0.4, 1)`,
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if gestureEnabled && !open}
  <div
    class="edge-grabber"
    class:left-edge={edge === 'left'}
    class:bottom-edge={edge === 'bottom'}
    style:--edge-grabber-width={`${edgeGrabberWidth}px`}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    role="presentation"
  >
    {#if toolsHintVisible && edge === 'bottom'}
      <span class="tools-hint">Switch</span>
    {/if}
  </div>
{/if}

{#if gestureEnabled && !open && canGoBack}
  <div
    class="edge-grabber back-edge"
    style:--edge-grabber-width={`${edgeGrabberWidth}px`}
    onpointerdown={handleBackPointerDown}
    onpointermove={handleBackPointerMove}
    onpointerup={handleBackPointerUp}
    onpointercancel={handleBackPointerUp}
    role="presentation"
  >
    {#if backGesturePulse}
      <span class="back-edge-pulse" aria-hidden="true"></span>
    {/if}
  </div>
{/if}

<div
  class="backdrop"
  class:open
  style:transition="opacity {transitionDuration} {transitionEase}, backdrop-filter {transitionDuration} {transitionEase}"
  style:--app-scale={dimmedAppTransform}
  style:--app-opacity={dimmedAppOpacity}
  onclick={handleBackdropTap}
  role="presentation"
></div>

<aside
  bind:this={drawerNode}
  class="drawer"
  class:open
  class:dragging={drawerDismissActive}
  class:settled={drawerSettled && open && !drawerDismissActive}
  class:from-left={edge === 'left'}
  class:from-right={edge === 'right'}
  class:from-bottom={edge === 'bottom'}
  style:transform={drawerTransform}
  style:--drawer-keyboard-inset={`${keyboardInset}px`}
  style:transition="transform {transitionDuration} {transitionEase}"
  onpointerdown={handleDrawerDismissPointerDown}
  onpointermove={handleDrawerDismissPointerMove}
  onpointerup={handleDrawerDismissPointerUp}
  onpointercancel={handleDrawerDismissPointerUp}
  aria-label="App switcher"
  aria-hidden={!open}
  inert={!open}
>
  {@render children()}
</aside>

<style>
  /* Edge grabber: invisible touch zone for pull-to-open without
     sitting over the focused controls. */
  .edge-grabber {
    position: fixed;
    z-index: 55;
  }
  .edge-grabber.left-edge {
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--edge-grabber-width);
    touch-action: pan-y;
    cursor: ew-resize;
  }
  .edge-grabber.bottom-edge {
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    width: 80px;
    height: 18px;
    transform: translateX(-50%);
    touch-action: none;
    cursor: ns-resize;
  }
  /* First-run discoverability label on the bottom switcher handle. */
  .tools-hint {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--sunset);
    background: var(--surface);
    border: 1px solid var(--sunset);
    padding: 2px 10px;
    pointer-events: none;
  }
  .edge-grabber.back-edge {
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--edge-grabber-width);
    touch-action: pan-y;
    cursor: w-resize;
    overflow: hidden;
  }
  /* One-shot affordance pulse for first-time users — the back-grabber is
     invisible by design, so without this the in-tool back gesture is
     undiscoverable. Sage-deep at 0.18 opacity, 300ms fade-in + 700ms
     hold + 400ms fade-out. Suppressed under prefers-reduced-motion in
     the script. */
  .back-edge-pulse {
    position: absolute;
    inset: 0;
    background: var(--sage-deep, #4a6b54);
    opacity: 0;
    pointer-events: none;
    animation: back-edge-pulse 1400ms ease-out forwards;
  }
  @keyframes back-edge-pulse {
    0% { opacity: 0; }
    21.43% { opacity: 0.18; }   /* 300ms — fade-in done */
    71.43% { opacity: 0.18; }   /* +700ms — end of hold */
    100% { opacity: 0; }        /* +400ms — fade-out done */
  }
  @media (prefers-reduced-motion: reduce) {
    .back-edge-pulse { animation: none; opacity: 0; }
  }

  /* Backdrop: dim + scale the underlying app while the drawer is
     open. The parent applies these transforms on its own iframe
     container; we expose CSS vars for the parent to consume. */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 18, 15, 0);
    pointer-events: none;
    z-index: 50;
    opacity: 0;
    backdrop-filter: blur(0);
    -webkit-backdrop-filter: blur(0);
  }
  .backdrop.open {
    background: rgba(20, 18, 15, 0.35);
    pointer-events: auto;
    opacity: 1;
    backdrop-filter: blur(1px);
    -webkit-backdrop-filter: blur(1px);
  }

  /* Drawer: the app-switcher panel itself. Slides in from the
     declared edge. Parent slot fills the panel. */
  .drawer {
    position: fixed;
    z-index: 64;
    /* Dark Shippie surface — children inherit the global dark tokens
       (no cream overrides), so ToolRow/Switcher look identical to the
       dock home. */
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    will-change: transform;
    contain: layout paint;
    backface-visibility: hidden;
    overscroll-behavior: contain;
    --drawer-keyboard-inset: 0px;
  }
  .drawer.from-left {
    top: 0;
    left: 0;
    bottom: 0;
    width: min(520px, 44vw);
    min-width: min(360px, 92vw);
    border-right: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
  }
  .drawer.from-right {
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 44vw);
    min-width: min(380px, 94vw);
    border-left: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
  }
  .drawer.from-bottom {
    left: 0;
    right: 0;
    bottom: var(--drawer-keyboard-inset);
    max-height: min(calc(100dvh - var(--drawer-keyboard-inset) - 12px), 760px);
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
    touch-action: pan-y;
  }
  .drawer:not(.open) {
    pointer-events: none;
  }
  .drawer.open {
    transform: translate(0, 0);
  }
  .drawer.dragging {
    transition: none !important;
  }
  .drawer.open.settled:not(.dragging) {
    transition: none !important;
    transform: translate(0, 0) !important;
  }
  .drawer.from-left:not(.open) {
    transform: translateX(-100%) !important;
  }
  .drawer.from-right:not(.open) {
    transform: translateX(100%) !important;
  }
  .drawer.from-bottom:not(.open) {
    transform: translateY(100%) !important;
  }

  @media (max-width: 1024px) {
    .drawer.from-left,
    .drawer.from-right {
      width: min(480px, 58vw);
    }
  }

  @media (max-width: 640px) {
    .drawer.from-left,
    .drawer.from-right {
      width: min(100vw, 430px);
      min-width: 0;
    }
    .drawer.from-bottom {
      max-height: min(calc(100dvh - var(--drawer-keyboard-inset) - 8px), 760px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .backdrop.open {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
</style>
