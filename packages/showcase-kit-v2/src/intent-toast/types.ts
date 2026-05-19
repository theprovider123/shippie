export type IntentLike = {
  kind: string;
  payload?: Record<string, unknown>;
  sourceAppId?: string;
  timestamp?: number;
};

export type ToastSpec = {
  title: string;
  body?: string;
  href?: string;
  icon?: string;
};

export type IntentMatcher = {
  kind: string;
  toast: (intent: IntentLike) => ToastSpec;
  throttleMs?: number;
};

export type IntentSubscription = {
  subscribe: (cb: (intent: IntentLike) => void) => () => void;
};

export type IntentToastHostProps = {
  matchers: IntentMatcher[];
  source: IntentSubscription;
  position?: 'top' | 'bottom';
  autoDismissMs?: number;
};
