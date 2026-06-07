import { describe, expect, test, vi, beforeEach } from 'vitest';
import { GET } from './+server';

const mocks = vi.hoisted(() => ({
  ensureDemoSignIn: vi.fn(async () => ({
    userId: 'user-demo-sarah',
    instanceId: 'instance-st-judes',
    slug: 'st-judes-and-st-paul',
    provisioned: false,
  })),
  createLucia: vi.fn(() => ({
    createSession: vi.fn(async () => ({ id: 'session-demo' })),
    createSessionCookie: vi.fn(() => ({
      name: 'shippie_session',
      value: 'cookie-value',
      attributes: {
        path: '/',
        secure: true,
        sameSite: 'lax',
      },
    })),
  })),
}));

vi.mock('$server/cloudlet/demo-login', () => ({
  ensureDemoSignIn: mocks.ensureDemoSignIn,
}));

vi.mock('$server/auth/lucia', () => ({
  createLucia: mocks.createLucia,
}));

function eventFor(input: {
  code?: string;
  expected?: string;
  returnTo?: string;
  envOverrides?: Record<string, unknown>;
}) {
  const url = new URL('https://shippie.app/uniti/demo');
  if (input.code) url.searchParams.set('code', input.code);
  if (input.returnTo) url.searchParams.set('return_to', input.returnTo);

  return {
    url,
    cookies: { set: vi.fn() },
    platform: {
      env: {
        DB: { binding: 'd1' },
        SCHOOL_WORKSPACE: { binding: 'do' },
        SHIPPIE_ENV: 'production',
        UNITI_DEMO_CODE: input.expected ?? 'correct-demo-code-2026',
        ...input.envOverrides,
      },
    },
  } as unknown as Parameters<typeof GET>[0];
}

describe('/uniti/demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('hides the route when the demo code is missing', async () => {
    let caught: unknown;
    try {
      await GET(eventFor({ code: 'correct-demo-code-2026', envOverrides: { UNITI_DEMO_CODE: undefined } }));
    } catch (err) {
      caught = err;
    }

    expect((caught as { status?: number })?.status).toBe(404);
    expect(mocks.ensureDemoSignIn).not.toHaveBeenCalled();
  });

  test('hides the route when the supplied code is wrong', async () => {
    let caught: unknown;
    try {
      await GET(eventFor({ code: 'wrong-code' }));
    } catch (err) {
      caught = err;
    }

    expect((caught as { status?: number })?.status).toBe(404);
    expect(mocks.ensureDemoSignIn).not.toHaveBeenCalled();
  });

  test('reports configuration errors after a valid code', async () => {
    let caught: unknown;
    try {
      await GET(eventFor({ code: 'correct-demo-code-2026', envOverrides: { SCHOOL_WORKSPACE: undefined } }));
    } catch (err) {
      caught = err;
    }

    expect((caught as { status?: number })?.status).toBe(503);
    expect(mocks.ensureDemoSignIn).not.toHaveBeenCalled();
  });

  test('signs Sarah in and redirects into Uniti when the code is valid', async () => {
    const event = eventFor({ code: 'correct-demo-code-2026', returnTo: '/uniti/leadership' });

    let caught: unknown;
    try {
      await GET(event);
    } catch (err) {
      caught = err;
    }

    expect(mocks.ensureDemoSignIn).toHaveBeenCalledWith({
      d1: { binding: 'd1' },
      schoolWorkspaceNs: { binding: 'do' },
    });
    expect(mocks.createLucia).toHaveBeenCalledWith(
      { binding: 'd1' },
      expect.objectContaining({ SHIPPIE_ENV: 'production' }),
    );
    expect(event.cookies.set).toHaveBeenCalledWith(
      'shippie_session',
      'cookie-value',
      expect.objectContaining({ path: '/' }),
    );
    expect((caught as { status?: number; location?: string })?.status).toBe(303);
    expect((caught as { status?: number; location?: string })?.location).toBe('/uniti/leadership');
  });
});
