/**
 * Platform-wide toast store. Use anywhere with:
 *
 *   import { toast } from '$lib/stores/toast';
 *   toast.push({ kind: 'success', message: 'Visibility set to public' });
 *   toast.push({ kind: 'error',   message: 'Could not save', durationMs: 6000 });
 *   toast.push({ kind: 'info',    message: 'Restored safe copy',
 *                action: { label: 'Review', run: () => openReview() },
 *                durationMs: 0 }); // 0 = sticky until tapped or dismissed
 *
 * Render once at the root with `<Toast />` from `$lib/components/ui/Toast.svelte`.
 */
import { writable, type Readable } from 'svelte/store';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. 0 = sticky. Default 4000. */
  durationMs?: number;
  /** Optional inline action button (primary, e.g. "Refresh"). */
  action?: { label: string; run: () => void } | undefined;
  /**
   * Optional secondary action button. Rendered after the primary action;
   * closes the toast on tap.
   */
  secondaryAction?: { label: string; run: () => void } | undefined;
}

export interface Toast extends Required<Omit<ToastInput, 'action' | 'secondaryAction'>> {
  id: string;
  action: { label: string; run: () => void } | null;
  secondaryAction: { label: string; run: () => void } | null;
  createdAt: number;
}

const DEFAULT_DURATION_MS = 4000;
/**
 * Hard cap on simultaneous toasts. Past this we drop the oldest
 * non-sticky entry to make room — sticky toasts (durationMs === 0)
 * stay because they're usually user-action prompts that the caller
 * expects to outlive throughput bursts.
 */
const MAX_VISIBLE_TOASTS = 6;

interface ToastApi extends Readable<Toast[]> {
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

function createToastStore(): ToastApi {
  const inner = writable<Toast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function dismiss(id: string): void {
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    inner.update((list) => list.filter((x) => x.id !== id));
  }

  function push(input: ToastInput): string {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
    const toast: Toast = {
      id,
      kind: input.kind,
      message: input.message,
      durationMs,
      action: input.action ?? null,
      secondaryAction: input.secondaryAction ?? null,
      createdAt: Date.now()
    };
    inner.update((list) => {
      const next = [...list, toast];
      if (next.length <= MAX_VISIBLE_TOASTS) return next;
      // Evict the oldest non-sticky toast to keep the screen calm
      // under burst load. Sticky toasts (durationMs === 0) usually
      // gate a user action and shouldn't disappear silently.
      const dropIndex = next.findIndex((t, i) => i < next.length - 1 && t.durationMs > 0);
      if (dropIndex < 0) return next;
      const dropped = next[dropIndex];
      const evictTimer = timers.get(dropped.id);
      if (evictTimer) {
        clearTimeout(evictTimer);
        timers.delete(dropped.id);
      }
      return [...next.slice(0, dropIndex), ...next.slice(dropIndex + 1)];
    });
    if (durationMs > 0) {
      const handle = setTimeout(() => dismiss(id), durationMs);
      timers.set(id, handle);
    }
    return id;
  }

  function clear(): void {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    inner.set([]);
  }

  return {
    subscribe: inner.subscribe,
    push,
    dismiss,
    clear
  };
}

export const toast = createToastStore();
