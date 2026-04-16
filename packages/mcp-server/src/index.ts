#!/usr/bin/env node
/**
 * @shippie/mcp — MCP server for deploying to Shippie from AI tools.
 *
 * Tools:
 *   deploy   — zip a directory and deploy (authed) or trial-deploy (no auth)
 *   status   — poll a deploy by deploy_id through hot → cold phases
 *   apps     — placeholder; wire up when the maker apps list endpoint lands
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
import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
