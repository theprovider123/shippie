declare module 'bun:test' {
  export const beforeEach: (fn: () => unknown | Promise<unknown>) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: () => unknown | Promise<unknown>) => void;
  export const expect: (value: unknown) => {
    resolves: { toBeUndefined: () => Promise<void> };
    rejects: { toThrow: (message?: string) => Promise<void> };
  };
}
