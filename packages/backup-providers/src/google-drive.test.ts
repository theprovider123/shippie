/**
 * Hermetic tests for GoogleDriveProvider — no real network, no real
 * Drive credentials. We inject a fake fetch that mirrors the slice of
 * the Drive REST API the provider hits, plus deterministic crypto
 * input so the multipart body has a predictable shape.
 */
import { describe, expect, test } from 'bun:test';
import { GoogleDriveProvider, BackupTokenExpiredError } from './google-drive.ts';
import type { OAuthToken } from './types.ts';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | Uint8Array;
}

function makeFetch(
  responder: (req: CapturedRequest) => { status?: number; body?: string; bytes?: Uint8Array; headers?: Record<string, string> },
): { fetch: typeof fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fn = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers: Record<string, string> = {};
    const h = init?.headers ?? {};
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headers[String(k).toLowerCase()] = String(v);
    } else {
      for (const k of Object.keys(h)) headers[k.toLowerCase()] = String((h as Record<string, string>)[k]);
    }
    const body = init?.body;
    let captured: string | Uint8Array = '';
    if (typeof body === 'string') captured = body;
    else if (body instanceof Uint8Array) captured = body;
    else if (body && body instanceof ArrayBuffer) captured = new Uint8Array(body);
    const cap: CapturedRequest = { url, method, headers, body: captured };
    calls.push(cap);

    const r = responder(cap);
    const respHeaders = new Headers(r.headers ?? {});
    if (!respHeaders.has('content-type') && !r.bytes) respHeaders.set('content-type', 'application/json');
    const payload: BodyInit | null = r.bytes
      ? new Blob([r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength)])
      : (r.body ?? '');
    return new Response(payload, { status: r.status ?? 200, headers: respHeaders });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const validToken: OAuthToken = {
  accessToken: 'ya29.test',
  expiresAt: Date.now() + 3600 * 1000,
  scope: 'https://www.googleapis.com/auth/drive.file',
  issuedAt: Date.now(),
};

const expiredToken: OAuthToken = {
  ...validToken,
  expiresAt: Date.now() - 1000,
};

