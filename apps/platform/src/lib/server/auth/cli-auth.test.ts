import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDeviceCode,
  exchangeDeviceCode,
  approveDeviceCode,
  authenticateBearer,
  hashToken,
} from './cli-auth';

interface DeviceCodeRow {
  device_code: string;
  user_code: string;
  user_id: string | null;
  client_name: string;
  scopes: string;
  approved_at: string | null;
  expires_at: string;
  consumed_at: string | null;
}

interface CliTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  client_name: string;
  scopes: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * Tiny D1 in-memory mock: backs the two cli_* tables only.
 * Returns a `db` matching the subset of methods our helpers call.
 */
function makeDb() {
  const deviceCodes = new Map<string, DeviceCodeRow>();
  const userCodeIndex = new Map<string, string>();
  const tokens = new Map<string, CliTokenRow>();

  function prepare(sqlText: string) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    const stmt = {
      _binds: [] as unknown[],
      bind(...args: unknown[]) {
        const next = Object.create(stmt) as typeof stmt;
        next._binds = args;
        return next;
      },
      async first<T = unknown>(): Promise<T | null> {
        if (sql.startsWith('SELECT * FROM cli_device_codes WHERE device_code')) {
          const row = deviceCodes.get(this._binds[0] as string) ?? null;
          return (row as unknown as T) ?? null;
        }
        if (sql.startsWith('SELECT * FROM cli_device_codes WHERE user_code')) {
          const dc = userCodeIndex.get(this._binds[0] as string);
          const row = dc ? (deviceCodes.get(dc) ?? null) : null;
          return (row as unknown as T) ?? null;
        }
        if (sql.startsWith('SELECT id, user_id, expires_at, revoked_at FROM cli_tokens')) {
          for (const row of tokens.values()) {
            if (row.token_hash === this._binds[0]) return row as unknown as T;
          }
          return null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('INSERT INTO cli_device_codes')) {
          const [device_code, user_code, client_name, scopes, expires_at] = this._binds as [
            string,
            string,
            string,
            string,
            string,
          ];
          const row: DeviceCodeRow = {
            device_code,
            user_code,
            user_id: null,
            client_name,
            scopes,
            approved_at: null,
            expires_at,
            consumed_at: null,
          };
          deviceCodes.set(device_code, row);
          userCodeIndex.set(user_code, device_code);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO cli_tokens')) {
          const [id, user_id, token_hash, client_name, scopes] = this._binds as [
            string,
            string,
            string,
            string,
            string,
          ];
          tokens.set(id, {
            id,
            user_id,
            token_hash,
            client_name,
            scopes,
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            created_at: new Date().toISOString(),
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE cli_device_codes SET consumed_at')) {
          const [consumed_at, device_code] = this._binds as [string, string];
          const row = deviceCodes.get(device_code);
          if (row) row.consumed_at = consumed_at;
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (sql.startsWith('UPDATE cli_device_codes SET user_id')) {
          const [user_id, approved_at, device_code] = this._binds as [string, string, string];
          const row = deviceCodes.get(device_code);
          if (row) {
            row.user_id = user_id;
            row.approved_at = approved_at;
          }
          return { meta: { changes: row ? 1 : 0 } };
        }
        if (sql.startsWith('UPDATE cli_tokens SET last_used_at')) {
          const [last_used_at, id] = this._binds as [string, string];
          const row = tokens.get(id);
          if (row) row.last_used_at = last_used_at;
          return { meta: { changes: row ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return stmt;
  }

  const db = {
    prepare,
    async batch<T>(stmts: T[]) {
      const results = [];
      for (const s of stmts) {
        results.push(await (s as unknown as { run(): Promise<unknown> }).run());
      }
      return results;
    },
  };

  return { db, deviceCodes, tokens, userCodeIndex };
}

describe('CLI device flow', () => {
  let mock: ReturnType<typeof makeDb>;

  beforeEach(() => {
    mock = makeDb();
  });

  it('creates a device code with friendly user_code + verification URLs', async () => {
    const result = await createDeviceCode({
      clientName: 'shippie-cli',
      scopes: ['ship'],
      baseUrl: 'https://next.shippie.app',
      db: mock.db as never,
    });
    expect(result.deviceCode.length).toBe(64); // 32 bytes hex
    expect(result.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.verificationUri).toBe('https://next.shippie.app/auth/cli/activate');
    expect(result.verificationUriComplete).toContain(`user_code=${encodeURIComponent(result.userCode)}`);
    expect(result.expiresIn).toBe(900);
    expect(result.interval).toBe(1);
    expect(mock.deviceCodes.size).toBe(1);
  });

  it('returns pending until approved, then approved with bearer token', async () => {
    const created = await createDeviceCode({
      clientName: 'cli',
      baseUrl: 'https://x.test',
      db: mock.db as never,
    });

    const pending = await exchangeDeviceCode(created.deviceCode, mock.db as never);
    expect(pending.status).toBe('pending');

    const approved = await approveDeviceCode({
      userCode: created.userCode,
      userId: 'user-1',
      db: mock.db as never,
    });
    expect(approved.ok).toBe(true);

    const second = await exchangeDeviceCode(created.deviceCode, mock.db as never);
    expect(second.status).toBe('approved');
    if (second.status === 'approved') {
      expect(second.userId).toBe('user-1');
      expect(second.accessToken.startsWith('shpe_')).toBe(true);
      // Token is 5-char prefix + 64 hex chars.
      expect(second.accessToken.length).toBe(5 + 64);
    }
    expect(mock.tokens.size).toBe(1);

    const replay = await exchangeDeviceCode(created.deviceCode, mock.db as never);
    expect(replay.status).toBe('already_consumed');
  });

  it('returns not_found for an unknown device code', async () => {
    const result = await exchangeDeviceCode('deadbeef', mock.db as never);
    expect(result.status).toBe('not_found');
  });

  it('approveDeviceCode rejects an unknown user_code', async () => {
    const result = await approveDeviceCode({
      userCode: 'NOPE-NOPE',
      userId: 'user-1',
      db: mock.db as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_code');
  });

  it('authenticateBearer accepts a freshly-issued token', async () => {
    const created = await createDeviceCode({
      clientName: 'cli',
      baseUrl: 'https://x.test',
      db: mock.db as never,
    });
    await approveDeviceCode({
      userCode: created.userCode,
      userId: 'user-42',
      db: mock.db as never,
    });
    const exchange = await exchangeDeviceCode(created.deviceCode, mock.db as never);
    if (exchange.status !== 'approved') throw new Error('expected approved');

    const auth = await authenticateBearer(`Bearer ${exchange.accessToken}`, mock.db as never);
    expect(auth?.userId).toBe('user-42');
  });

  it('authenticateBearer rejects a missing or junk token', async () => {
    expect(await authenticateBearer(null, mock.db as never)).toBeNull();
    expect(await authenticateBearer('Bearer ', mock.db as never)).toBeNull();
    expect(await authenticateBearer('Bearer not-a-real-token', mock.db as never)).toBeNull();
  });

  it('authenticateBearer rejects revoked tokens', async () => {
    const created = await createDeviceCode({
      clientName: 'cli',
      baseUrl: 'https://x.test',
      db: mock.db as never,
    });
    await approveDeviceCode({
      userCode: created.userCode,
      userId: 'user-7',
      db: mock.db as never,
    });
    const exchange = await exchangeDeviceCode(created.deviceCode, mock.db as never);
    if (exchange.status !== 'approved') throw new Error();

    // Revoke by mutating the token row directly in the mock.
    const hash = await hashToken(exchange.accessToken);
    for (const row of mock.tokens.values()) {
      if (row.token_hash === hash) row.revoked_at = new Date().toISOString();
    }

    const auth = await authenticateBearer(`Bearer ${exchange.accessToken}`, mock.db as never);
    expect(auth).toBeNull();
  });
});
