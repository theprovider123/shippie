/**
 * Container — Your Data panel host.
 *
 * Phase A5 surface. The wrapper-level Your Data panel exists at
 * `packages/sdk/src/wrapper/your-data-panel.ts`; A5 surfaces it from
 * `/container` via the `data.openPanel` bridge capability so iframe-loaded
 * apps can request the overlay through their bridge.
 *
 * The host is intentionally tiny: it tracks "is the overlay open" and
 * "which app asked", and delegates the actual render to a callback the
 * Svelte component supplies. That keeps the .svelte file as the single
 * authority on layout while letting bridge handlers stay reactive-free.
 */

export interface YourDataHostState {
  open: boolean;
  /** App id that triggered the open. Lets the panel scope per-app stats. */
  appId: string | null;
}

export interface YourDataHost {
  state: YourDataHostState;
  /** Open the panel scoped to a specific app. Idempotent for the same app. */
  openFor(appId: string): void;
  close(): void;
}

export interface YourDataHostOptions {
  /**
   * Called when the host opens or closes — the Svelte component uses this
   * to flip its `$state` and render the overlay. Pure factory keeps the
   * host free of Svelte runes for testability.
   */
  onChange: (state: YourDataHostState) => void;
}

export function createYourDataHost(options: YourDataHostOptions): YourDataHost {
  const state: YourDataHostState = { open: false, appId: null };
  return {
    state,
    openFor(appId: string) {
      state.open = true;
      state.appId = appId;
      options.onChange({ ...state });
    },
    close() {
      state.open = false;
      state.appId = null;
      options.onChange({ ...state });
    },
  };
}
