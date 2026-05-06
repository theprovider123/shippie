/**
 * useYjs — read a derived value from a Y.Doc and re-render on every
 * remote/local change.
 *
 * IMPORTANT: useSyncExternalStore demands getSnapshot return the SAME
 * reference until something actually changed. We track a version
 * counter that bumps on each Y.Doc update, then memoise the latest
 * computed snapshot so React is happy.
 */
import { useRef, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

export function useYjs<T>(doc: Y.Doc, selector: (doc: Y.Doc) => T): T {
  const cacheRef = useRef<{ version: number; value: T } | null>(null);
  const versionRef = useRef(0);

  const subscribe = (cb: () => void) => {
    const handler = () => {
      versionRef.current += 1;
      cb();
    };
    doc.on('update', handler);
    return () => doc.off('update', handler);
  };

  const getSnapshot = (): T => {
    const v = versionRef.current;
    const cached = cacheRef.current;
    if (cached && cached.version === v) return cached.value;
    const value = selector(doc);
    cacheRef.current = { version: v, value };
    return value;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useTick(intervalMs = 1000): number {
  const tickRef = useRef(0);
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(() => {
        tickRef.current += 1;
        cb();
      }, intervalMs);
      return () => window.clearInterval(id);
    },
    () => tickRef.current,
    () => tickRef.current,
  );
}
