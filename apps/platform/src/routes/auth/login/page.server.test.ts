import { describe, expect, test, vi } from 'vitest';
import { actions } from './+page.server';

const mocks = vi.hoisted(() => ({
  mintVerificationToken: vi.fn(),
  sendMagicLink: vi.fn(async () => {}),
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

vi.mock('$server/auth/github', () => ({
  GitHubNotConfiguredError: class GitHubNotConfiguredError extends Error {},
  createGitHub: () => {
    throw new Error('not used');
  },
}));

vi.mock('$server/auth/google', () => ({
  isGoogleConfigured: () => false,
}));

function emailActionEvent() {
  const form = new FormData();
  form.set('email', 'maker@example.com');
  return {
    request: new Request(
      'https://shippie.app/auth/login?return_to=%2Fdashboard%3Fclaim_trial%3Dtrial-abcd1234',
      { method: 'POST', body: form },
    ),
    platform: {
      env: {
        DB: {},
        PUBLIC_ORIGIN: 'https://shippie.app',
      },
    },
    url: new URL('https://shippie.app/auth/login?return_to=%2Fdashboard%3Fclaim_trial%3Dtrial-abcd1234'),
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
});
