import { describe, expect, test } from 'vitest';
import {
  SHIPPIE_APP_LIFECYCLE_EVENT,
  appLifecycleErrorMessage,
  isRecoverableAppLifecycleError,
  isRetryableAppLifecycleError,
  parseAppLifecycleMessage,
} from './app-lifecycle';

describe('app lifecycle contract', () => {
  test('accepts v1 lifecycle messages', () => {
    const parsed = parseAppLifecycleMessage({
      type: SHIPPIE_APP_LIFECYCLE_EVENT,
      version: 1,
      event: 'ready',
      appId: 'crewtrip',
      canGoBack: true,
      timing: { sinceNavigationStartMs: 142 },
    });
    expect(parsed?.event).toBe('ready');
    expect(parsed?.appId).toBe('crewtrip');
    expect(parsed?.canGoBack).toBe(true);
    expect(parsed?.timing?.sinceNavigationStartMs).toBe(142);
  });

  test('rejects unknown event names and versions', () => {
    expect(parseAppLifecycleMessage({ type: SHIPPIE_APP_LIFECYCLE_EVENT, version: 2, event: 'ready' })).toBeNull();
    expect(parseAppLifecycleMessage({ type: SHIPPIE_APP_LIFECYCLE_EVENT, version: 1, event: 'painted' })).toBeNull();
  });

  test('normalizes app error copy', () => {
    const parsed = parseAppLifecycleMessage({
      type: SHIPPIE_APP_LIFECYCLE_EVENT,
      version: 1,
      event: 'error',
      error: { message: 'chunk failed' },
    });
    expect(parsed).not.toBeNull();
    expect(appLifecycleErrorMessage(parsed!)).toBe('chunk failed');
  });

  test('classifies view-transition timeouts as recoverable', () => {
    const parsed = parseAppLifecycleMessage({
      type: SHIPPIE_APP_LIFECYCLE_EVENT,
      version: 1,
      event: 'error',
      error: { message: 'View transition update callback timed out.' },
    });
    expect(parsed).not.toBeNull();
    expect(isRecoverableAppLifecycleError(parsed!)).toBe(true);
  });

  test('classifies stale asset failures as retryable', () => {
    const parsed = parseAppLifecycleMessage({
      type: SHIPPIE_APP_LIFECYCLE_EVENT,
      version: 1,
      event: 'error',
      error: { message: 'asset failed to load: /__shippie-run/coffee/assets/index.js' },
    });
    expect(parsed).not.toBeNull();
    expect(isRetryableAppLifecycleError(parsed!)).toBe(true);
  });
});
