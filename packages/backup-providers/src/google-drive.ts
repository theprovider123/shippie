/**
 * Google Drive backup provider.
 *
 * Uploads encrypted blobs to a per-app folder under `Shippie Backups/`
 * in the user's own Drive. The blob is opaque to Drive — AES-GCM
 * ciphertext sealed by the user's passphrase. We never persist tokens
 * server-side; the access token comes from the OAuth coordinator and
 * lives only in the caller's OPFS-backed token store.
 *
 * Drive REST API surface used:
 *   POST   https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
 *   GET    https://www.googleapis.com/drive/v3/files?q=...
 *   GET    https://www.googleapis.com/drive/v3/files/{id}?alt=media
 *   DELETE https://www.googleapis.com/drive/v3/files/{id}
 *   POST   https://www.googleapis.com/drive/v3/files (folder create)
 *
 * 5xx responses are retried with exponential backoff up to `maxRetries`.
 * Token refresh is the caller's responsibility — `OAuthToken.expiresAt`
 * is checked first; if expired, this provider throws
 * `BackupTokenExpiredError` and the SDK refreshes via the coordinator.
 */
import { encryptBackup, decryptBackup } from './crypto.ts';
import type {
  BackupProviderApi,
  BackupAttemptResult,
  OAuthToken,
  RemoteBackupEntry,
} from './types.ts';

export const GOOGLE_DRIVE_SCOPES = [
  // file-level scope: we can only see/touch files Shippie itself created
  'https://www.googleapis.com/auth/drive.file',
];

export class BackupTokenExpiredError extends Error {
  override readonly name = 'BackupTokenExpiredError';
}

export class BackupProviderError extends Error {
  override readonly name = 'BackupProviderError';
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface GoogleDriveConfig {
  /** Inject `fetch` for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Max retries on 5xx. Default 3. */
  maxRetries?: number;
  /** Initial backoff in ms. Default 250. */
  backoffMs?: number;
  /** Top-level folder name. Defaults to `Shippie Backups`. */
  rootFolderName?: string;
}

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  mimeType?: string;
  parents?: string[];
}

const DEFAULT_ROOT = 'Shippie Backups';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const BACKUP_MIME = 'application/octet-stream';

export class GoogleDriveProvider implements BackupProviderApi {
  readonly id = 'google-drive' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly rootFolderName: string;
  /** appSlug -> folderId, cached per process. */
  private readonly folderCache = new Map<string, string>();

  constructor(cfg: GoogleDriveConfig = {}) {
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = cfg.maxRetries ?? 3;
    this.backoffMs = cfg.backoffMs ?? 250;
    this.rootFolderName = cfg.rootFolderName ?? DEFAULT_ROOT;
  }

  async upload(input: {
    appSlug: string;
    plaintext: Uint8Array;
    schemaVersion: number;
    tables: string[];
    passphrase: string;
    token: OAuthToken;
  }): Promise<BackupAttemptResult> {
    this.assertTokenFresh(input.token);
    const startedAt = Date.now();
    try {
      const blob = await encryptBackup({
        appSlug: input.appSlug,
        schemaVersion: input.schemaVersion,
        tables: input.tables,
        plaintext: input.plaintext,
        passphrase: input.passphrase,
      });
      const folderId = await this.ensureAppFolder(input.appSlug, input.token);
      const file = await this.uploadMultipart({
        token: input.token,
        folderId,
        fileName: blob.fileName,
        bytes: blob.bytes,
      });
      return {
        ok: true,
        fileId: file.id,
        fileName: file.name,
        bytes: blob.bytes.byteLength,
        attemptedAt: startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, attemptedAt: startedAt };
    }
  }

  async list(input: { appSlug: string; token: OAuthToken }): Promise<RemoteBackupEntry[]> {
    this.assertTokenFresh(input.token);
    const folderId = await this.findAppFolder(input.appSlug, input.token);
    if (!folderId) return [];
    const params = new URLSearchParams();
    params.set(
      'q',
      `'${folderId}' in parents and trashed = false and name contains 'shippie-backup-${input.appSlug}-'`,
    );
    params.set('fields', 'files(id,name,size,createdTime,mimeType)');
    params.set('orderBy', 'createdTime desc');
    params.set('pageSize', '50');
    const res = await this.driveFetch(
      `${DRIVE_API}/files?${params.toString()}`,
      { method: 'GET' },
      input.token,
    );
    const json = (await res.json()) as { files?: DriveFile[] };
    return (json.files ?? []).map((f) => ({
      fileId: f.id,
      fileName: f.name,
      createdAt: f.createdTime ? Date.parse(f.createdTime) : 0,
      size: f.size ? Number(f.size) : null,
    }));
  }

  async download(input: {
    fileId: string;
    passphrase: string;
    token: OAuthToken;
  }): Promise<Uint8Array> {
    this.assertTokenFresh(input.token);
    const res = await this.driveFetch(
      `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?alt=media`,
      { method: 'GET' },
      input.token,
    );
    const ciphertext = new Uint8Array(await res.arrayBuffer());
    const { plaintext } = await decryptBackup(ciphertext, input.passphrase);
    return plaintext;
  }

