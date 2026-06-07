import { describe, it, expect } from 'vitest';
import {
  isMicrosoftConfigured,
  createMicrosoft,
  MicrosoftNotConfiguredError,
} from './microsoft';

describe('microsoft SSO env-gating', () => {
  it('isMicrosoftConfigured is false when creds are absent', () => {
    expect(isMicrosoftConfigured({})).toBe(false);
    expect(isMicrosoftConfigured({ MICROSOFT_CLIENT_ID: 'x' })).toBe(false);
  });

  it('isMicrosoftConfigured is true only with both id + secret', () => {
    expect(
      isMicrosoftConfigured({ MICROSOFT_CLIENT_ID: 'x', MICROSOFT_CLIENT_SECRET: 'y' }),
    ).toBe(true);
  });

  it('createMicrosoft throws (not crash) when unconfigured', () => {
    expect(() => createMicrosoft({})).toThrow(MicrosoftNotConfiguredError);
  });

  it('createMicrosoft builds a provider when configured', () => {
    const provider = createMicrosoft({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      PUBLIC_ORIGIN: 'https://uniti.shippie.app',
    });
    expect(provider).toBeTruthy();
    // Smoke: it can build an authorization URL (PKCE → needs a verifier).
    const url = provider.createAuthorizationURL('state123', 'verifier123', ['openid', 'email']);
    expect(url.toString()).toContain('login.microsoftonline.com');
  });
});
