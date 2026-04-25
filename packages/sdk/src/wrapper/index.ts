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

export {
  wrapNavigation,
  supportsViewTransitions,
  installViewTransitionStyles,
  type ViewTransitionKind,
  type ViewTransitionOptions,
} from './view-transitions.ts';

export {
  attachBackSwipe,
  attachPullToRefresh,
  type BackSwipeOptions,
  type PullToRefreshOptions,
} from './gestures.ts';

export {
  attachSemanticHaptics,
  haptic,
  type HapticKind,
  type SemanticHapticsOptions,
} from './haptics.ts';

export {
  animateSpring,
  springFrames,
  type SpringFrame,
  type SpringOptions,
  type SpringUpdate,
} from './spring.ts';

export { setThemeColor } from './theme-color.ts';

export { mountUpdateToast, unmountUpdateToast, type UpdateToastProps } from './update-toast.ts';

export {
  mountHandoffSheet,
  unmountHandoffSheet,
  type HandoffSheetProps,
} from './handoff-sheet.ts';

export {
  subscribePush,
  unsubscribePush,
  pushSupported,
  type PushEndpoints,
  type SubscribeResult,
} from './push.ts';

export { renderQrSvg, type QrOptions } from './qr.ts';

export {
  observeWebVitals,
  type VitalName,
  type VitalSample,
  type WebVitalsOptions,
} from './web-vitals.ts';

export {
  captureReferral,
  readStoredReferral,
  clearReferral,
  buildInviteLink,
  type CaptureOptions,
  type CapturedRef,
  type InviteLinkOptions,
} from './referral.ts';

export {
  startObserve,
  registerRule,
  listRules,
  disableRule,
  hasCapability,
  compileEnhanceConfig,
  isEnhanceable,
  onShareReceive,
  type EnhanceRule,
  type EnhanceConfig,
  type Capability,
  type RuleBudget,
} from './observe/index.ts';

export { bootstrapObserve } from './observe-init.ts';
export { openYourData, type YourDataPanelOptions } from './your-data-panel.ts';
export {
  openGroupModerationPanel,
  type OpenGroupModerationPanelOptions,
  type GroupModerationPanelHandle,
  type ModerationPanelHook,
  type ModerationPanelMode,
  type PanelPendingMessage,
} from './group-moderation-panel.ts';
