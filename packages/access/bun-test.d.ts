declare module 'bun:test' {
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: <T>(v: T) => {
    toBe(v: unknown): void;
    toBeNull(): void;
    toBeDefined(): void;
    toEqual(v: unknown): void;
    toContain(v: unknown): void;
    toMatch(v: RegExp | string): void;
    toHaveLength(n: number): void;
    not: {
      toBeNull(): void;
      toContain(v: unknown): void;
    };
  };
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
}
