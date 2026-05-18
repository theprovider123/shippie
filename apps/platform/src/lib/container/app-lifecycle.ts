export const SHIPPIE_APP_LIFECYCLE_EVENT = 'shippie:app-lifecycle' as const;

export type AppLifecycleEventName = 'booting' | 'ready' | 'error' | 'navigation' | 'heartbeat';

export interface AppLifecycleMessage {
  type: typeof SHIPPIE_APP_LIFECYCLE_EVENT;
  version: 1;
  event: AppLifecycleEventName;
  source?: string;
  appId?: string;
  at?: number;
  path?: string;
  href?: string;
  title?: string;
  canGoBack?: boolean;
  navDepth?: number;
  timing?: Record<string, number>;
  error?: { message?: string; name?: string; stack?: string };
}

const VIEW_TRANSITION_ERROR_RE = /view transition|transition/i;
const RECOVERABLE_TRANSITION_ERROR_RE = /timed out|timeout|skipped|aborted|interrupted/i;
const RETRYABLE_LOAD_ERROR_RE =
  /asset failed to load|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk|module script|load failed/i;

export function parseAppLifecycleMessage(value: unknown): AppLifecycleMessage | null {
  const message = value as Partial<AppLifecycleMessage> | null;
  if (!message || message.type !== SHIPPIE_APP_LIFECYCLE_EVENT) return null;
  if (message.version !== 1) return null;
  if (!isLifecycleEvent(message.event)) return null;
  return {
    type: SHIPPIE_APP_LIFECYCLE_EVENT,
    version: 1,
    event: message.event,
    source: typeof message.source === 'string' ? message.source : undefined,
    appId: typeof message.appId === 'string' ? message.appId : undefined,
    at: typeof message.at === 'number' ? message.at : undefined,
    path: typeof message.path === 'string' ? message.path : undefined,
    href: typeof message.href === 'string' ? message.href : undefined,
    title: typeof message.title === 'string' ? message.title : undefined,
    canGoBack: typeof message.canGoBack === 'boolean' ? message.canGoBack : undefined,
    navDepth: typeof message.navDepth === 'number' ? message.navDepth : undefined,
    timing: isNumberRecord(message.timing) ? message.timing : undefined,
    error: normalizeLifecycleMessageError(message.error),
  };
}

export function appLifecycleErrorMessage(message: AppLifecycleMessage): string {
  const error = message.error?.message?.trim();
  return error || 'The app reported a startup error.';
}

export function isRecoverableAppLifecycleError(message: AppLifecycleMessage): boolean {
  const error = message.error;
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return VIEW_TRANSITION_ERROR_RE.test(text) && RECOVERABLE_TRANSITION_ERROR_RE.test(text);
}

export function isRetryableAppLifecycleError(message: AppLifecycleMessage): boolean {
  const error = message.error;
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return RETRYABLE_LOAD_ERROR_RE.test(text);
}

function isLifecycleEvent(value: unknown): value is AppLifecycleEventName {
  return (
    value === 'booting' ||
    value === 'ready' ||
    value === 'error' ||
    value === 'navigation' ||
    value === 'heartbeat'
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'number');
}

function normalizeLifecycleMessageError(value: unknown): AppLifecycleMessage['error'] {
  if (!value || typeof value !== 'object') return undefined;
  const error = value as { message?: unknown; name?: unknown; stack?: unknown };
  return {
    message: typeof error.message === 'string' ? error.message : undefined,
    name: typeof error.name === 'string' ? error.name : undefined,
    stack: typeof error.stack === 'string' ? error.stack : undefined,
  };
}
