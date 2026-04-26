import { describe, expect, it, beforeEach } from 'vitest';
import { mintVerificationToken, verifyAndConsumeToken } from './verification-tokens';

/**
 * Tiny in-memory D1 stand-in. Backs verification_tokens via a Map keyed
 * by `${identifier}|${token}` so the helpers' insert + delete work.
 */
function makeMockDb() {
  const store = new Map<string, { identifier: string; token: string; expires: string }>();

  const make = () => ({
    prepare(sql: string) {
      return {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async run() {
          if (sql.startsWith('INSERT INTO verification_tokens')) {
            const [identifier, token, expires] = this.binds as [string, string, string];
            store.set(`${identifier}|${token}`, { identifier, token, expires });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE FROM verification_tokens')) {
            const [identifier, token] = this.binds as [string, string];
            const key = `${identifier}|${token}`;
            const had = store.delete(key);
            return { meta: { changes: had ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          return null;
        },
      };
    },
  });

  return { db: make(), store };
}

const SECRET = 'unit-test-secret-32-characters-long-aaaa';

describe('mintVerificationToken + verifyAndConsumeToken', () => {
  let mock: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mock = makeMockDb();
  });

  it('mints a token that round-trips successfully', async () => {
    const { token } = await mintVerificationToken({
      email: 'maker@example.com',
      authSecret: SECRET,
      db: mock.db as never,
    });
    expect(token.split('.').length).toBe(2);
    expect(mock.store.size).toBe(1);

    const result = await verifyAndConsumeToken({
      token,
      authSecret: SECRET,
      db: mock.db as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email).toBe('maker@example.com');
    expect(mock.store.size).toBe(0);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { token } = await mintVerificationToken({
      email: 'a@b.com',
      authSecret: SECRET,
      db: mock.db as never,
    });
    const result = await verifyAndConsumeToken({
      token,
      authSecret: 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxx',
      db: mock.db as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects a malformed token', async () => {
    const result = await verifyAndConsumeToken({
      token: 'not-a-valid-format',
      authSecret: SECRET,
      db: mock.db as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_format');
  });

  it('rejects a token with tampered payload', async () => {
    const { token } = await mintVerificationToken({
      email: 'a@b.com',
      authSecret: SECRET,
      db: mock.db as never,
    });
    const [, sig] = token.split('.');
    // Tamper the payload with a different email — encode it ourselves.
    const tamperedPayload = btoa(JSON.stringify({ email: 'attacker@example.com', exp: Date.now() + 60_000, jti: 'x' }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    const tampered = `${tamperedPayload}.${sig}`;
    const result = await verifyAndConsumeToken({
      token: tampered,
      authSecret: SECRET,
      db: mock.db as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects an expired token', async () => {
    // Mint by hand with exp in the past, signed with the same SECRET.
    const past = { email: 'a@b.com', exp: Date.now() - 1000, jti: 'past123' };
    const json = JSON.stringify(past);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(json));
    const b64 = (bytes: Uint8Array) => {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    };
    const token = `${b64(enc.encode(json))}.${b64(new Uint8Array(sigBuf))}`;
    // Insert the row so the only failure is exp.
    mock.store.set('a@b.com|past123', { identifier: 'a@b.com', token: 'past123', expires: 'x' });

    const result = await verifyAndConsumeToken({ token, authSecret: SECRET, db: mock.db as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a token whose row has already been consumed', async () => {
    const { token } = await mintVerificationToken({
      email: 'a@b.com',
      authSecret: SECRET,
      db: mock.db as never,
    });
    const first = await verifyAndConsumeToken({ token, authSecret: SECRET, db: mock.db as never });
    expect(first.ok).toBe(true);
    const second = await verifyAndConsumeToken({ token, authSecret: SECRET, db: mock.db as never });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('unknown_or_used');
  });
});
