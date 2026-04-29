import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deployDirectory, type DeployResult } from './deploy.ts';

const WORKSPACE_FILE = 'shippie-workspace.json';

export interface WorkspaceApp {
  slug: string;
  directory: string;
  role?: string;
  description?: string;
}

export interface ShippieWorkspace {
  workspace: string;
  apps: WorkspaceApp[];
  shared?: Record<string, unknown>;
}

export interface WorkspaceAppPlan extends WorkspaceApp {
  absoluteDirectory: string;
}

export interface WorkspacePlan {
  file: string;
  root: string;
  workspace: string;
  apps: WorkspaceAppPlan[];
  shared: Record<string, unknown>;
}

export interface WorkspaceDeployOptions {
  path: string;
  trial?: boolean;
  dryRun?: boolean;
}

export interface WorkspaceDeployAppResult extends WorkspaceAppPlan {
  result?: DeployResult;
  skipped?: boolean;
}

export interface WorkspaceDeployResult {
  ok: boolean;
  plan: WorkspacePlan;
  apps: WorkspaceDeployAppResult[];
  error?: string;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
}

export function readWorkspacePlan(path = '.'): WorkspacePlan | { error: string } {
  const file = resolveWorkspaceFile(path);
  if (!file) {
    return { error: `workspace file not found: ${path}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { error: `workspace file is not valid JSON: ${(err as Error).message}` };
  }

  return normalizeWorkspace(raw, file);
}

export async function deployWorkspace(
  ctx: InternalCtx,
  opts: WorkspaceDeployOptions,
): Promise<WorkspaceDeployResult> {
  const plan = readWorkspacePlan(opts.path);
  if ('error' in plan) {
    return {
      ok: false,
      error: plan.error,
      plan: emptyPlan(opts.path),
      apps: [],
    };
  }

  const apps: WorkspaceDeployAppResult[] = [];
  if (opts.dryRun) {
    return {
      ok: true,
      plan,
      apps: plan.apps.map((app) => ({ ...app, skipped: true })),
    };
  }

  let ok = true;
  for (const app of plan.apps) {
    const result = await deployDirectory(ctx, {
      directory: app.absoluteDirectory,
      slug: app.slug,
      trial: opts.trial,
    });
    if (!result.ok) ok = false;
    apps.push({ ...app, result });
  }

  return { ok, plan, apps };
}

function resolveWorkspaceFile(path: string): string | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  if (absolute.endsWith('.json')) return absolute;
  const candidate = resolve(absolute, WORKSPACE_FILE);
  return existsSync(candidate) ? candidate : null;
}

function normalizeWorkspace(raw: unknown, file: string): WorkspacePlan | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'workspace file must contain a JSON object' };
  }
  const obj = raw as Record<string, unknown>;
  const workspace = typeof obj.workspace === 'string' && obj.workspace.trim()
    ? obj.workspace.trim()
    : null;
  if (!workspace) {
    return { error: 'workspace must be a non-empty string' };
  }
  if (!Array.isArray(obj.apps) || obj.apps.length === 0) {
    return { error: 'apps must be a non-empty array' };
  }

  const root = dirname(file);
  const apps: WorkspaceAppPlan[] = [];
  for (const [index, value] of obj.apps.entries()) {
    const app = normalizeWorkspaceApp(value, index, root);
    if ('error' in app) return app;
    apps.push(app);
  }

  return {
    file,
    root,
    workspace,
    apps,
    shared: isPlainObject(obj.shared) ? obj.shared : {},
  };
}

function normalizeWorkspaceApp(
  raw: unknown,
  index: number,
  root: string,
): WorkspaceAppPlan | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `apps[${index}] must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  const slug = typeof obj.slug === 'string' ? obj.slug.trim() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    return { error: `apps[${index}].slug must be a valid Shippie slug` };
  }
  const directory =
    typeof obj.directory === 'string'
      ? obj.directory
      : typeof obj.path === 'string'
        ? obj.path
        : slug;
  const absoluteDirectory = resolve(root, directory);

  return {
    slug,
    directory,
    absoluteDirectory,
    role: typeof obj.role === 'string' && obj.role.trim() ? obj.role.trim() : undefined,
    description:
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim()
        : undefined,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyPlan(path: string): WorkspacePlan {
  return {
    file: resolve(path),
    root: resolve(path),
    workspace: '',
    apps: [],
    shared: {},
  };
}
