declare module 'bun:test' {
  type Fn = () => unknown | Promise<unknown>;
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: Fn) => void;
  interface Matchers<R> {
    toBe: (expected: unknown) => R;
    toEqual: (expected: unknown) => R;
  }
  export function expect<T = unknown>(value: T): Matchers<void>;
}
