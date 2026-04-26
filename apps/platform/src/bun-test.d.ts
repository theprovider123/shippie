// Minimal Bun test type shim. The `bun test` runner provides these at
// runtime; this declaration keeps `tsc --noEmit` happy.
declare module 'bun:test' {
  export const describe: (name: string, fn: () => void | Promise<void>) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
  export const beforeAll: (fn: () => void | Promise<void>) => void;
  export const afterAll: (fn: () => void | Promise<void>) => void;

  type Matchers<T> = {
    toBe(v: unknown): void;
    toEqual(v: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(v: unknown): void;
    toContainEqual(v: unknown): void;
    toMatch(v: RegExp | string): void;
    toHaveLength(n: number): void;
    toHaveBeenCalled(): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThan(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    toHaveProperty(key: string, value?: unknown): void;
    toThrow(message?: string | RegExp | Error | (new (...args: unknown[]) => Error)): void;
    rejects: { toThrow(message?: string | RegExp | Error | (new (...args: unknown[]) => Error)): Promise<void> };
    resolves: Matchers<Awaited<T>>;
    not: Matchers<T>;
  };

  export const expect: <T>(value: T) => Matchers<T>;
  export const mock: <T extends (...args: unknown[]) => unknown>(impl?: T) => T & {
    mock: { calls: unknown[][] };
    mockReturnValue(v: unknown): unknown;
    mockResolvedValue(v: unknown): unknown;
  };
}
