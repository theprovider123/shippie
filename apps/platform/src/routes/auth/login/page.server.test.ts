import { describe, expect, test, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions, load } from './+page.server';

const mocks = vi.hoisted(() => ({
  mintVerificationToken: vi.fn(),
  sendMagicLink: vi.fn(async () => {}),
  checkMagicLinkRateLimit: vi.fn(async () => ({ ok: true, remaining: 2, retryAfterMs: 0 })),
  createGitHub: vi.fn(() => ({
    createAuthorizationURL: () => new URL('https://github.com/login/oauth/authorize?client_id=test'),
  })),
}));

vi.mock('$server/auth/verification-tokens', () => ({
  mintVerificationToken: mocks.mintVerificationToken,
}));

vi.mock('$server/auth/email', () => ({
  sendMagicLink: mocks.sendMagicLink,
}));

vi.mock('$server/auth/env', () => ({
  getAuthSecret: () => 'test-auth-secret',
}));

vi.mock('$server/auth/rate-limit', () => ({
  checkMagicLinkRateLimit: mocks.checkMagicLinkRateLimit,
}));

vi.mock('$server/auth/github', () => ({
  GitHubNotConfiguredError: class GitHubNotConfiguredError extends Error {},
  createGitHub: mocks.createGitHub,
}));

vi.mock('$server/auth/google', () => ({
  isGoogleConfigured: () => false,
}));

function emailActionEvent(returnTo = '/dashboard?claim_trial=trial-abcd1234') {
  const form = new FormData();
  form.set('email', 'maker@example.com');
  const url = new URL('https://shippie.app/auth/login');
  url.searchParams.set('return_to', returnTo);
  return {
    request: new Request(
      url.toString(),
      { method: 'POST', body: form },
    ),
    platform: {
      env: {
        DB: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    },
    url,
  } as never;
}

describe('/auth/login email action', () => {
  test('marks protected dashboard urls as maker sign-in', async () => {
    const url = new URL('https://shippie.app/auth/login');
    url.searchParams.set('return_to', '/dashboard?smoke=footer2');

    const result = await load({
      locals: {},
      platform: { env: { SHIPPIE_ENV: 'production' } },
      url,
    } as never);

    expect(result).toMatchObject({
      returnTo: '/dashboard?smoke=footer2',
      continueTo: '/dock',
      intent: 'maker',
      requiresAccount: true,
    });
  });

  test('marks /maker urls as maker sign-in and preserves the target', async () => {
    const url = new URL('https://shippie.app/auth/login');
    url.searchParams.set('return_to', '/maker/apps/my-app');

    const result = await load({
      locals: {},
      platform: { env: { SHIPPIE_ENV: 'production' } },
      url,
    } as never);

    expect(result).toMatchObject({
      returnTo: '/maker/apps/my-app',
      intent: 'maker',
      requiresAccount: true,
    });
  });

  test('email magic link carries a /maker return target', async () => {
    mocks.mintVerificationToken.mockResolvedValueOnce({ token: 'token-maker' });

    const result = await actions.email(emailActionEvent('/maker/apps/my-app'));

    expect(result).toEqual({ success: true, email: 'maker@example.com' });
    expect(mocks.sendMagicLink).toHaveBeenCalledWith({
      to: 'maker@example.com',
      url: 'https://shippie.app/auth/email-link/token-maker?return_to=%2Fmaker%2Fapps%2Fmy-app',
      env: {
        DB: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    });
  });

  test('github action stores the /maker return target for the OAuth round-trip', async () => {
    const cookies = { set: vi.fn() };
    const url = new URL('https://shippie.app/auth/login');
    url.searchParams.set('return_to', '/maker/apps/my-app');

    let redirected: { status: number } | undefined;
    try {
      await actions.github({
        platform: { env: { SHIPPIE_ENV: 'production', GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' } },
        cookies,
        url,
      } as never);
    } catch (err) {
      if (isRedirect(err)) redirected = { status: err.status };
      else throw err;
    }

    expect(redirected?.status).toBe(302);
    expect(cookies.set).toHaveBeenCalledWith('auth_return_to', '/maker/apps/my-app', expect.any(Object));
  });

  test('marks protected admin urls as admin sign-in', async () => {
    const url = new URL('https://shippie.app/auth/login');
    url.searchParams.set('return_to', '/admin?view=apps');

    const result = await load({
      locals: {},
      platform: { env: { SHIPPIE_ENV: 'production' } },
      url,
    } as never);

    expect(result).toMatchObject({
      returnTo: '/admin?view=apps',
      continueTo: '/dock',
      intent: 'admin',
      requiresAccount: true,
    });
  });

  test('preserves return_to in the magic link', async () => {
    mocks.mintVerificationToken.mockResolvedValueOnce({ token: 'token-123' });

    const result = await actions.email(emailActionEvent());

    expect(result).toEqual({ success: true, email: 'maker@example.com' });
    expect(mocks.sendMagicLink).toHaveBeenCalledWith({
      to: 'maker@example.com',
      url: 'https://shippie.app/auth/email-link/token-123?return_to=%2Fdashboard%3Fclaim_trial%3Dtrial-abcd1234',
      env: {
        DB: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    });
  });

  test('drops external return_to targets from magic links', async () => {
    mocks.mintVerificationToken.mockResolvedValueOnce({ token: 'token-456' });

    const result = await actions.email(emailActionEvent('https://evil.example/you'));

    expect(result).toEqual({ success: true, email: 'maker@example.com' });
    expect(mocks.sendMagicLink).toHaveBeenCalledWith({
      to: 'maker@example.com',
      url: 'https://shippie.app/auth/email-link/token-456',
      env: {
        DB: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    });
  });
});