describe('GoogleDriveProvider.upload', () => {
  test('finds-or-creates folder, then multipart-uploads encrypted blob', async () => {
    let folderState: 'missing' | 'created' = 'missing';
    let appFolderState: 'missing' | 'created' = 'missing';
    const { fetch, calls } = makeFetch((req) => {
      if (req.method === 'GET' && req.url.includes('q=mimeType')) {
        // Root folder lookup
        if (folderState === 'missing') return { status: 200, body: JSON.stringify({ files: [] }) };
        return { status: 200, body: JSON.stringify({ files: [{ id: 'rootFolderId', name: 'Shippie Backups' }] }) };
      }
      if (req.method === 'GET' && req.url.includes('q=%27rootFolderId%27')) {
        // App-folder lookup under root
        if (appFolderState === 'missing') return { status: 200, body: JSON.stringify({ files: [] }) };
        return { status: 200, body: JSON.stringify({ files: [{ id: 'appFolderId', name: 'recipes' }] }) };
      }
      if (req.method === 'POST' && req.url.includes('drive/v3/files') && !req.url.includes('upload/')) {
        // Folder create
        if (folderState === 'missing') {
          folderState = 'created';
          return { status: 200, body: JSON.stringify({ id: 'rootFolderId', name: 'Shippie Backups' }) };
        }
        appFolderState = 'created';
        return { status: 200, body: JSON.stringify({ id: 'appFolderId', name: 'recipes' }) };
      }
      if (req.method === 'POST' && req.url.includes('upload/drive/v3/files')) {
        return {
          status: 200,
          body: JSON.stringify({
            id: 'uploaded-file-1',
            name: 'shippie-backup-recipes-x.enc',
            size: '128',
            createdTime: '2026-04-25T12:00:00Z',
          }),
        };
      }
      return { status: 500, body: 'unexpected' };
    });

    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const result = await provider.upload({
      appSlug: 'recipes',
      plaintext: new TextEncoder().encode('{"recipes":[]}'),
      schemaVersion: 1,
      tables: ['recipes'],
      passphrase: 'correct horse battery staple',
      token: validToken,
    });

    expect(result.ok).toBe(true);
    expect(result.fileId).toBe('uploaded-file-1');

    const upload = calls.find((c) => c.url.includes('upload/drive/v3/files'));
    expect(upload).toBeDefined();
    expect(upload!.headers['authorization']).toBe(`Bearer ${validToken.accessToken}`);
    expect(upload!.headers['content-type']).toMatch(/multipart\/related/);
    // The body must contain the multipart envelope and the BACKUP_MIME marker.
    const bodyBytes = upload!.body as Uint8Array;
    const decoded = new TextDecoder().decode(bodyBytes);
    expect(decoded).toContain('Content-Type: application/octet-stream');
    expect(decoded).toContain('"name":"shippie-backup-recipes-');
    // Ensure plaintext didn't leak into the multipart body.
    expect(decoded).not.toContain('{"recipes":[]}');
  });

  test('throws BackupTokenExpiredError when token already expired', async () => {
    const { fetch } = makeFetch(() => ({ status: 200, body: JSON.stringify({ files: [] }) }));
    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const result = await provider.upload({
      appSlug: 'recipes',
      plaintext: new Uint8Array([1, 2, 3]),
      schemaVersion: 1,
      tables: ['recipes'],
      passphrase: 'pass',
      token: expiredToken,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/);
  });

  test('retries on 5xx then succeeds', async () => {
    let attempt = 0;
    const { fetch, calls } = makeFetch((req) => {
      if (req.url.includes('q=mimeType') && req.method === 'GET') {
        attempt += 1;
        if (attempt === 1) return { status: 503, body: 'try again' };
        return { status: 200, body: JSON.stringify({ files: [{ id: 'rootFolderId' }] }) };
      }
      if (req.url.includes("q=%27rootFolderId%27") && req.method === 'GET') {
        return { status: 200, body: JSON.stringify({ files: [{ id: 'appFolderId' }] }) };
      }
      if (req.method === 'POST' && req.url.includes('upload/drive/v3/files')) {
        return { status: 200, body: JSON.stringify({ id: 'f1', name: 'x.enc' }) };
      }
      return { status: 500 };
    });
    const provider = new GoogleDriveProvider({ fetchImpl: fetch, backoffMs: 1 });
    const result = await provider.upload({
      appSlug: 'recipes',
      plaintext: new Uint8Array([1, 2, 3]),
      schemaVersion: 1,
      tables: ['recipes'],
      passphrase: 'pass',
      token: validToken,
    });
    expect(result.ok).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  test('401 surfaces as BackupTokenExpiredError -> result.ok=false', async () => {
    const { fetch } = makeFetch(() => ({ status: 401, body: 'unauthorized' }));
    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const result = await provider.upload({
      appSlug: 'recipes',
      plaintext: new Uint8Array([1, 2, 3]),
      schemaVersion: 1,
      tables: ['recipes'],
      passphrase: 'pass',
      token: validToken,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired|401|revoked/i);
  });
});

describe('GoogleDriveProvider.list/download/prune', () => {
  test('list returns mapped entries from folder query', async () => {
    const { fetch } = makeFetch((req) => {
      if (req.url.includes("name+contains+%27shippie-backup")) {
        return {
          status: 200,
          body: JSON.stringify({
            files: [
              { id: 'a', name: 'shippie-backup-recipes-X.enc', size: '512', createdTime: '2026-04-24T00:00:00Z' },
              { id: 'b', name: 'shippie-backup-recipes-Y.enc', createdTime: '2026-04-23T00:00:00Z' },
            ],
          }),
        };
      }
      if (req.url.includes('q=mimeType') && req.method === 'GET') {
        return { status: 200, body: JSON.stringify({ files: [{ id: 'rootFolderId' }] }) };
      }
      if (req.url.includes("q=%27rootFolderId%27")) {
        return { status: 200, body: JSON.stringify({ files: [{ id: 'appFolderId' }] }) };
      }
      return { status: 500 };
    });
    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const items = await provider.list({ appSlug: 'recipes', token: validToken });
    expect(items).toHaveLength(2);
    expect(items[0]!.fileId).toBe('a');
    expect(items[0]!.size).toBe(512);
    expect(items[1]!.size).toBeNull();
  });

  test('list returns [] when no folder exists yet', async () => {
    const { fetch } = makeFetch(() => ({ status: 200, body: JSON.stringify({ files: [] }) }));
    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const items = await provider.list({ appSlug: 'recipes', token: validToken });
    expect(items).toEqual([]);
  });

  test('prune deletes only entries older than retentionDays', async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const newDate = new Date().toISOString();
    const { fetch, calls } = makeFetch((req) => {
      if (req.url.includes('q=mimeType') && req.method === 'GET') {
        return { status: 200, body: JSON.stringify({ files: [{ id: 'rootFolderId' }] }) };
      }
      if (req.url.includes("q=%27rootFolderId%27") && req.method === 'GET' && !req.url.includes('shippie-backup')) {
        return { status: 200, body: JSON.stringify({ files: [{ id: 'appFolderId' }] }) };
      }
      if (req.url.includes('shippie-backup')) {
        return {
          status: 200,
          body: JSON.stringify({
            files: [
              { id: 'old1', name: 'old', createdTime: oldDate },
              { id: 'new1', name: 'new', createdTime: newDate },
            ],
          }),
        };
      }
      if (req.method === 'DELETE') return { status: 204 };
      return { status: 500 };
    });
    const provider = new GoogleDriveProvider({ fetchImpl: fetch });
    const result = await provider.prune({
      appSlug: 'recipes',
      token: validToken,
      retentionDays: 30,
    });
    expect(result.deleted).toBe(1);
    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.url).toContain('old1');
  });
});

describe('GoogleDriveProvider token guards', () => {
  test('list throws BackupTokenExpiredError for missing token', async () => {
    const provider = new GoogleDriveProvider({ fetchImpl: makeFetch(() => ({ status: 200 })).fetch });
    await expect(
      provider.list({
        appSlug: 'recipes',
        token: { ...validToken, accessToken: '' },
      }),
    ).rejects.toThrow(BackupTokenExpiredError);
  });
});
