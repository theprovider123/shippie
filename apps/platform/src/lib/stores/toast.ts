/**
 * Platform-wide toast store. Use anywhere with:
 *
 *   import { toast } from '$lib/stores/toast';
 *   toast.push({ kind: 'success', message: 'Visibility set to public' });
 *   toast.push({ kind: 'error',   message: 'Could not save', durationMs: 6000 });
 *   toast.push({ kind: 'info',    message: 'New version available · Tap to refresh',
 *                action: { label: 'Refresh', run: () => location.reload() },
 *                durationMs: 0 }); // 0 = sticky until tapped or dismissed
 *
 * Render once at the root with `<Toast />` from `$lib/components/ui/Toast.svelte`.
 */
import { writable, type Readable } from 'svelte/store';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastInput {
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. 0 = sticky. Default 4000. */
  durationMs?: number;
  /** Optional inline action button. */
  action?: { label: string; run: () => void } | undefined;
}

export interface Toast extends Required<Omit<ToastInput, 'action'>> {
  id: string;
  action: { label: string; run: () => void } | null;
  createdAt: number;
}

const DEFAULT_DURATION_MS = 4000;

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
      createdAt: Date.now()
    };
    inner.update((list) => [...list, toast]);
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
