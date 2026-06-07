declare module 'bun:test' {
  type Fn = () => unknown | Promise<unknown>;
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: Fn) => void;
  interface Matchers<R> {
    toBe: (expected: unknown) => R;
    toEqual: (expected: unknown) => R;
    toBeInstanceOf: (expected: unknown) => R;
    toBeGreaterThan: (expected: number) => R;
    toBeLessThan: (expected: number) => R;
    toBeCloseTo: (expected: number, numDigits?: number) => R;
    toMatch: (expected: string | RegExp) => R;
    toBeTruthy: () => R;
    toBeFalsy: () => R;
    toContain: (expected: unknown) => R;
    toHaveLength: (expected: number) => R;
    toMatchObject: (expected: unknown) => R;
    toThrow: (message?: string | RegExp) => R;
    readonly not: Matchers<R>;
  }
  export function expect<T = unknown>(value: T): Matchers<void>;
}
