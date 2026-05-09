import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import AdmZip from 'adm-zip';

export type DeployVisibility = 'public' | 'unlisted' | 'private' | 'team';

export interface DeployOptions {
  directory: string;
  slug?: string;
  trial?: boolean;
  visibility?: DeployVisibility;
  organization?: string;
  /** Existing public app slug to attribute this deploy as a remix of. */
  remixFrom?: string;
}

export interface DeployResult {
  ok: boolean;
  slug?: string;
  liveUrl?: string;
  visibility?: DeployVisibility;
  version?: number;
  deployId?: string;
  files?: number;
  totalBytes?: number;
  expiresAt?: string;
  claimUrl?: string;
  /** Raw error or message when ok=false. */
  error?: string;
  preflight?: DeployPreflightReport;
  /** HTTP status from the platform. Useful for tooling to disambiguate
   *  rate-limit vs auth-failure vs validation-error. */
  status?: number;
}

export interface DeployPreflightFinding {
  rule: string;
  severity: 'pass' | 'warn' | 'block' | 'fix';
  title: string;
  detail?: string;
}

export interface DeployPreflightReport {
  passed: boolean;
  findings: DeployPreflightFinding[];
  warnings: DeployPreflightFinding[];
  blockers: DeployPreflightFinding[];
  durationMs: number;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
}

type PackagedDeployTarget =
  | { ok: true; buffer: Buffer; filename: string; kind: 'directory' | 'html' | 'zip' }
  | { ok: false; error: string };

export async function deployDirectory(
  ctx: InternalCtx,
  opts: DeployOptions,
): Promise<DeployResult> {
  if (!existsSync(opts.directory)) {
    return { ok: false, error: `path not found: ${opts.directory}` };
  }

  const target = statSync(opts.directory);
  const inputSlug =
    opts.slug ?? slugFromPath(opts.directory, target.isFile());
  const packaged = packageDeployTarget(opts.directory, inputSlug, target.isFile());
  if (!packaged.ok) return packaged;

  const form = new FormData();
  form.append('zip', new Blob([blobPartFromBuffer(packaged.buffer)]), packaged.filename);
  if (opts.remixFrom) form.append('remix_from', opts.remixFrom);

  const endpoint = opts.trial ? '/api/deploy/trial' : '/api/deploy';
  const headers: Record<string, string> = {};

  if (!opts.trial) {
    form.append('slug', inputSlug);
    const visibility = opts.visibility ?? (packaged.kind === 'html' ? 'unlisted' : undefined);
    if (visibility) form.append('visibility', visibility);
    if (opts.organization) form.append('organization', opts.organization);
    if (!ctx.token) {
      return {
        ok: false,
        error:
          'no_auth_token — run `shippie login`, set SHIPPIE_TOKEN, or pass trial=true',
      };
    }
    headers['authorization'] = `Bearer ${ctx.token}`;
  }

  const res = await fetch(`${ctx.apiUrl}${endpoint}`, {
    method: 'POST',
    body: form,
    headers,
  });

  if (res.status === 429) {
    return {
      ok: false,
      status: 429,
      error: opts.trial ? 'trial_rate_limit' : 'rate_limit',
    };
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, status: res.status, error: 'invalid_json_response' };
  }

  if (!res.ok) {
    const reason =
      typeof json.reason === 'string'
        ? json.reason
        : typeof json.error === 'string'
          ? json.error
          : res.statusText;
    return {
      ok: false,
      status: res.status,
      error: reason,
      preflight: parsePreflightReport(json.preflight),
    };
  }

  return {
    ok: true,
    status: res.status,
    slug: typeof json.slug === 'string' ? json.slug : undefined,
    liveUrl: typeof json.live_url === 'string' ? json.live_url : undefined,
    visibility: parseVisibility(json.visibility_scope),
    version: typeof json.version === 'number' ? json.version : undefined,
    deployId: typeof json.deploy_id === 'string' ? json.deploy_id : undefined,
    files: typeof json.files === 'number' ? json.files : undefined,
    totalBytes: typeof json.total_bytes === 'number' ? json.total_bytes : undefined,
    expiresAt: typeof json.expires_at === 'string' ? json.expires_at : undefined,
    claimUrl: typeof json.claim_url === 'string' ? json.claim_url : undefined,
  };
}

function parseVisibility(input: unknown): DeployVisibility | undefined {
  return input === 'public' || input === 'unlisted' || input === 'private' || input === 'team'
    ? input
    : undefined;
}

function blobPartFromBuffer(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

function packageDeployTarget(
  path: string,
  slug: string,
  isFile: boolean,
): PackagedDeployTarget {
  if (!isFile) {
    const zip = new AdmZip();
    zip.addLocalFolder(path);
    return { ok: true, buffer: zip.toBuffer(), filename: 'deploy.zip', kind: 'directory' };
  }

  const ext = extname(path).toLowerCase();
  if (ext === '.zip') {
    return { ok: true, buffer: readFileSync(path), filename: basename(path), kind: 'zip' };
  }

  if (ext !== '.html' && ext !== '.htm') {
    return {
      ok: false,
      error: `unsupported file type: ${ext || '(none)'} — pass a directory, .html, or .zip`,
    };
  }

  const html = readFileSync(path);
  const zip = new AdmZip();
  zip.addFile('index.html', html);
  zip.addFile('shippie.json', Buffer.from(JSON.stringify(defaultSingleFileManifest(slug), null, 2)));
  return { ok: true, buffer: zip.toBuffer(), filename: `${slug}.zip`, kind: 'html' };
}

function defaultSingleFileManifest(slug: string): Record<string, unknown> {
  return {
    version: 1,
    slug,
    type: 'app',
    name: titleCase(slug),
    category: 'tools',
    kind: 'local',
    theme_color: '#E8603C',
    background_color: '#ffffff',
    permissions: {
      auth: false,
      storage: 'rw',
      files: false,
      notifications: false,
      analytics: true,
      external_network: false,
    },
  };
}

function slugFromPath(path: string, isFile: boolean): string {
  const name = basename(path, isFile ? extname(path) : undefined);
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'tool';
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parsePreflightReport(input: unknown): DeployPreflightReport | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  return {
    passed: raw.passed === true,
    findings: parsePreflightFindings(raw.findings),
    warnings: parsePreflightFindings(raw.warnings),
    blockers: parsePreflightFindings(raw.blockers),
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 0,
  };
}

function parsePreflightFindings(input: unknown): DeployPreflightFinding[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.rule !== 'string' || typeof raw.title !== 'string') return [];
    const severity = raw.severity;
    if (
      severity !== 'pass' &&
      severity !== 'warn' &&
      severity !== 'block' &&
      severity !== 'fix'
    ) {
      return [];
    }
    return [{
      rule: raw.rule,
      severity,
      title: raw.title,
      detail: typeof raw.detail === 'string' ? raw.detail : undefined,
    }];
  });
}
