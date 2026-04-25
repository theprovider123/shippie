// Local shim for `bun:test` — this package uses Bun as its test runner
// but intentionally avoids installing @types/bun (which overrides the
// global `fetch` type used in production code paths).
//
// Matches the shim in apps/web and packages/cli. Extend as needed.
declare module 'bun:test' {
  type Fn = () => unknown | Promise<unknown>;
  export const beforeEach: (fn: Fn, timeoutMs?: number) => void;
  export const afterEach: (fn: Fn, timeoutMs?: number) => void;
  export const beforeAll: (fn: Fn, timeoutMs?: number) => void;
  export const afterAll: (fn: Fn, timeoutMs?: number) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const test: ((name: string, fn: Fn) => void) & {
    each: <T extends readonly unknown[]>(
      cases: readonly T[],
    ) => (name: string, fn: (...args: T) => unknown | Promise<unknown>) => void;
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
    toBeGreaterThan: (n: number) => R;
    toBeGreaterThanOrEqual: (n: number) => R;
    toBeLessThan: (n: number) => R;
    toBeLessThanOrEqual: (n: number) => R;
    toHaveProperty: (key: string, value?: unknown) => R;
    toThrow: (message?: string | RegExp) => R;
    toMatch: (pattern: RegExp | string) => R;
    resolves: Matchers<Promise<R>>;
    rejects: Matchers<Promise<R>>;
    not: Matchers<R>;
  }
  export function expect<T = unknown>(value: T): Matchers<void>;
}
