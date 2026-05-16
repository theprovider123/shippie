declare module 'bun:test' {
  type Fn = () => unknown | Promise<unknown>;
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: Fn) => void;
  interface Matchers<R> {
    toBe: (expected: unknown) => R;
    toEqual: (expected: unknown) => R;
    toContain: (expected: unknown) => R;
    toThrow: (message?: string | RegExp) => R;
    toMatchObject: (expected: unknown) => R;
    rejects: Matchers<Promise<R>>;
    resolves: Matchers<Promise<R>>;
    not: Matchers<R>;
  }
  export function expect<T = unknown>(value: T): Matchers<void>;
}
