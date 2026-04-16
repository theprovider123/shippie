#!/usr/bin/env node
/**
 * @shippie/mcp — MCP server for deploying to Shippie from AI tools.
 *
 * Tools:
 *   deploy   — deploy a directory to Shippie
 *   status   — check deploy status for an app
 *   apps     — list your deployed apps
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const API_URL = process.env.SHIPPIE_API_URL ?? 'https://shippie.app';

function getToken(): string | null {
  const tokenPath = resolve(process.env.HOME ?? '~', '.shippie', 'token');
  if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim();
  return process.env.SHIPPIE_TOKEN ?? null;
}

const server = new Server(
  { name: 'shippie', version: '0.0.1' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'deploy',
      description: 'Deploy a directory to Shippie. Returns the live URL.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          directory: { type: 'string', description: 'Absolute path to the build output directory' },
          slug: { type: 'string', description: 'App slug (lowercase, hyphens). Auto-generated from dir name if omitted.' },
        },
        required: ['directory'],
      },
    },
    {
      name: 'status',
      description: 'Check deploy status for a Shippie app.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          slug: { type: 'string', description: 'App slug' },
        },
        required: ['slug'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'deploy') {
    const dir = (args as { directory: string }).directory;
    const slug = (args as { slug?: string }).slug ?? basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');

    if (!existsSync(dir)) {
      return { content: [{ type: 'text', text: `Directory not found: ${dir}` }], isError: true };
    }

    const zip = new AdmZip();
    zip.addLocalFolder(dir);
    const buffer = zip.toBuffer();

    const form = new FormData();
    form.append('slug', slug);
    form.append('zip', new Blob([buffer]), 'deploy.zip');

    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/api/deploy`, { method: 'POST', body: form, headers });
    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `Deploy failed: ${json.error ?? json.reason ?? res.statusText}` }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Deployed ${slug} v${json.version}\nLive: ${json.live_url}\nFiles: ${json.files}`,
      }],
    };
  }

  if (name === 'status') {
    const slug = (args as { slug: string }).slug;
    const res = await fetch(`${API_URL}/apps/${slug}`);
    if (!res.ok) {
      return { content: [{ type: 'text', text: `App not found: ${slug}` }], isError: true };
    }
    return {
      content: [{ type: 'text', text: `${slug} is live at https://${slug}.shippie.app` }],
    };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
