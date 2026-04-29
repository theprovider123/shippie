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

  interface Props {
    /** Drawer content. Typically a mini app grid. */
    children: Snippet;
    /** Whether the drawer should currently be open. Two-way bound. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Edge from which the drawer enters. Default 'left'. */
    edge?: 'left' | 'bottom';
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
    /**
     * Pulse the bottom-pill once on mount to telegraph its existence to
     * first-time users. Parent gates this with localStorage so it never
     * repeats on the same device.
     */
    firstRun?: boolean;
  }

  let {
    children,
    open,
    onOpenChange,
    edge = 'left',
    edgeSwipeThreshold = 20,
    edgeSwipeMaxAngle = 30,
    edgeGrabberWidth = 24,
    firstRun = false,
  }: Props = $props();

  // Gesture-tuning constants. Pulled out for ease of real-phone
  // adjustment. If these need to change per-device, switch to a
  // matchMedia probe.
  const ENTRY_DURATION_MS = 200;
  const EXIT_DURATION_MS = 150;
  const APP_SCALE_AT_OPEN = 0.95;
  const APP_OPACITY_AT_OPEN = 0.5;
  const SPRING_OVERSHOOT = 1.03;

  // Detect reduced-motion preference once at mount; respect it for
  // every transition.
  let reducedMotion = $state(false);
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

  // Pointer state for the edge-swipe.
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerActive = false;

  function handlePointerDown(event: PointerEvent) {
    if (open) return;
    if (edge === 'left' && event.clientX > edgeGrabberWidth) return;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerActive = true;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!pointerActive || open) return;
    const dx = event.clientX - pointerStartX;
    const dy = event.clientY - pointerStartY;
    if (Math.abs(dx) < edgeSwipeThreshold) return;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angle > edgeSwipeMaxAngle) return;
    if (edge === 'left' && dx <= 0) return;
    pointerActive = false;
    onOpenChange(true);
  }

  function handlePointerUp() {
    pointerActive = false;
  }

  // Bottom-pill trigger.
  function handlePillTap() {
    onOpenChange(true);
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
    if (open) return 'translate(0, 0)';
    return edge === 'left' ? 'translateX(-100%)' : 'translateY(100%)';
  });
  const dimmedAppTransform = $derived(open ? `scale(${APP_SCALE_AT_OPEN})` : 'scale(1)');
  const dimmedAppOpacity = $derived(open ? APP_OPACITY_AT_OPEN : 1);
  const transitionDuration = $derived(
    reducedMotion ? '0ms' : open ? `${ENTRY_DURATION_MS}ms` : `${EXIT_DURATION_MS}ms`,
  );
  const transitionEase = $derived(
    reducedMotion
      ? 'linear'
      : `cubic-bezier(0.32, ${SPRING_OVERSHOOT}, 0.4, 1)`,
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !open}
  <div
    class="edge-grabber"
    class:left-edge={edge === 'left'}
    style:width={edge === 'left' ? `${edgeGrabberWidth}px` : '100%'}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    role="presentation"
  ></div>
  <button
    class="bottom-pill"
    class:first-run={firstRun}
    type="button"
    onclick={handlePillTap}
    aria-label="Open app switcher"
  >
    <span class="pill-handle" aria-hidden="true"></span>
  </button>
{/if}

<div
  class="backdrop"
  class:open
  style:transition="opacity {transitionDuration} {transitionEase}"
  style:--app-scale={dimmedAppTransform}
  style:--app-opacity={dimmedAppOpacity}
  onclick={handleBackdropTap}
  role="presentation"
></div>

<aside
  class="drawer"
  class:open
  class:from-left={edge === 'left'}
  class:from-bottom={edge === 'bottom'}
  style:transform={drawerTransform}
  style:transition="transform {transitionDuration} {transitionEase}"
  aria-label="App switcher"
  aria-hidden={!open}
>
  {@render children()}
</aside>

<style>
  /* Edge grabber: invisible touch zone along the left edge that
     captures the pull-to-open gesture without consuming taps. */
  .edge-grabber {
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 100;
    touch-action: pan-y;
    cursor: ew-resize;
  }
  .edge-grabber.left-edge {
    left: 0;
  }

  /* Bottom pill: the discoverable secondary trigger. Thin enough to
     vanish visually, opaque enough to be findable. Reachable with
     thumb on a 6.7" device in portrait. */
  .bottom-pill {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    transform: translateX(-50%);
    width: 80px;
    height: 24px;
    background: transparent;
    border: 0;
    cursor: pointer;
    padding: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pill-handle {
    width: 80px;
    height: 4px;
    border-radius: 2px;
    background: rgba(20, 18, 15, 0.25);
    transition: background 200ms ease;
  }
  .bottom-pill:hover .pill-handle,
  .bottom-pill:focus-visible .pill-handle {
    background: rgba(20, 18, 15, 0.5);
  }
  /* First-run pulse: one-shot animation on the pill-handle the very
     first time a device enters focused mode. Telegraphs that the pill
     is interactive without a toast or modal. */
  .bottom-pill.first-run .pill-handle {
    animation: shippie-pill-pulse 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.4s 1 both;
  }
  @keyframes shippie-pill-pulse {
    0%   { transform: scale(1);    background: rgba(20, 18, 15, 0.25); }
    35%  { transform: scale(1.1);  background: rgba(20, 18, 15, 0.5); }
    70%  { transform: scale(0.95); background: rgba(20, 18, 15, 0.5); }
    100% { transform: scale(1);    background: rgba(20, 18, 15, 0.25); }
  }
  @media (prefers-reduced-motion: reduce) {
    .bottom-pill.first-run .pill-handle { animation: none; }
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
  }
  .backdrop.open {
    background: rgba(20, 18, 15, 0.35);
    pointer-events: auto;
    opacity: 1;
  }

  /* Drawer: the app-switcher panel itself. Slides in from the
     declared edge. Parent slot fills the panel. */
  .drawer {
    position: fixed;
    z-index: 60;
    background: var(--bg, #faf7ef);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
    will-change: transform;
  }
  .drawer.from-left {
    top: 0;
    left: 0;
    bottom: 0;
    width: min(360px, 90vw);
    border-right: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
  }
  .drawer.from-bottom {
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80vh;
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    overflow-y: auto;
  }
  .drawer:not(.open) {
    pointer-events: none;
  }
</style>
