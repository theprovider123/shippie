import { describe, expect, it } from 'bun:test';
import { createGitHub, GitHubNotConfiguredError } from './github';

describe('createGitHub', () => {
  it('throws GitHubNotConfiguredError when client id missing', () => {
    expect(() => createGitHub({ GITHUB_CLIENT_SECRET: 'x' })).toThrow(GitHubNotConfiguredError);
  });

  it('throws when client secret missing', () => {
    expect(() => createGitHub({ GITHUB_CLIENT_ID: 'x' })).toThrow(GitHubNotConfiguredError);
  });

  it('builds an authorization URL with the right redirect_uri', () => {
    const gh = createGitHub({
      GITHUB_CLIENT_ID: 'iv1.client',
      GITHUB_CLIENT_SECRET: 'shh',
      PUBLIC_ORIGIN: 'https://next.shippie.app',
    });
    const url = gh.createAuthorizationURL('test-state-123', ['read:user', 'user:email']);
    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('iv1.client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://next.shippie.app/auth/callback/github');
    expect(url.searchParams.get('state')).toBe('test-state-123');
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('read:user');
    expect(scope).toContain('user:email');
  });

  it('falls back to https://shippie.app when PUBLIC_ORIGIN missing', () => {
    const gh = createGitHub({
      GITHUB_CLIENT_ID: 'a',
      GITHUB_CLIENT_SECRET: 'b',
    });
    const url = gh.createAuthorizationURL('s', ['read:user']);
    expect(url.searchParams.get('redirect_uri')).toBe('https://shippie.app/auth/callback/github');
  });
});
