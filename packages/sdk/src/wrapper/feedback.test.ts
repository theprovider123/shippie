import { describe, expect, test } from 'bun:test';
import {
  buildFeedback,
  ALLOWED_FEEDBACK_FIELDS,
  ALLOWED_CONTEXT_FIELDS,
  ALLOWED_RATING_FIELDS,
} from './feedback.ts';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_SLUG = 'recipe-saver';

function mk(overrides: Record<string, unknown> = {}, raw: Record<string, unknown> = {}) {
  return buildFeedback({
    threadId: VALID_UUID,
    appSlug: VALID_SLUG,
    kind: 'idea',
    message: 'I love offline mode',
    raw,
    ...overrides,
  });
}

describe('buildFeedback — header validation', () => {
  test('rejects non-uuid threadId', () => {
    expect(buildFeedback({ threadId: 'bad', appSlug: VALID_SLUG, kind: 'idea', message: 'x' })).toBeNull();
  });
  test('rejects bad slug', () => {
    expect(buildFeedback({ threadId: VALID_UUID, appSlug: 'NOT VALID', kind: 'idea', message: 'x' })).toBeNull();
  });
  test('rejects unknown kind', () => {
    expect(buildFeedback({ threadId: VALID_UUID, appSlug: VALID_SLUG, kind: 'rant', message: 'x' })).toBeNull();
  });
  test('rejects empty message', () => {
    expect(buildFeedback({ threadId: VALID_UUID, appSlug: VALID_SLUG, kind: 'idea', message: '' })).toBeNull();
  });
  test('accepts a clean payload', () => {
    const p = mk();
    expect(p).toBeTruthy();
    expect(p?.message).toBe('I love offline mode');
  });
});

describe('schema allowlist — top level', () => {
  test('only allowlisted fields in payload', () => {
    const p = mk({}, { somethingExtra: 'x', userId: 'a@b.c' })!;
    for (const key of Object.keys(p)) {
      expect(ALLOWED_FEEDBACK_FIELDS as readonly string[]).toContain(key);
    }
  });
});

describe('schema allowlist — context', () => {
  test('keeps allowlisted context fields', () => {
    const p = mk(
      {},
      {
        context: {
          appVersion: 7,
          route: '/recipes/:id',
          deviceClass: 'mid',
          sessionDepth: 47,
          // Forbidden:
          ip: '127.0.0.1',
          installedAt: '2026-04-04',
          userId: 'a@b.c',
        },
      },
    )!;
    expect(p.context?.appVersion).toBe(7);
    expect(p.context?.route).toBe('/recipes/:id');
    expect(p.context?.deviceClass).toBe('mid');
    expect(p.context?.sessionDepth).toBe(47);
    for (const key of Object.keys(p.context ?? {})) {
      expect(ALLOWED_CONTEXT_FIELDS as readonly string[]).toContain(key);
    }
  });

  test('strips concrete IDs from route', () => {
    const p = mk({}, { context: { route: '/recipes/carbonara-secret' } })!;
    expect(p.context?.route).toBeUndefined();
  });

  test('strips routes with query strings', () => {
    const p = mk({}, { context: { route: '/?q=secret' } })!;
    expect(p.context?.route).toBeUndefined();
  });

  test('rejects bogus deviceClass', () => {
    const p = mk({}, { context: { deviceClass: 'extra-tall' } })!;
    expect(p.context?.deviceClass).toBeUndefined();
  });
});

describe('schema allowlist — ratings', () => {
  test('keeps 1-5 dimensional ratings', () => {
    const p = mk(
      {},
      { ratings: { easy: 4, useful: 5, fast: 5, beautiful: 3, vibes: 10 } },
    )!;
    expect(p.ratings?.easy).toBe(4);
    expect(p.ratings?.useful).toBe(5);
    for (const key of Object.keys(p.ratings ?? {})) {
      expect(ALLOWED_RATING_FIELDS as readonly string[]).toContain(key);
    }
  });

  test('strips ratings outside 1-5', () => {
    const p = mk({}, { ratings: { easy: 0, useful: 6, fast: -1 } })!;
    expect(p.ratings).toBeUndefined();
  });
});

describe('redactMessage — secret stripping', () => {
  test('strips JWT-shaped tokens from message', () => {
    const p = mk({
      message:
        'Bug: app crashes when I paste eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U into the form',
    })!;
    expect(p.message).not.toContain('eyJhbG');
    expect(p.message).toContain('[redacted]');
  });

  test('strips Stripe sk_live keys', () => {
    const p = mk({ message: 'My key sk_live_FAKEFAKEFAKEFAKEFAKE000 leaked' })!;
    expect(p.message).not.toContain('sk_live_F');
    expect(p.message).toContain('[redacted]');
  });

  test('strips AWS access keys', () => {
    const p = mk({ message: 'My AKIAIOSFODNN7EXAMPLE access key' })!;
    expect(p.message).not.toContain('AKIAIOSFODNN');
  });

  test('strips OpenAI sk- keys', () => {
    const p = mk({ message: 'sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ' })!;
    expect(p.message).not.toContain('sk-proj-aBcDeFgH');
  });

  test('caps absurdly long messages', () => {
    const p = mk({ message: 'x'.repeat(10_000) })!;
    expect(p.message.length).toBeLessThanOrEqual(2001);
  });
});

describe('serialized payload — no forbidden anywhere', () => {
  test('full attack input yields a clean payload', () => {
    const p = mk(
      {},
      {
        // Forbidden:
        userId: 'a@b.c',
        email: 'a@b.c',
        deviceId: 'persistent-uuid',
        ip: '127.0.0.1',
        country: 'GB',
        context: {
          appVersion: 7,
          route: '/recipes/:id',
          deviceClass: 'mid',
          sessionDepth: 47,
          // Forbidden in context:
          email: 'b@c.d',
          installedAt: '2026-04-04',
        },
        ratings: { easy: 4, beautiful: 3, secret: 'x' },
      },
    )!;
    const json = JSON.stringify(p);
    const forbiddenStrings = [
      'a@b.c',
      'b@c.d',
      'persistent-uuid',
      '127.0.0.1',
      'GB',
      'installedAt',
      'userId',
      'email',
      'deviceId',
    ];
    for (const s of forbiddenStrings) {
      expect(json.includes(s)).toBe(false);
    }
  });
});
