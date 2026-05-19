import { useEffect, useRef, useState, useCallback } from 'react';
import type { IntentLike, IntentMatcher, ToastSpec } from './types';

type QueueOpts = {
  autoDismissMs?: number;
  onVisible?: (toast: ToastSpec) => void;
  now?: () => number;
};

const DEFAULT_DISMISS = 4000;
const GLOBAL_WINDOW_MS = 30_000;
const GLOBAL_CAP = 3;

export function createToastQueue(opts: QueueOpts = {}) {
  const now = opts.now ?? (() => Date.now());
  const lastByKind = new Map<string, number>();
  const recentTimestamps: number[] = [];
  let current: ToastSpec | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  const trim = () => {
    const cutoff = now() - GLOBAL_WINDOW_MS;
    while (recentTimestamps.length && recentTimestamps[0]! < cutoff) recentTimestamps.shift();
  };

  function push(matcher: IntentMatcher, intent: IntentLike): boolean {
    const t = now();
    const throttle = matcher.throttleMs ?? GLOBAL_WINDOW_MS;
    const last = lastByKind.get(matcher.kind) ?? -Infinity;
    if (t - last < throttle) return false;
    trim();
    if (recentTimestamps.length >= GLOBAL_CAP) return false;

    const spec = matcher.toast(intent);
    lastByKind.set(matcher.kind, t);
    recentTimestamps.push(t);
    current = spec;
    opts.onVisible?.(spec);
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      current = null;
    }, opts.autoDismissMs ?? DEFAULT_DISMISS);
    return true;
  }

  function peek() {
    return current;
  }

  function dismiss() {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    current = null;
  }

  return { push, peek, dismiss };
}

export function useToastQueue(opts: QueueOpts = {}) {
  const [visible, setVisible] = useState<ToastSpec | null>(null);
  const queueRef = useRef<ReturnType<typeof createToastQueue> | null>(null);

  if (!queueRef.current) {
    queueRef.current = createToastQueue({ ...opts, onVisible: setVisible });
  }

  const push = useCallback((matcher: IntentMatcher, intent: IntentLike) => {
    return queueRef.current!.push(matcher, intent);
  }, []);

  const dismiss = useCallback(() => {
    queueRef.current!.dismiss();
    setVisible(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(null), opts.autoDismissMs ?? DEFAULT_DISMISS);
    return () => clearTimeout(t);
  }, [visible, opts.autoDismissMs]);

  return { visible, push, dismiss };
}
