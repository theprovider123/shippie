#!/usr/bin/env node
/**
 * @shippie/mcp — MCP server for deploying to Shippie from AI tools.
 *
 * Tools:
 *   deploy   — zip a directory and deploy (authed) or trial-deploy (no auth)
 *   status   — poll a deploy by deploy_id through hot → cold phases
 *   apps     — list maker-owned apps
 *   logs     — read privacy-preserving feedback / usage / function logs
 *   config   — read/write maker shippie.json overrides
 *   templates — list blessed starter templates
 *   deploy_workspace — deploy several connected apps from shippie-workspace.json
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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  classifyKind,
  computeGraduation,
  describeGraduationTier,
  localize,
  type DeploySignals,
  type GraduationInput,
  type LocalizeTransform,
  type UsageSignals,
} from '@shippie/analyse';
import { createClient, formatDeployStreamLine, getTemplate, listTemplates } from '@shippie/core';

// Single shared client — picks up SHIPPIE_API_URL + SHIPPIE_TOKEN/~/.shippie/token.
// Same code path runs against shippie.app and hub.local.
const client = createClient();

const server = new Server(
  { name: 'shippie', version: '0.0.2' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'deploy',
      description:
        'Deploy a directory to Shippie. Returns the live URL, deploy_id, and deploy intelligence transcript. ' +
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
      name: 'apps',
      description:
        'List the authenticated maker’s Shippie apps with status, kind, visibility, and live URL. ' +
        'Use this before modifying or deploying when the user asks what they already have running.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'logs',
      description:
        'Show privacy-preserving maker logs: anonymous feedback, aggregate usage rollups, and function errors. ' +
        'This intentionally omits user ids, session ids, IPs, and arbitrary metadata. Optionally pass slug to scope to one app.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          slug: {
            type: 'string',
            description: 'Optional app slug to scope logs to one app.',
          },
          limit: {
            type: 'number',
            description: 'Rows per section, max 100.',
            default: 20,
          },
        },
      },
    },
    {
      name: 'config',
      description:
        'Read, replace, or reset an app maker shippie.json override. This is the same override shown in the dashboard and applies on the next deploy.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          slug: {
            type: 'string',
            description: 'App slug.',
          },
          action: {
            type: 'string',
            enum: ['get', 'set', 'reset'],
            description: 'get reads the override, set replaces it, reset clears it.',
            default: 'get',
          },
          config: {
            type: 'object',
            description: 'Required when action=set. Full shippie.json override object.',
          },
        },
        required: ['slug'],
      },
    },
    {
      name: 'templates',
      description:
        'List Shippie starter templates and the capability each proves. Pass id to inspect one template.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string',
            description: 'Optional template id, such as recipe-saver or habit-tracker.',
          },
        },
      },
    },
    {
      name: 'deploy_workspace',
      description:
        'Deploy every app declared in a shippie-workspace.json file. Use this for multi-app products such as fan/control/display venue workspaces.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description:
              'Path to shippie-workspace.json, or a directory containing it. Defaults to the current directory.',
          },
          trial: {
            type: 'boolean',
            description: 'Deploy every app as a no-signup trial.',
            default: false,
          },
          dry_run: {
            type: 'boolean',
            description: 'Validate and print the workspace plan without uploading.',
            default: false,
          },
        },
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
    {
      name: 'stream',
      description:
        'Replay the Phase 3 deploy event stream for a given deploy_id. Returns a chronological ' +
        'list of events (deploy_received, security_scan_started, secret_detected, ' +
        'kind_classified, health_check_finished, deploy_live, etc) with timings. Use this after ' +
        'a deploy finishes to see exactly what the pipeline did, fixed, and flagged.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          deploy_id: {
            type: 'string',
            description: 'Deploy id returned by the `deploy` tool.',
          },
        },
        required: ['deploy_id'],
      },
    },
    {
      name: 'graduation',
      description:
        'Compute the graduation tier (experimental / maker-friendly / lived-in / graduate) for ' +
        'an app from its deploy signals (security score, privacy grade, AppProfile category, ' +
        'cross-app intents) plus optional usage signals (weekly active users, retention, ' +
        'sustained-week count). Returns the earned criteria and the concrete next-tier ' +
        'criteria the maker still has to clear. Use this when a maker asks "how close am I to ' +
        'graduating?" or wants a checklist for the next tier. Signals are passed in directly — ' +
        'this tool is pure analysis with no Shippie API call.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          security_score: {
            type: ['number', 'null'] as const,
            description: 'Phase 4 Stage A security score 0..100, or null if unscored.',
          },
          privacy_grade: {
            type: ['string', 'null'] as const,
            enum: ['A+', 'A', 'B', 'C', 'F', null],
            description: 'Phase 4 Stage A privacy grade, or null if ungraded.',
          },
          category: {
            type: 'string',
            description: 'AppProfile category (e.g. "cooking" / "fitness" / "unknown").',
          },
          intents_provided: { type: 'number', description: 'Distinct cross-app intents declared.' },
          intents_consumed: { type: 'number', description: 'Distinct cross-app intents consumed.' },
          external_domain_count: {
            type: 'number',
            description: 'External network domains the app declares.',
          },
          weekly_active_users: { type: 'number', description: 'Optional. WAU last 7 days.' },
          weeks_with_activity: {
            type: 'number',
            description: 'Optional. Weeks (of last 4) with non-zero WAU.',
          },
          median_session_seconds: {
            type: 'number',
            description: 'Optional. Median session duration (s).',
          },
          day1_retention_rate: {
            type: 'number',
            description: 'Optional. 0..1 fraction returning the next day.',
          },
        },
        required: ['security_score', 'privacy_grade', 'category', 'intents_provided', 'intents_consumed', 'external_domain_count'],
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

  if (name === 'apps') {
    return await handleApps();
  }

  if (name === 'logs') {
    return await handleLogs(args as { slug?: string; limit?: number });
  }

  if (name === 'config') {
    return await handleConfig(args as { slug: string; action?: string; config?: Record<string, unknown> });
  }

  if (name === 'templates') {
    return handleTemplates(args as { id?: string });
  }

  if (name === 'deploy_workspace') {
    return await handleDeployWorkspace(args as { path?: string; trial?: boolean; dry_run?: boolean });
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

  if (name === 'stream') {
    return await handleStream(args as { deploy_id: string });
  }

  if (name === 'graduation') {
    return handleGraduation(args as Record<string, unknown>);
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

function handleGraduation(args: Record<string, unknown>) {
  const deploy: DeploySignals = {
    securityScore: numericOrNull(args.security_score),
    privacyGrade: privacyGradeOrNull(args.privacy_grade),
    category: typeof args.category === 'string' ? args.category : 'unknown',
    intentsProvided: numericOrZero(args.intents_provided),
    intentsConsumed: numericOrZero(args.intents_consumed),
    externalDomainCount: numericOrZero(args.external_domain_count),
  };
  const usage =
    typeof args.weekly_active_users === 'number'
      ? ({
          weeklyActiveUsers: args.weekly_active_users,
          weeksWithActivity: numericOrZero(args.weeks_with_activity),
          medianSessionSeconds: numericOrZero(args.median_session_seconds),
          day1RetentionRate: numericOrZero(args.day1_retention_rate),
        } satisfies UsageSignals)
      : undefined;
  const input: GraduationInput = { deploy, usage };
  const report = computeGraduation(input);
  const lines = [
    `Tier: ${report.tier} — ${describeGraduationTier(report.tier)}`,
    '',
    'Earned:',
    ...(report.earnedCriteria.length > 0
      ? report.earnedCriteria.map((c) => `  ✓ ${c}`)
      : ['  (none yet)']),
    '',
    `Next tier: ${report.nextTier ?? 'none — already graduated'}`,
  ];
  if (report.nextTierCriteria.length > 0) {
    lines.push('To-do:', ...report.nextTierCriteria.map((c) => `  • ${c}`));
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function numericOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numericOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function privacyGradeOrNull(value: unknown): DeploySignals['privacyGrade'] {
  if (value === 'A+' || value === 'A' || value === 'B' || value === 'C' || value === 'F') return value;
  return null;
}

async function handleStream(args: { deploy_id: string }) {
  // Replay-mode stream — no delay because Claude Code reads the full
  // tool output at once.
  const lines: string[] = [];
  try {
    for await (const event of client.stream(args.deploy_id, { replayDelayMs: 0 })) {
      lines.push(formatDeployStreamLine(event.type, event.data));
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Stream failed: ${(err as Error).message}` }],
      isError: true,
    };
  }
  if (lines.length === 0) {
    return {
      content: [{ type: 'text', text: `No events for deploy ${args.deploy_id} (yet?)` }],
    };
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleDeploy(args: { directory: string; slug?: string; trial?: boolean }) {
  // All deploy logic now in @shippie/core. MCP just adapts the result to
  // the MCP tool-response shape. CLI will use the same core call.
  const result = await client.deploy({
    directory: args.directory,
    slug: args.slug,
    trial: args.trial,
  });

  if (!result.ok) {
    if (result.error === 'rate_limit') {
      return {
        content: [{ type: 'text', text: 'Rate limit hit. Try again in a moment.' }],
        isError: true,
      };
    }
    if (result.error === 'trial_rate_limit') {
      return {
        content: [
          {
            type: 'text',
            text: 'Trial rate limit hit (3/hour/IP). Wait an hour or authenticate for unlimited deploys.',
          },
        ],
        isError: true,
      };
    }
    if (result.error?.startsWith('no_auth_token')) {
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
    const lines = [`Deploy failed: ${result.error ?? 'unknown error'}`];
    const blockers = result.preflight?.blockers ?? [];
    if (blockers.length > 0) {
      lines.push('', 'Blocked by:');
      for (const blocker of blockers.slice(0, 8)) {
        lines.push(`- ${blocker.title}`);
        if (blocker.detail) lines.push(`  ${blocker.detail}`);
      }
      if (blockers.length > 8) lines.push(`- ...and ${blockers.length - 8} more`);
    }
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      isError: true,
    };
  }

  const lines = [
    `${args.trial ? 'Trial deployed' : 'Deployed'}: ${result.slug}`,
    `Live:      ${result.liveUrl}`,
  ];
  if (result.version != null) lines.push(`Version:   v${result.version}`);
  if (result.deployId)        lines.push(`Deploy:    ${result.deployId}`);
  if (result.files != null)   lines.push(`Files:     ${result.files}`);
  if (result.totalBytes != null) lines.push(`Bytes:     ${result.totalBytes}`);
  if (result.expiresAt)       lines.push(`Expires:   ${result.expiresAt} (sign in to claim)`);
  if (result.claimUrl)        lines.push(`Claim:     ${client.apiUrl}${result.claimUrl}`);
  lines.push('');
  if (result.deployId) {
    lines.push('Deploy intelligence:');
    const streamLines = await collectDeployStream(result.deployId);
    if (streamLines.length > 0) {
      lines.push(...streamLines);
    } else {
      lines.push(`No stream events yet. Replay later with: stream(deploy_id="${result.deployId}")`);
    }
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function collectDeployStream(deployId: string): Promise<string[]> {
  const lines: string[] = [];
  try {
    for await (const event of client.stream(deployId, { replayDelayMs: 0 })) {
      if (event.type === 'ready' || event.type === 'end') continue;
      lines.push(formatDeployStreamLine(event.type, event.data));
      if (lines.length >= 80) {
        lines.push(`...truncated. Replay full stream with: stream(deploy_id="${deployId}")`);
        break;
      }
    }
  } catch (err) {
    lines.push(`Stream unavailable: ${(err as Error).message}`);
  }
  return lines;
}

async function handleStatus(args: { deploy_id: string }) {
  const result = await client.status(args.deploy_id);
  if (!result.ok) {
    if (result.error === 'deploy_not_found') {
      return {
        content: [{ type: 'text', text: `Deploy not found: ${args.deploy_id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `Status request failed: ${result.error ?? 'unknown'}` }],
      isError: true,
    };
  }

  const dur = result.durationMs ? ` (${(result.durationMs / 1000).toFixed(1)}s)` : '';
  return {
    content: [
      {
        type: 'text',
        text: `${result.slug} v${result.version} · phase=${result.phase}${dur}`,
      },
    ],
  };
}

async function handleApps() {
  try {
    const apps = await client.appsList();
    if (apps.length === 0) {
      return { content: [{ type: 'text', text: 'No apps found for this maker.' }] };
    }
    const lines = ['Your Shippie apps:', ''];
    for (const app of apps) {
      const meta = [
        app.status,
        app.kind ? `kind=${app.kind}` : null,
        app.visibility ? `visibility=${app.visibility}` : null,
      ].filter(Boolean);
      lines.push(`- ${app.slug} — ${app.name} (${meta.join(', ')})`);
      if (app.liveUrl) lines.push(`  ${app.liveUrl}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    const hint =
      message === 'no_auth_token' || message === 'unauthenticated'
        ? 'No valid Shippie token found. Run `shippie login` or set SHIPPIE_TOKEN.'
        : `Apps request failed: ${message}`;
    return { content: [{ type: 'text', text: hint }], isError: true };
  }
}

async function handleLogs(args: { slug?: string; limit?: number }) {
  try {
    const logs = await client.logs({ slug: args.slug, limit: args.limit });
    const lines = [
      args.slug ? `Logs for ${args.slug}` : 'Recent Shippie logs',
      '',
    ];

    if (logs.feedback.length === 0 && logs.usage.length === 0 && logs.functions.length === 0) {
      lines.push('No feedback, usage rollups, or function logs yet.');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (logs.feedback.length > 0) {
      lines.push('Feedback:');
      for (const item of logs.feedback) {
        const rating = item.rating ? ` - ${item.rating}/5` : '';
        lines.push(`- ${item.appSlug} - ${item.type} - ${item.status}${rating} - ${item.createdAt}`);
        if (item.title) lines.push(`  ${item.title}`);
        if (item.body) lines.push(`  ${item.body}`);
      }
      lines.push('');
    }

    if (logs.usage.length > 0) {
      lines.push('Usage rollups:');
      for (const item of logs.usage) {
        lines.push(`- ${item.appSlug} - ${item.day} - ${item.eventType}: ${item.count}`);
      }
      lines.push('');
    }

    if (logs.functions.length > 0) {
      lines.push('Function logs:');
      for (const item of logs.functions) {
        const status = item.status == null ? 'unknown' : String(item.status);
        const duration = item.durationMs == null ? '' : ` - ${item.durationMs}ms`;
        lines.push(`- ${item.appSlug} - ${item.functionName} ${item.method} ${status}${duration} - ${item.createdAt}`);
        if (item.error) lines.push(`  ${item.error}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    const hint =
      message === 'no_auth_token' || message === 'unauthenticated'
        ? 'No valid Shippie token found. Run `shippie login` or set SHIPPIE_TOKEN.'
        : `Logs request failed: ${message}`;
    return { content: [{ type: 'text', text: hint }], isError: true };
  }
}

async function handleConfig(args: { slug: string; action?: string; config?: Record<string, unknown> }) {
  try {
    const action = args.action ?? 'get';
    if (action === 'set' && !args.config) {
      return {
        content: [{ type: 'text', text: 'Config request failed: action=set requires a config object.' }],
        isError: true,
      };
    }
    const result =
      action === 'reset'
        ? await client.config.reset(args.slug)
        : action === 'set'
          ? await client.config.set(args.slug, args.config!)
          : await client.config.get(args.slug);

    const heading =
      action === 'reset'
        ? 'Config override reset.'
        : action === 'set'
          ? 'Config override saved. It applies on the next deploy.'
          : 'Config override:';
    return {
      content: [
        {
          type: 'text',
          text: [
            heading,
            `App: ${result.slug}`,
            `Override: ${result.hasOverride ? 'yes' : 'no'}`,
            JSON.stringify(result.config, null, 2),
          ].join('\n'),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    const hint =
      message === 'no_auth_token' || message === 'unauthenticated'
        ? 'No valid Shippie token found. Run `shippie login` or set SHIPPIE_TOKEN.'
        : `Config request failed: ${message}`;
    return { content: [{ type: 'text', text: hint }], isError: true };
  }
}

function handleTemplates(args: { id?: string }) {
  const templates = args.id ? [getTemplate(args.id)].filter(isPresent) : listTemplates();
  if (args.id && templates.length === 0) {
    return {
      content: [{ type: 'text', text: `Unknown template: ${args.id}` }],
      isError: true,
    };
  }

  const lines = [args.id ? `Template: ${args.id}` : 'Shippie templates', ''];
  for (const template of templates) {
    lines.push(`${template.id} - ${template.name}`);
    lines.push(`  ${template.description}`);
    lines.push(`  proves: ${template.proves.capability}`);
    lines.push(`  assertion: ${template.proves.assertion}`);
    const intents = [
      template.intents?.provides?.length ? `provides ${template.intents.provides.join(', ')}` : null,
      template.intents?.consumes?.length ? `consumes ${template.intents.consumes.join(', ')}` : null,
    ].filter(Boolean);
    if (intents.length > 0) lines.push(`  intents: ${intents.join(' - ')}`);
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n').trimEnd() }] };
}

async function handleDeployWorkspace(args: { path?: string; trial?: boolean; dry_run?: boolean }) {
  try {
    const result = await client.workspace.deploy({
      path: args.path ?? '.',
      trial: args.trial,
      dryRun: args.dry_run,
    });

    if (!result.ok && result.error) {
      return {
        content: [{ type: 'text', text: `Workspace failed: ${result.error}` }],
        isError: true,
      };
    }

    const lines = [
      `Workspace: ${result.plan.workspace}`,
      `Plan: ${result.plan.file}`,
      '',
    ];

    if (args.dry_run) {
      lines.push('Apps:');
      for (const app of result.apps) {
        const role = app.role ? ` (${app.role})` : '';
        lines.push(`- ${app.slug}${role}: ${app.absoluteDirectory}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    for (const app of result.apps) {
      const role = app.role ? ` (${app.role})` : '';
      if (app.result?.ok) {
        lines.push(`- ${app.slug}${role}: live`);
        if (app.result.liveUrl) lines.push(`  ${app.result.liveUrl}`);
        if (app.result.deployId) lines.push(`  deploy: ${app.result.deployId}`);
      } else {
        lines.push(`- ${app.slug}${role}: failed`);
        lines.push(`  ${app.result?.error ?? 'unknown_error'}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }], isError: !result.ok };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    const hint =
      message === 'no_auth_token' || message === 'unauthenticated'
        ? 'No valid Shippie token found. Run `shippie login` or set SHIPPIE_TOKEN.'
        : `Workspace failed: ${message}`;
    return { content: [{ type: 'text', text: hint }], isError: true };
  }
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
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
