// packages/sdk/src/wrapper/index.ts
/**
 * @shippie/sdk/wrapper — the install funnel runtime.
 *
 * Consumers:
 *   - Maker apps via the Worker-served `/__shippie/sdk.js` bundle.
 *   - Shippie's own marketplace (apps/web) via npm import.
 *
 * All exports are pure functions and stateless UI renderers. Persistence
 * of `PromptState` is the caller's responsibility — use `serialize` /
 * `deserialize` to talk to localStorage or a signed cookie.
 */
export {
  detectPlatform,
  detectInstallMethod,
  detectIab,
  detectStandalone,
  readInstallContext,
  type Platform,
  type InstallMethod,
  type IabBrand,
  type InstallContext,
} from './detect.ts';

export {
  computePromptTier,
  recordVisit,
  recordDismissal,
  recordMeaningfulAction,
  addDwell,
  isDismissedRecently,
  serialize,
  deserialize,
  type PromptTier,
  type PromptState,
} from './install-prompt.ts';

export {
  buildBounceTarget,
  type BounceInput,
  type BounceTarget,
  type BounceScheme,
} from './iab-bounce.ts';

export {
  buildHandoffUrl,
  validateEmail,
  buildHandoffEmailPayload,
  type HandoffEmailPayload,
} from './handoff.ts';

export {
  mountInstallBanner,
  mountBounceSheet,
  unmountAll,
  type BannerProps,
  type BounceSheetProps,
} from './ui.ts';

export {
  startInstallRuntime,
  type StartInstallRuntimeConfig,
} from './install-runtime.ts';
