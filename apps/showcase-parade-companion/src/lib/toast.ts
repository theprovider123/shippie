/**
 * Tiny in-process toast bus. One-slot-at-a-time queued; auto-dismiss after
 * TOAST_TTL_MS. Replaces the persistent `inline-status` paragraph pattern
 * with a transient, multimodal feedback affordance.
 */

export type ToastVariant = 'default' | 'success' | 'warn';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

type Listener = (toasts: Toast[]) => void;

const TOAST_TTL_MS = 2500;
const MAX_QUEUE = 3;

let queue: Toast[] = [];
let listeners: Listener[] = [];

function emit(): void {
  for (const listener of listeners) listener(queue);
}

export function showToast(message: string, variant: ToastVariant = 'default'): string {
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  queue = [{ id, message, variant }, ...queue].slice(0, MAX_QUEUE);
  emit();
  setTimeout(() => dismissToast(id), TOAST_TTL_MS);
  return id;
}

export function dismissToast(id: string): void {
  const next = queue.filter((t) => t.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners = [...listeners, listener];
  listener(queue);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
