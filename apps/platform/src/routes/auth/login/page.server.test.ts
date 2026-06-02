import { describe, expect, test, vi } from 'vitest';
import { actions } from './+page.server';

const mocks = vi.hoisted(() => ({
  mintVerificationToken: vi.fn(),
  sendMagicLink: vi.fn(async () => {}),
  checkMagicLinkRateLimit: vi.fn(async () => ({ ok: true, remaining: 2, retryAfterMs: 0 })),
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
  createGitHub: () => {
    throw new Error('not used');
  },
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
