import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { posix as posixPath } from 'node:path';
import { createClient, type RemixHandoff } from '@shippie/core';

export interface RemixCommandOptions {
  api?: string;
  json?: boolean;
  clone?: boolean | string;
}

export interface RemixClonePlan {
  cloneUrl: string;
  targetDir: string;
  targetPath: string;
  checkoutPath: string;
  workspacePath: string;
  workspaceDirectory: string;
  cloneArgs: string[];
  sparseArgs: string[] | null;
  commands: string[];
}

interface RemixCloneDeps {
  cwd?: string;
  exists?: (path: string) => boolean;
  writeFile?: (path: string, data: string) => void;
  run?: (command: string, args: string[], opts?: { cwd?: string }) => void;
  log?: (line: string) => void;
}

export async function remixCommand(slug: string, opts: RemixCommandOptions) {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });

  try {
    const remix = await client.remix(slug);
    if (opts.json) {
      console.log(JSON.stringify(remix, null, 2));
      return;
    }
    if (opts.clone) {
      const plan = cloneRemixSource(remix, opts.clone);
      console.log(`Cloned: ${plan.targetDir}`);
      console.log(`Workspace: ${plan.workspacePath}`);
      console.log('');
      console.log('Next:');
      for (const command of plan.commands) console.log(`  ${command}`);
      return;
    }

    console.log(`Remix: ${remix.name} (${remix.slug})`);
    if (remix.tagline) console.log(remix.tagline);
    console.log(`Source:  ${remix.sourceRepo}`);
    console.log(`License: ${remix.license}`);
    if (remix.latestVersion) console.log(`Version: ${remix.latestVersion}`);
    if (remix.forkUrl) console.log(`Fork:    ${remix.forkUrl}`);
    console.log('');
    console.log('Deploy after your changes:');
    console.log(`  ${remix.deploy.cli}`);
    console.log('');
    console.log('MCP handoff:');
    console.log(`  deploy(directory="${remix.deploy.mcp.arguments.directory}", slug="${remix.deploy.mcp.arguments.slug}", remix_from="${remix.deploy.mcp.arguments.remix_from}")`);
  } catch (err) {
    console.error(`remix failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

export function cloneRemixSource(
  remix: RemixHandoff,
  cloneOpt: boolean | string = true,
  deps: RemixCloneDeps = {},
): RemixClonePlan {
  const plan = buildRemixClonePlan(remix, cloneOpt, deps.cwd);
  const exists = deps.exists ?? existsSync;
  const writeFile = deps.writeFile ?? ((path: string, data: string) => writeFileSync(path, data));
  const run = deps.run ?? runCommand;
  const log = deps.log ?? (() => {});

  if (exists(plan.targetPath)) {
    throw new Error(`target already exists: ${plan.targetPath}`);
  }

  log(`Cloning ${plan.cloneUrl}...`);
  run('git', plan.cloneArgs, { cwd: deps.cwd });
  if (plan.sparseArgs) {
    log(`Checking out ${remix.source?.path}...`);
    run('git', plan.sparseArgs, { cwd: plan.targetPath });
  }

  writeFile(plan.workspacePath, JSON.stringify(workspaceFileFor(remix, plan.workspaceDirectory), null, 2) + '\n');
  return plan;
}

export function buildRemixClonePlan(
  remix: RemixHandoff,
  cloneOpt: boolean | string = true,
  cwd = process.cwd(),
): RemixClonePlan {
  const cloneUrl = remix.source?.cloneUrl ?? remix.sourceRepo;
  if (!cloneUrl) throw new Error('remix source has no clone URL');

  const targetDir = typeof cloneOpt === 'string' && cloneOpt.trim()
    ? cloneOpt.trim()
    : remix.targetSlug || remix.deploy.workspace.slug;
  const targetPath = resolve(cwd, targetDir);
  const sourcePath = trimSlashes(remix.source?.path ?? '');
  const workspaceDirectory = sourcePath
    ? posixPath.join(sourcePath, remix.deploy.workspace.directory || 'dist')
    : remix.deploy.workspace.directory || 'dist';
  const checkoutPath = sourcePath ? resolve(targetPath, sourcePath) : targetPath;

  const cloneArgs = ['clone'];
  if (sourcePath) cloneArgs.push('--filter=blob:none', '--sparse');
  if (sourcePath && remix.source?.ref) cloneArgs.push('--branch', remix.source.ref);
  cloneArgs.push(cloneUrl, targetDir);

  return {
    cloneUrl,
    targetDir,
    targetPath,
    checkoutPath,
    workspacePath: resolve(targetPath, 'shippie-workspace.json'),
    workspaceDirectory,
    cloneArgs,
    sparseArgs: sourcePath ? ['sparse-checkout', 'set', sourcePath] : null,
    commands: [
      `cd ${shellQuote(pathForDisplay(sourcePath ? posixPath.join(targetDir, sourcePath) : targetDir))}`,
      'bun install',
      'bun run build',
      `shippie deploy ./dist --slug ${shellQuote(remix.targetSlug)} --remix ${shellQuote(remix.slug)}`,
    ],
  };
}

function workspaceFileFor(remix: RemixHandoff, directory: string) {
  return {
    workspace: remix.targetSlug,
    apps: [
      {
        slug: remix.targetSlug,
        directory,
        remixFrom: remix.slug,
      },
    ],
  };
}

function runCommand(command: string, args: string[], opts: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function pathForDisplay(value: string): string {
  return value.replace(/\\/g, '/');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
