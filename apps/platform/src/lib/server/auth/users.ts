/**
 * User upsert helpers for OAuth + magic-link flows.
 *
 * findOrCreateByGitHub — used by the GitHub callback.
 * findOrCreateByEmail  — used by magic-link redemption.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface UserRow {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: number;
  github_id: string | null;
}

export interface FindOrCreateGitHubInput {
  githubId: string;
  email: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  db: D1Database;
}

export async function findOrCreateUserByGitHub(input: FindOrCreateGitHubInput): Promise<UserRow> {
  // 1. Match on github_id first (most specific).
  let row = await input.db
    .prepare('SELECT * FROM users WHERE github_id = ? LIMIT 1')
    .bind(input.githubId)
    .first<UserRow>();
  if (row) return row;

  // 2. Match on email — link the account.
  row = await input.db
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(input.email)
    .first<UserRow>();
  if (row) {
    await input.db
      .prepare(
        'UPDATE users SET github_id = ?, avatar_url = COALESCE(avatar_url, ?), display_name = COALESCE(display_name, ?), updated_at = ? WHERE id = ?',
      )
      .bind(input.githubId, input.avatarUrl, input.displayName, new Date().toISOString(), row.id)
      .run();
    row.github_id = input.githubId;
    if (!row.avatar_url) row.avatar_url = input.avatarUrl;
    if (!row.display_name) row.display_name = input.displayName;
    return row;
  }

  // 3. Create new user. `username` defaults to GitHub login if free.
  const id = crypto.randomUUID();
  const username = await pickFreeUsername(input.login, input.db);
  await input.db
    .prepare(
      `INSERT INTO users (id, email, github_id, username, display_name, avatar_url, name, image, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.email,
      input.githubId,
      username,
      input.displayName ?? input.login,
      input.avatarUrl,
      input.displayName ?? input.login,
      input.avatarUrl,
      new Date().toISOString(),
    )
    .run();

  return {
    id,
    email: input.email,
    username,
    display_name: input.displayName ?? input.login,
    avatar_url: input.avatarUrl,
    is_admin: 0,
    github_id: input.githubId,
  };
}

export async function findOrCreateUserByEmail(email: string, db: D1Database): Promise<UserRow> {
  const existing = await db
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<UserRow>();
  if (existing) {
    if (!existing.email && existing.email !== email) {
      // No-op; row already matches.
    }
    // If email previously unverified, mark it now (clicked magic link = verified).
    await db
      .prepare('UPDATE users SET email_verified = COALESCE(email_verified, ?), updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), new Date().toISOString(), existing.id)
      .run();
    return existing;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO users (id, email, email_verified) VALUES (?, ?, ?)',
    )
    .bind(id, email, new Date().toISOString())
    .run();

  return {
    id,
    email,
    username: null,
    display_name: null,
    avatar_url: null,
    is_admin: 0,
    github_id: null,
  };
}

async function pickFreeUsername(suggested: string, db: D1Database): Promise<string | null> {
  const cleaned = suggested.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  if (!cleaned) return null;

  const taken = await db
    .prepare('SELECT 1 AS one FROM users WHERE username = ? LIMIT 1')
    .bind(cleaned)
    .first<{ one: number }>();
  if (!taken) return cleaned;

  // Append a 4-char suffix until we find a free slot. Cap at 5 attempts.
  for (let i = 0; i < 5; i++) {
    const buf = new Uint8Array(2);
    crypto.getRandomValues(buf);
    const suffix = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    const candidate = `${cleaned.slice(0, 27)}-${suffix}`;
    const inUse = await db
      .prepare('SELECT 1 AS one FROM users WHERE username = ? LIMIT 1')
      .bind(candidate)
      .first<{ one: number }>();
    if (!inUse) return candidate;
  }
  return null; // bail; user can set later
}
