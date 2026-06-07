import { describe, expect, test } from 'vitest';
import { sanitizeBeaconAnalyticsEvents } from './beacon';
import { sanitizeInstallAnalyticsEvent } from './install';

describe('wrapper analytics privacy helpers', () => {
  test('install attribution strips identity and exact device details', () => {
    const { eventName, event } = sanitizeInstallAnalyticsEvent({
      event: 'a2hs_accepted',
      outcome: 'accepted',
      user_id: 'user-123',
      session_id: 'anon_session-1',
      properties: {
        mode: 'mobile',
        width: 390,
        userAgent: 'Mozilla/5.0',
        email: 'person@example.com',
      },
    });

    expect(eventName).toBe('install_a2hs_accepted');
    expect(event).toEqual({
      eventName: 'install_a2hs_accepted',
      sessionId: 'anon_session-1',
      userId: null,
      url: null,
      referrer: null,
      properties: {
        outcome: 'accepted',
        mode: 'mobile',
      },
    });
  });

  test('beacon ingestion keeps only sanitized aggregate fields', () => {
    const events = sanitizeBeaconAnalyticsEvents([
      {
        event_name: 'app_open',
        session_id: 'anon_session-2',
        user_id: 'user-123',
        url: '/private/path',
        referrer: 'https://example.com',
        properties: {
          device_class: 'desktop',
          screenWidth: 2560,
          token: 'secret',
          category: 'tools',
        },
      },
      {
        event_name: 'Saved a thing with spaces',
        properties: { category: 'bad' },
      },
    ]);

    expect(events).toEqual([
      {
        eventName: 'app_open',
        sessionId: 'anon_session-2',
        userId: null,
        url: null,
        referrer: null,
        properties: {
          device_class: 'desktop',
          category: 'tools',
        },
      },
    ]);
  });
});
