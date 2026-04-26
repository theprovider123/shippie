#!/usr/bin/env node
/**
 * @shippie/mcp — MCP server for deploying to Shippie from AI tools.
 *
 * Tools:
 *   deploy   — zip a directory and deploy (authed) or trial-deploy (no auth)
 *   status   — poll a deploy by deploy_id through hot → cold phases
 *   apps     — placeholder; wire up when the maker apps list endpoint lands
 *
 * Note on uploads: `AdmZip` builds the archive in memory (no temp file on
 * disk) and FormData wraps the Buffer into a Blob that Node's undici fetch
 * streams to the platform. No intermediate disk I/O — the C4 concern is
 * latent, not actual, for typical build outputs.
 *
 * MIT license.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import AdmZip from 'adm-zip';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join, relative } from 'node:path';
import { classifyKind, localize, type LocalizeTransform } from '@shippie/analyse';

const API_URL = process.env.SHIPPIE_API_URL ?? 'https://shippie.app';

function getToken(): string | null {
  const tokenPath = resolve(process.env.HOME ?? '~', '.shippie', 'token');
  if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim();
  return process.env.SHIPPIE_TOKEN ?? null;
}

const server = new Server(
  { name: 'shippie', version: '0.0.2' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'deploy',
      description:
        'Deploy a directory to Shippie. Returns the live URL and a deploy_id for status polling. ' +
        'Pass trial=true for a no-signup 24-hour trial deploy (no authentication required).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          directory: {
            type: 'string',
            description: 'Absolute path to the build output directory',
          },
          slug: {
            type: 'string',
            description:
              'App slug (lowercase, hyphens). Auto-generated from dir name if omitted. ' +
              'Ignored when trial=true (trial slugs are randomly assigned).',
          },
          trial: {
            type: 'boolean',
            description:
              'Trial deploy — no signup needed, 24-hour TTL, 50MB limit. ' +
              'Good for first-run demos and E2E testing the B2 trial backend.',
            default: false,
          },
        },
        required: ['directory'],
      },
    },
    {
      name: 'status',
      description:
        'Poll the deploy pipeline phase for a given deploy_id. ' +
        'Phases: building | ready | cold-pending | done | failed. ' +
        'Returns immediately (single-shot). Call repeatedly to watch progress.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          deploy_id: {
            type: 'string',
            description: 'The deploy_id returned by the deploy tool',
          },
        },
        required: ['deploy_id'],
      },
    },
    {
      name: 'classify_kind',
      description:
        "Classify an app source directory as Shippie's Local / Connected / Cloud. " +
        'Static analysis only — same classifier used at deploy time. ' +
        'Returns the detected kind, reasons, external domains, backend providers, ' +
        'local signals, and Localize candidacy. Use this BEFORE building to know ' +
        'how the app will be labelled in the marketplace.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          directory: {
            type: 'string',
            description: 'Absolute path to the app source directory.',
          },
        },
        required: ['directory'],
      },
    },
    {
      name: 'localize_plan',
      description:
        'Generate reviewable source patches that migrate a Cloud app toward Local. ' +
        'Supported transforms: supabase-basic-queries, authjs-to-local-identity, ' +
        'supabase-storage-to-local-files. Returns a patch list (per-file before/after + ' +
        'new shim files) the maker can review and apply. No files are written.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          directory: {
            type: 'string',
            description: 'Absolute path to the app source directory.',
          },
          transforms: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional explicit transform list. If omitted, uses the candidacy ' +
              'output from classify_kind (only applies to Cloud apps with no blockers).',
          },
        },
        required: ['directory'],
      },
    },
    {
      name: 'app_kinds_doc',
      description:
        'Return the Shippie App Kinds vocabulary — Local / Connected / Cloud definitions, ' +
        'proof rules, and how detection vs. declaration vs. proof interact. Use this when ' +
        'helping a user decide how to architect a new app for Shippie. Pulls from the ' +
        'docs/app-kinds.md authoritative source.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'deploy') {
    return await handleDeploy(args as { directory: string; slug?: string; trial?: boolean });
  }

  if (name === 'status') {
    return await handleStatus(args as { deploy_id: string });
  }

  if (name === 'classify_kind') {
    return handleClassifyKind(args as { directory: string });
  }

  if (name === 'localize_plan') {
    return handleLocalizePlan(args as { directory: string; transforms?: string[] });
  }

  if (name === 'app_kinds_doc') {
    return handleAppKindsDoc();
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

async function handleDeploy(args: { directory: string; slug?: string; trial?: boolean }) {
  const dir = args.directory;

  if (!existsSync(dir)) {
    return { content: [{ type: 'text', text: `Directory not found: ${dir}` }], isError: true };
  }

  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  const buffer = zip.toBuffer();

  const form = new FormData();
  form.append('zip', new Blob([buffer]), 'deploy.zip');

  const endpoint = args.trial ? '/api/deploy/trial' : '/api/deploy';
  const headers: Record<string, string> = {};

  if (!args.trial) {
    const slug = args.slug ?? basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    form.append('slug', slug);

    const token = getToken();
    if (!token) {
      return {
        content: [
          {
            type: 'text',
            text:
              'No auth token found. Either run `shippie login` to authenticate, ' +
              'set SHIPPIE_TOKEN in the environment, or retry with trial=true.',
          },
        ],
        isError: true,
      };
    }
    headers['authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', body: form, headers });

  if (res.status === 429) {
    return {
      content: [
        {
          type: 'text',
          text:
            args.trial
              ? 'Trial rate limit hit (3/hour/IP). Wait an hour or authenticate for unlimited deploys.'
              : 'Rate limit hit. Try again in a moment.',
        },
      ],
      isError: true,
    };
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    return {
      content: [{ type: 'text', text: `Deploy failed: ${json.error ?? json.reason ?? res.statusText}` }],
      isError: true,
    };
  }

  const lines = [
    `${args.trial ? 'Trial deployed' : 'Deployed'}: ${json.slug}`,
    `Live:      ${json.live_url}`,
  ];
  if (json.version != null) lines.push(`Version:   v${json.version}`);
  if (json.deploy_id)       lines.push(`Deploy:    ${json.deploy_id}`);
  if (json.files != null)   lines.push(`Files:     ${json.files}`);
  if (json.expires_at)      lines.push(`Expires:   ${json.expires_at} (sign in to claim)`);
  lines.push('');
  lines.push(`Poll with: status(deploy_id="${json.deploy_id}")`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleStatus(args: { deploy_id: string }) {
  const res = await fetch(`${API_URL}/api/deploy/${encodeURIComponent(args.deploy_id)}/status`);
  if (res.status === 404) {
    return { content: [{ type: 'text', text: `Deploy not found: ${args.deploy_id}` }], isError: true };
  }
  if (!res.ok) {
    return {
      content: [{ type: 'text', text: `Status request failed: ${res.status} ${res.statusText}` }],
      isError: true,
    };
  }

  const json = (await res.json()) as {
    deploy_id: string;
    slug: string;
    version: number;
    phase: string;
    duration_ms: number | null;
  };

  const dur = json.duration_ms ? ` (${(json.duration_ms / 1000).toFixed(1)}s)` : '';
  return {
    content: [
      {
        type: 'text',
        text: `${json.slug} v${json.version} · phase=${json.phase}${dur}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// App Kinds tools
// ---------------------------------------------------------------------------

const SCANNED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte', '.html', '.css', '.vue',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.svelte-kit', '.turbo', 'build', '.git']);
const MAX_FILES = 500;
const MAX_BYTES_PER_FILE = 1_000_000;

function loadAppFiles(directory: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  if (!existsSync(directory)) return files;

  function walk(dir: string) {
    if (files.size >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        const ext = entry.includes('.') ? '.' + entry.split('.').pop()!.toLowerCase() : '';
        if (!SCANNED_EXTENSIONS.has(ext)) continue;
        if (st.size > MAX_BYTES_PER_FILE) continue;
        try {
          const data = readFileSync(full);
          files.set(relative(directory, full), new Uint8Array(data));
        } catch {
          /* unreadable — skip */
        }
      }
      if (files.size >= MAX_FILES) return;
    }
  }

  walk(directory);
  return files;
}

