import { describe, expect, test } from 'vitest';
import {
  sanitizeAnalyticsEvent,
  sanitizeEventName,
  sanitizeProperties,
  sanitizeSessionId,
} from './sanitize';

describe('analytics sanitizer', () => {
  test('keeps aggregate-safe event fields', () => {
    expect(sanitizeAnalyticsEvent({
      event: 'recipe_saved',
      session_id: 'anon_abc-123',
      props: {
        source: 'container',
        focused: true,
        count: 3,
        category: 'Food',
      },
    })).toEqual({
      eventName: 'recipe_saved',
      sessionId: 'anon_abc-123',
      userId: null,
      url: null,
      referrer: null,
      properties: {
        source: 'container',
        focused: true,
        count: 3,
        category: 'Food',
      },
    });
  });

  test('drops raw identity, URLs, and sensitive property keys', () => {
    expect(sanitizeAnalyticsEvent({
      event_name: 'app_open',
      session_id: 'anon_abc-123',
      user_id: 'user-1',
      url: '/recipes/secret-carbonara?q=email@example.com',
      referrer: 'https://tracker.example/path',
      properties: {
        email: 'person@example.com',
        token: 'secret',
        note: 'typed private note',
        destination: 'https://example.com/private',
        source: 'launcher',
      },
    })).toEqual({
      eventName: 'app_open',
      sessionId: 'anon_abc-123',
      userId: null,
      url: null,
      referrer: null,
      properties: {
        source: 'launcher',
      },
    });
  });

  test('keeps coarse viewport class but drops exact device details', () => {
    expect(sanitizeAnalyticsEvent({
      event_name: 'app_open',
      session_id: 'anon_abc-123',
      properties: {
        mode: 'mobile',
        device_class: 'tablet',
        width: 390,
        height: 844,
        screenWidth: 1170,
        userAgent: 'Mozilla/5.0',
        deviceId: 'persistent-device-id',
      },
    })).toEqual({
      eventName: 'app_open',
      sessionId: 'anon_abc-123',
      userId: null,
      url: null,
      referrer: null,
      properties: {
        mode: 'mobile',
        device_class: 'tablet',
      },
    });
  });

  test('rejects free-form event names and unsafe session ids', () => {
    expect(sanitizeEventName('Saved a recipe with spaces')).toBeNull();
    expect(sanitizeEventName('recipe.saved:v1')).toBe('recipe.saved:v1');
    expect(sanitizeSessionId('anon ok')).toBeNull();
    expect(sanitizeSessionId('anon_ok-123')).toBe('anon_ok-123');
  });

  test('bounds nested properties', () => {
    expect(sanitizeProperties({
      nested: {
        safe_key: 'safe value',
        deeper: {
          still_safe: 1,
          tooDeep: { nope: true },
        },
      },
      items: ['one', 'two', 'person@example.com', 'https://example.com'],
    })).toEqual({
      nested: {
        safe_key: 'safe value',
        deeper: {
          still_safe: 1,
        },
      },
      items: ['one', 'two'],
    });
  });
});
