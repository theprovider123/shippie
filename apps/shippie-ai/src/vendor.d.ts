/**
 * Ambient declarations for third-party modules that are installed at the
 * Vite/npm layer but aren't strictly necessary for typechecking the
 * core inference + router code.
 *
 * Once `bun install` runs in this workspace these modules will resolve
 * normally and these stubs will be ignored (real types take precedence).
 */
declare module '@huggingface/transformers';
declare module 'workbox-precaching' {
  export function precacheAndRoute(manifest: unknown): void;
}
declare module 'workbox-routing' {
  export function registerRoute(matcher: unknown, handler: unknown): void;
}
declare module 'workbox-strategies' {
  export class CacheFirst {
    constructor(opts: unknown);
  }
}
declare module 'workbox-expiration' {
  export class ExpirationPlugin {
    constructor(opts: unknown);
  }
}
declare module 'react' {
  export const StrictMode: any;
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
}
declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export const jsx: any;
  export const jsxs: any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: unknown): void };
}

declare const __WB_MANIFEST: Array<{ revision: string | null; url: string }>;

// Minimal JSX shim so tsc passes without @types/react installed yet. Once
// `bun install` runs, @types/react's JSX.IntrinsicElements supersedes this.
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface Element {
    [key: string]: any;
  }
  interface ElementClass {
    [key: string]: any;
  }
  interface ElementAttributesProperty {
    props: unknown;
  }
  interface IntrinsicAttributes {
    [key: string]: any;
  }
}