  async prune(input: {
    appSlug: string;
    token: OAuthToken;
    retentionDays: number;
  }): Promise<{ deleted: number }> {
    this.assertTokenFresh(input.token);
    const all = await this.list({ appSlug: input.appSlug, token: input.token });
    const cutoff = Date.now() - input.retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const entry of all) {
      if (entry.createdAt && entry.createdAt < cutoff) {
        try {
          await this.driveFetch(
            `${DRIVE_API}/files/${encodeURIComponent(entry.fileId)}`,
            { method: 'DELETE' },
            input.token,
          );
          deleted += 1;
        } catch {
          // best-effort; ignore individual failures
        }
      }
    }
    return { deleted };
  }

  /**
   * Lazily create (or reuse) the per-app folder under the
   * `Shippie Backups` root.
   */
  private async ensureAppFolder(appSlug: string, token: OAuthToken): Promise<string> {
    const cached = this.folderCache.get(appSlug);
    if (cached) return cached;
    const existing = await this.findAppFolder(appSlug, token);
    if (existing) {
      this.folderCache.set(appSlug, existing);
      return existing;
    }
    const root = await this.ensureRootFolder(token);
    const created = await this.createFolder({
      token,
      name: appSlug,
      parentId: root,
    });
    this.folderCache.set(appSlug, created.id);
    return created.id;
  }

  private async findAppFolder(appSlug: string, token: OAuthToken): Promise<string | null> {
    const root = await this.findRootFolder(token);
    if (!root) return null;
    const params = new URLSearchParams();
    params.set(
      'q',
      `'${root}' in parents and mimeType = '${FOLDER_MIME}' and name = '${escapeQ(appSlug)}' and trashed = false`,
    );
    params.set('fields', 'files(id,name)');
    const res = await this.driveFetch(
      `${DRIVE_API}/files?${params.toString()}`,
      { method: 'GET' },
      token,
    );
    const json = (await res.json()) as { files?: DriveFile[] };
    return json.files?.[0]?.id ?? null;
  }

  private async ensureRootFolder(token: OAuthToken): Promise<string> {
    const found = await this.findRootFolder(token);
    if (found) return found;
    const created = await this.createFolder({
      token,
      name: this.rootFolderName,
      parentId: null,
    });
    return created.id;
  }

  private async findRootFolder(token: OAuthToken): Promise<string | null> {
    const params = new URLSearchParams();
    params.set(
      'q',
      `mimeType = '${FOLDER_MIME}' and name = '${escapeQ(this.rootFolderName)}' and 'root' in parents and trashed = false`,
    );
    params.set('fields', 'files(id,name)');
    const res = await this.driveFetch(
      `${DRIVE_API}/files?${params.toString()}`,
      { method: 'GET' },
      token,
    );
    const json = (await res.json()) as { files?: DriveFile[] };
    return json.files?.[0]?.id ?? null;
  }

  private async createFolder(input: {
    token: OAuthToken;
    name: string;
    parentId: string | null;
  }): Promise<DriveFile> {
    const body = {
      name: input.name,
      mimeType: FOLDER_MIME,
      parents: input.parentId ? [input.parentId] : ['root'],
    };
    const res = await this.driveFetch(
      `${DRIVE_API}/files?fields=id,name,parents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      input.token,
    );
    return (await res.json()) as DriveFile;
  }

  private async uploadMultipart(input: {
    token: OAuthToken;
    folderId: string;
    fileName: string;
    bytes: Uint8Array;
  }): Promise<DriveFile> {
    const boundary = `shippie-${crypto.randomUUID()}`;
    const meta = JSON.stringify({
      name: input.fileName,
      parents: [input.folderId],
      mimeType: BACKUP_MIME,
    });
    // multipart body: meta JSON then the binary blob.
    const head = new TextEncoder().encode(
      `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        meta +
        `\r\n--${boundary}\r\n` +
        `Content-Type: ${BACKUP_MIME}\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.byteLength + input.bytes.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(input.bytes, head.byteLength);
    body.set(tail, head.byteLength + input.bytes.byteLength);

    const res = await this.driveFetch(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,createdTime`,
      {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      },
      input.token,
    );
    return (await res.json()) as DriveFile;
  }

  /** Fetch with bearer token + 5xx exponential backoff. */
  private async driveFetch(
    url: string,
    init: RequestInit,
    token: OAuthToken,
  ): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    headers.set('authorization', `Bearer ${token.accessToken}`);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url, { ...init, headers });
        if (res.status === 401) {
          throw new BackupTokenExpiredError('drive 401 — token expired or revoked');
        }
        if (res.status >= 500 && attempt < this.maxRetries) {
          await delay(this.backoffMs * 2 ** attempt);
          continue;
        }
        if (!res.ok) {
          const body = await safeText(res);
          throw new BackupProviderError(
            `drive ${res.status}: ${body.slice(0, 200)}`,
            res.status,
          );
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (err instanceof BackupTokenExpiredError) throw err;
        if (err instanceof BackupProviderError && (err.status ?? 0) < 500) throw err;
        if (attempt < this.maxRetries) {
          await delay(this.backoffMs * 2 ** attempt);
          continue;
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new BackupProviderError('drive: unknown error');
  }

  private assertTokenFresh(token: OAuthToken): void {
    if (!token.accessToken) {
      throw new BackupTokenExpiredError('no access token');
    }
    if (token.expiresAt && Date.now() >= token.expiresAt) {
      throw new BackupTokenExpiredError('access token expired');
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Drive query strings need single quotes escaped. */
function escapeQ(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
