// Local shim for `bun:test` — apps/web uses Bun as its test runner but we
// intentionally avoid installing @types/bun here because it overrides the
// global `fetch` type and breaks Next.js typings.
//
// This shim covers the small slice of the bun:test API used by this app's
// tests. Extend as needed.
declare module 'bun:test' {
  type Fn = () => unknown | Promise<unknown>;
  export const beforeEach: (fn: Fn) => void;
  export const afterEach: (fn: Fn) => void;
  export const beforeAll: (fn: Fn) => void;
  export const afterAll: (fn: Fn) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const test: ((name: string, fn: Fn) => void) & {
    each: <T extends readonly unknown[]>(cases: readonly T[]) => (name: string, fn: (...args: T) => unknown | Promise<unknown>) => void;
    skip: (name: string, fn: Fn) => void;
    only: (name: string, fn: Fn) => void;
  };
  export const it: typeof test;
  interface Matchers<R> {
    toBe: (expected: unknown) => R;
    toEqual: (expected: unknown) => R;
    toBeNull: () => R;
    toBeUndefined: () => R;
    toBeDefined: () => R;
    toBeTruthy: () => R;
    toBeFalsy: () => R;
    toContain: (expected: unknown) => R;
    toHaveLength: (n: number) => R;
    toHaveProperty: (key: string, value?: unknown) => R;
    toThrow: (message?: string | RegExp) => R;
    resolves: Matchers<Promise<R>>;
    rejects: Matchers<Promise<R>>;
    not: Matchers<R>;
  }
  export function expect<T = unknown>(value: T): Matchers<void>;
}
