<script lang="ts">
  /**
   * Sheet — bottom-sheet on mobile, centered modal on tablet+.
   *
   * Behaviour:
   *   - role="dialog" + aria-modal="true" + aria-labelledby (or aria-label
   *     fallback when no `title` is provided and caller renders their own
   *     heading inside the slot).
   *   - Focus trap: Tab / Shift+Tab cycle inside the sheet. First focusable
   *     element receives focus on open. Previous active element receives
   *     focus on close.
   *   - Escape dismisses (when `dismissOnEscape` is true, default).
   *   - Browser back dismisses after pushing one transient history entry.
   *   - Backdrop click dismisses (when `dismissOnBackdrop` is true, default).
   *   - Body scroll lock while open. Reference-counted so nested sheets behave.
   *   - prefers-reduced-motion honoured (slide-in becomes fade).
   *   - Safe-area padding (--safe-bottom token) baked in.
   *   - Breakpoint: ≤640 = bottom sheet, ≥641 = centered modal. Both presented
   *     by the same DOM — the @media query repositions.
   *
   * Caller is responsible for the trigger button restoring focus correctly
   * if the sheet was opened by code (not by a button click) — we capture
   * document.activeElement at open time as a safety net.
   */
  import type { Snippet } from 'svelte';
  import { pushState } from '$app/navigation';
  import {
    isHorizontalDrawerGesture,
    shouldDismissDrawer,
  } from '$lib/utils/drawer-dismiss';

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Visible heading rendered at the top of the sheet. When provided, used
     *  as aria-labelledby target. When omitted, caller must include their own
     *  heading inside the slot AND pass `label` so the dialog has an
     *  accessible name. */
    title?: string;
    /** Optional small text rendered next to the title (e.g. "2 of 4" queue
     *  position). Skipped when empty. */
    subtitle?: string;
    /** Accessible name when no `title` is rendered. Falls back to "Dialog". */
    label?: string;
    dismissOnEscape?: boolean;
    dismissOnBackdrop?: boolean;
    dismissOnBack?: boolean;
    /** Default slot. */
    children?: Snippet;
  }

  let {
    open,
    onClose,
    title,
    subtitle,
    label,
    dismissOnEscape = true,
    dismissOnBackdrop = true,
    dismissOnBack = true,
    children,
  }: Props = $props();

  let sheetEl: HTMLDivElement | undefined = $state();
  let previousActive: HTMLElement | null = null;
  let titleId = `sheet-title-${Math.random().toString(36).slice(2, 9)}`;
  let pushedHistory = false;
  let closingFromPopstate = false;
  let ignoreNextPopstate = false;
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTime = 0;
  let dragFromChrome = false;
  let dragY = $state(0);
  let dragging = $state(false);

  const sheetTransform = $derived(dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined);

  function isMobileSheet() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 640px)').matches;
  }

  // Body scroll lock — reference-counted so nested sheets behave.
  // Stored on window so multiple Sheet instances share state.
  function lockBody() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __shippieSheetLockCount?: number };
    const count = (w.__shippieSheetLockCount ?? 0) + 1;
    w.__shippieSheetLockCount = count;
    if (count === 1) {
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
  }
  function unlockBody() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __shippieSheetLockCount?: number };
    const count = Math.max(0, (w.__shippieSheetLockCount ?? 0) - 1);
    w.__shippieSheetLockCount = count;
    if (count === 0) {
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
  }

  function pushSheetHistory() {
    if (typeof window === 'undefined' || !dismissOnBack || pushedHistory) return;
    pushState('', { __shippieSheet: titleId });
    pushedHistory = true;
  }

  function releaseSheetHistory() {
    if (typeof window === 'undefined' || !pushedHistory) return;
    pushedHistory = false;
    if (closingFromPopstate) {
      closingFromPopstate = false;
      return;
    }
    ignoreNextPopstate = true;
    window.history.back();
    window.setTimeout(() => {
      ignoreNextPopstate = false;
    }, 0);
  }

  function getFocusable(root: HTMLElement): HTMLElement[] {
    const sel =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape' && dismissOnEscape) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab' && sheetEl) {
      const focusable = getFocusable(sheetEl);
      if (focusable.length === 0) {
        e.preventDefault();
        sheetEl.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onBackdropClick() {
    if (dismissOnBackdrop) onClose();
  }

  function onSheetPointerDown(event: PointerEvent) {
    if (!open || !sheetEl || !isMobileSheet()) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const rect = sheetEl.getBoundingClientRect();
    const inHeaderZone = event.clientY - rect.top <= 76;
    const onHandle = Boolean(target.closest('.grab, .sheet-title'));
    const fromChrome = onHandle || inHeaderZone;
    const atScrollTop = sheetEl.scrollTop <= 1;
    if (!fromChrome && !atScrollTop) return;

    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartTime = performance.now();
    dragFromChrome = fromChrome || atScrollTop;
    dragY = 0;
    dragging = false;
  }

  function onSheetPointerMove(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (isHorizontalDrawerGesture(dx, dy) || dy < -12) {
      dragPointerId = null;
      dragging = false;
      dragFromChrome = false;
      dragY = 0;
      return;
    }
    if (dy <= 0) return;
    if (!dragFromChrome && sheetEl && sheetEl.scrollTop > 1) return;
    if (!dragging) {
      if (dy < 4) return;
      dragging = true;
      sheetEl?.setPointerCapture?.(event.pointerId);
    }
    dragY = Math.max(0, dy);
    if (dragY > 0) event.preventDefault();
  }

  function onSheetPointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - dragStartY);
    const elapsed = Math.max(1, performance.now() - dragStartTime);
    const shouldDismiss = dragging && shouldDismissDrawer(dy, elapsed);
    dragPointerId = null;
    dragging = false;
    dragFromChrome = false;
    sheetEl?.releasePointerCapture?.(event.pointerId);
    dragY = 0;
    if (shouldDismiss) onClose();
  }

  function onPopstate() {
    if (ignoreNextPopstate) {
      ignoreNextPopstate = false;
      return;
    }
    if (open && dismissOnBack) {
      closingFromPopstate = true;
      onClose();
    }
  }

  // Manage open/close side-effects: scroll lock, focus capture/restore.
  $effect(() => {
    if (open && sheetEl) {
      previousActive = document.activeElement as HTMLElement | null;
      lockBody();
      pushSheetHistory();
      // Defer focus by a frame so the sheet has rendered.
      requestAnimationFrame(() => {
        if (!sheetEl) return;
        const focusable = getFocusable(sheetEl);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          sheetEl.focus();
        }
      });
      return () => {
        unlockBody();
        releaseSheetHistory();
        if (previousActive && typeof previousActive.focus === 'function') {
          previousActive.focus();
        }
        previousActive = null;
      };
    }
  });
