/**
 * GitHub OAuth via Arctic 2.x.
 *
 * Wrangler secrets:
 *   GITHUB_CLIENT_ID       — wrangler secret put GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET   — wrangler secret put GITHUB_CLIENT_SECRET
 *
 * Redirect URI is derived from PUBLIC_ORIGIN + /auth/callback/github.
 */
import { GitHub } from 'arctic';

export interface ArcticEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  PUBLIC_ORIGIN?: string;
}

export class GitHubNotConfiguredError extends Error {
  constructor() {
    super('GitHub OAuth credentials are not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.');
    this.name = 'GitHubNotConfiguredError';
  }
}

export function createGitHub(env: ArcticEnv): GitHub {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new GitHubNotConfiguredError();
  }
  const origin = env.PUBLIC_ORIGIN ?? 'https://shippie.app';
  const redirectURI = `${origin.replace(/\/$/, '')}/auth/callback/github`;
  return new GitHub(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, redirectURI);
}

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** Fetch the basic user profile after exchanging a code for a token. */
export async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'shippie-platform',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /user returned ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GitHubProfile;
}

/**
 * GitHub may not return an email on the profile if the user has set theirs
 * to private. Pull the verified primary from /user/emails as a fallback.
 */
export async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://api.github.com/user/emails', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'shippie-platform',
    },
  });
  if (!res.ok) return null;
  const emails = (await res.json()) as GitHubEmail[];
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  return primary?.email ?? null;
}