function handleClassifyKind(args: { directory: string }) {
  if (!existsSync(args.directory)) {
    return { content: [{ type: 'text', text: `Directory not found: ${args.directory}` }], isError: true };
  }
  const files = loadAppFiles(args.directory);
  if (files.size === 0) {
    return {
      content: [
        { type: 'text', text: `No scannable source files in ${args.directory}` },
      ],
      isError: true,
    };
  }
  const detection = classifyKind(files);
  const lines = [
    `Detected kind: ${detection.detectedKind.toUpperCase()}`,
    `Confidence: ${detection.confidence.toFixed(2)} (${files.size} files scanned)`,
    '',
    'Reasons:',
    ...detection.reasons.map((r) => '  • ' + r),
  ];
  if (detection.backendProviders.length) {
    lines.push('', 'Backend providers: ' + detection.backendProviders.join(', '));
  }
  if (detection.externalDomains.length) {
    lines.push('External domains: ' + detection.externalDomains.join(', '));
  }
  if (detection.localSignals.length) {
    lines.push('Local signals: ' + detection.localSignals.join(', '));
  }
  lines.push('');
  if (detection.localization.candidate) {
    lines.push(
      `Localize candidate: yes — supported transforms: ${detection.localization.supportedTransforms.join(', ')}`,
    );
  } else if (detection.localization.blockers.length) {
    lines.push(
      `Localize blockers: ${detection.localization.blockers.join(', ')} — Remix may apply.`,
    );
  } else {
    lines.push('Localize candidate: no.');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function handleLocalizePlan(args: { directory: string; transforms?: string[] }) {
  if (!existsSync(args.directory)) {
    return { content: [{ type: 'text', text: `Directory not found: ${args.directory}` }], isError: true };
  }
  const files = loadAppFiles(args.directory);
  const detection = classifyKind(files);
  const requested = (args.transforms ?? detection.localization.supportedTransforms) as LocalizeTransform[];

  if (requested.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text:
            'No transforms to apply. ' +
            (detection.localization.blockers.length
              ? `Blockers: ${detection.localization.blockers.join(', ')}.`
              : 'This app is already Local-eligible — nothing to migrate.'),
        },
      ],
    };
  }

  const patches = localize({ files, transforms: requested });
  if (patches.every((p) => p.fileChanges.length === 0)) {
    return {
      content: [
        { type: 'text', text: 'No source files matched the requested transforms.' },
      ],
    };
  }

  const lines: string[] = [];
  for (const patch of patches) {
    lines.push(`# Transform: ${patch.transform}`);
    if (patch.warnings.length) {
      lines.push('Warnings:');
      for (const w of patch.warnings) lines.push('  ! ' + w);
    }
    if (patch.fileChanges.length) {
      lines.push('Files changed:');
      for (const fc of patch.fileChanges) lines.push('  • ' + fc.path);
    }
    if (patch.newFiles.length) {
      lines.push('New files:');
      for (const nf of patch.newFiles) lines.push('  + ' + nf.path);
    }
    lines.push('');
  }
  lines.push(
    'Diffs are descriptive only. Apply via your IDE or by writing the `after` ' +
      'content of each FileChange and creating each NewFile, then re-deploy.',
  );
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function handleAppKindsDoc() {
  const text = [
    'Shippie App Kinds — Local / Connected / Cloud',
    '',
    'Every app on Shippie is classified by where its data lives and whether',
    'it works offline. The classifier runs at deploy time and the badge is',
    'upgraded by runtime proof events from real devices.',
    '',
    'LOCAL — Your app data lives on your device. Core features work offline.',
    '  Allowed traffic: Shippie wrapper / proof / update + declared static',
    '  CDN. No external data dependencies.',
    '',
    'CONNECTED — Your app data lives on your device. The app fetches live',
    '  information (weather, prices, news, AI inference, real-time peer',
    '  sync) when online. Personal data stays local; external data needs',
    '  internet.',
    '',
    'CLOUD — Your app data or core app state lives on someone else\'s server.',
    '  Usually requires an account or hosted backend.',
    '',
    'When building for Shippie, prefer Local. Use @shippie/sdk\'s local DB',
    '(wa-sqlite + OPFS), local files, and local AI primitives instead of',
    'Supabase, Firebase, or hosted backends.',
    '',
    'Authentication: Shippie\'s "local identity" model has no providers. The',
    'user is "logged in" as themselves on their own device. No login screen',
    'is needed for most apps.',
    '',
    'Use the classify_kind MCP tool to check what kind a project will be.',
    'Use localize_plan to migrate a Cloud app toward Local.',
    '',
    'Authoritative reference: docs/app-kinds.md in the Shippie repo.',
  ].join('\n');
  return { content: [{ type: 'text', text }] };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
