import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import AdmZip from 'adm-zip';

export interface DeployOptions {
  directory: string;
  slug?: string;
  trial?: boolean;
}

export interface DeployResult {
  ok: boolean;
  slug?: string;
  liveUrl?: string;
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

export async function deployDirectory(
  ctx: InternalCtx,
  opts: DeployOptions,
): Promise<DeployResult> {
  if (!existsSync(opts.directory)) {
    return { ok: false, error: `directory not found: ${opts.directory}` };
  }

  const zip = new AdmZip();
  zip.addLocalFolder(opts.directory);
  const buffer = zip.toBuffer();

  const form = new FormData();
  form.append('zip', new Blob([buffer]), 'deploy.zip');

  const endpoint = opts.trial ? '/api/deploy/trial' : '/api/deploy';
  const headers: Record<string, string> = {};

  if (!opts.trial) {
    const slug =
      opts.slug ?? basename(opts.directory).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    form.append('slug', slug);
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
    version: typeof json.version === 'number' ? json.version : undefined,
    deployId: typeof json.deploy_id === 'string' ? json.deploy_id : undefined,
    files: typeof json.files === 'number' ? json.files : undefined,
    totalBytes: typeof json.total_bytes === 'number' ? json.total_bytes : undefined,
    expiresAt: typeof json.expires_at === 'string' ? json.expires_at : undefined,
    claimUrl: typeof json.claim_url === 'string' ? json.claim_url : undefined,
  };
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