</script>

<svelte:window onkeydown={onKeydown} onpopstate={onPopstate} />

{#if open}
  <div
    class="scrim"
    role="presentation"
    onclick={onBackdropClick}
    onkeydown={(e) => {
      if ((e.key === 'Enter' || e.key === ' ') && dismissOnBackdrop) onClose();
    }}
  ></div>
  <div
    bind:this={sheetEl}
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? titleId : undefined}
    aria-label={title ? undefined : (label ?? 'Dialog')}
    tabindex="-1"
    class:dragging
    style:transform={sheetTransform}
    onpointerdown={onSheetPointerDown}
    onpointermove={onSheetPointerMove}
    onpointerup={onSheetPointerUp}
    onpointercancel={onSheetPointerUp}
  >
    <div class="grab" aria-hidden="true"></div>
    {#if title}
      <h3 id={titleId} class="sheet-title">
        {title}
        {#if subtitle}
          <span class="sheet-subtitle">{subtitle}</span>
        {/if}
      </h3>
    {/if}
    {@render children?.()}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(3px);
    z-index: 1000;
    animation: scrim-fade 140ms ease-out;
    touch-action: none;
  }
  @keyframes scrim-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1001;
    margin: 0 auto;
    max-width: 520px;
    padding:
      14px
      max(18px, var(--safe-right))
      calc(18px + var(--safe-bottom))
      max(18px, var(--safe-left));
    border-top: 1px solid var(--border);
    background: var(--bg-pure);
    /* Elevation: float clearly above the dimmed/blurred backdrop, with a
       faint top rim-light so the panel reads as layered glass. */
    box-shadow:
      0 24px 70px -16px rgba(0, 0, 0, 0.85),
      0 6px 20px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    display: grid;
    gap: 14px;
    animation: sheet-rise 180ms ease-out;
    outline: none;
    max-height: 92dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    transition: transform 140ms ease-out;
    touch-action: pan-y;
  }
  .sheet.dragging {
    animation: none;
    transition: none;
  }
  @keyframes sheet-rise {
    from { transform: translateY(20px); opacity: 0.6; }
    to   { transform: translateY(0);    opacity: 1;   }
  }
  .grab {
    width: 36px;
    height: 4px;
    margin: 2px auto 6px;
    background: var(--border);
    border-radius: 2px;
  }
  .sheet-title {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-body);
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .sheet-subtitle {
    font-family: var(--font-body, inherit);
    font-size: var(--text-small);
    font-weight: 400;
    color: var(--text-light, var(--text-secondary));
    letter-spacing: 0.01em;
  }
  /* Tablet+ — centred modal. Aligned to canonical {640, 1024} breakpoints. */
  @media (min-width: 641px) {
    .sheet {
      bottom: auto;
      top: 50%;
      transform: translateY(-50%);
      border: 1px solid var(--border);
      animation: sheet-fade 140ms ease-out;
    }
    @keyframes sheet-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .grab { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .sheet { animation: none; }
  }
</style>
