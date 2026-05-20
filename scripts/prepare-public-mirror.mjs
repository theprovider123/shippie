#!/usr/bin/env bun
/**
 * Build a sanitized public mirror from the current HEAD.
 *
 * This deliberately copies tracked files instead of pushing this repository:
 * the private operator repo can keep admin runbooks, internal launch notes,
 * personal commit history, and production deploy credentials out of the public
 * source release.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = '/private/tmp/shippie-public-mirror';

const args = new Set(process.argv.slice(2));
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : DEFAULT_OUT;
const INIT_GIT = !args.has('--no-git');

const EXCLUDE_PREFIXES = [
  '.claude/',
  '.superpowers/',
  '.worktrees/',
  'docs/launch/',
  'docs/ops/',
  'docs/superpowers/',
  'apps/platform/scripts/mobile-audit/screenshots/',
];

const EXCLUDE_FILES = new Set([
  'docs/CURRENT_STATE.md',
  'docs/OUTSTANDING_ACTIONS.md',
  'scripts/prepare-public-mirror.mjs',
  '.github/workflows/deploy-platform.yml',
  '.github/workflows/release.yml',
  '.github/workflows/shippie-build.yml',
  '.github/actions/deploy/action.yml',
]);

const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.csv',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.lock',
  '.md',
  '.mjs',
  '.svelte',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const REPLACEMENTS = [
  [/https:\/\/github\.com\/theprovider123\/shippie/g, 'https://github.com/shippie-app/shippie'],
  [/git\+https:\/\/github\.com\/theprovider123\/shippie\.git/g, 'git+https://github.com/shippie-app/shippie.git'],
  [/github\.com\/theprovider123\/shippie/g, 'github.com/shippie-app/shippie'],
  [/theprovider123\/shippie/g, 'shippie-app/shippie'],
  [/theprovider123/g, 'shippie-app'],
  [/Devante Providence/g, 'Shippie team'],
  [/Devante \+ Claude/g, 'Shippie team'],
  [/\bDevante\b/g, 'Shippie maintainer'],
  [/maker_devante/g, 'maker_demo'],
  [/devante@example\.com/g, 'demo@example.com'],
  [/github\.com\/devante/g, 'github.com/shippie-maker'],
  [/\bdevante\b/g, 'shippie-maker'],
  [/D\. Providence/g, 'S. Inspector'],
  [/devanteprov@gmail\.com/g, 'founder@shippie.example'],
  [/devanteprov/g, 'shippie-founder'],
  [/\/Users\/devante\/Documents\/Shippie/g, '<repo>'],
  [/\/Users\/devante\/\.claude\/[^\s`)]+/g, '<private-agent-path>'],
  [/\/Users\/devante/g, '<home>'],
  [/582bea37051924b1cfeaec7b1cc42603/g, '<cloudflare-account-id>'],
];

const RISKY_PATTERNS = [
  /Devante/i,
  /Providence/i,
  /devanteprov/i,
  /theprovider123/i,
  /582bea37051924b1cfeaec7b1cc42603/i,
  /\/Users\/devante/i,
  /gmail\.com/i,
];

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: options.cwd ?? ROOT,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function normalize(path) {
  return path.split(sep).join('/');
}

function shouldExclude(path) {
  const normalized = normalize(path);
  return (
    EXCLUDE_FILES.has(normalized) ||
    EXCLUDE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function isTextFile(path, buffer) {
  if (buffer.includes(0)) return false;
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const asString = buffer.toString('utf8');
  return !asString.includes('\uFFFD');
}

function sanitizeText(text) {
  let next = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function copyTrackedFiles() {
  const files = run('git', ['ls-files', '-z'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !shouldExclude(file));

  for (const file of files) {
    const source = join(ROOT, file);
    const destination = join(OUT, file);
    const stats = statSync(source);
    if (!stats.isFile()) continue;

    mkdirSync(dirname(destination), { recursive: true });
    const buffer = readFileSync(source);
    if (isTextFile(file, buffer)) {
      writeFileSync(destination, sanitizeText(buffer.toString('utf8')));
    } else {
      writeFileSync(destination, buffer);
    }
  }

  return files.length;
}

function listMirrorFiles() {
  const output = run('git', ['ls-files', '-z'], {
    cwd: OUT,
    encoding: 'buffer',
  }).toString('utf8');
  return output.split('\0').filter(Boolean);
}

function scanMirror() {
  const findings = [];
  const files = INIT_GIT ? listMirrorFiles() : run('find', ['.', '-type', 'f'], { cwd: OUT })
    .split('\n')
    .filter(Boolean)
    .map((file) => file.replace(/^\.\//, ''));

  for (const file of files) {
    const absolute = join(OUT, file);
    const buffer = readFileSync(absolute);
    if (!isTextFile(file, buffer)) continue;
    const text = buffer.toString('utf8');
    for (const pattern of RISKY_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({ file, pattern: String(pattern) });
        break;
      }
    }
  }
  return findings;
}

function initGitMirror() {
  run('git', ['init', '-b', 'main'], { cwd: OUT, stdio: 'pipe' });
  run('git', ['config', 'user.name', 'Shippie'], { cwd: OUT });
  run('git', ['config', 'user.email', 'dev@shippie.app'], { cwd: OUT });
  run('git', ['add', '.'], { cwd: OUT });
  run('git', ['commit', '-m', 'Initial public Shippie release'], { cwd: OUT });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const copied = copyTrackedFiles();
if (INIT_GIT) initGitMirror();

const findings = scanMirror();
if (findings.length > 0) {
  console.error('[public-mirror] risky strings remain in sanitized export:');
  for (const finding of findings.slice(0, 40)) {
    console.error(`- ${finding.file}: ${finding.pattern}`);
  }
  console.error(`\nOutput kept for inspection: ${OUT}`);
  process.exit(1);
}

const head = run('git', ['rev-parse', '--short', 'HEAD']).trim();
const relativeOut = relative(ROOT, OUT);
console.log(`[public-mirror] copied ${copied} tracked files from ${head}`);
console.log(`[public-mirror] wrote sanitized mirror to ${relativeOut || OUT}`);
if (INIT_GIT) {
  console.log('[public-mirror] initialized fresh git history with sanitized author');
}
console.log('\nNext manual step after creating the GitHub org/repo:');
console.log(`  git -C ${OUT} remote add origin git@github.com:shippie-app/shippie.git`);
console.log(`  git -C ${OUT} push -u origin main`);
