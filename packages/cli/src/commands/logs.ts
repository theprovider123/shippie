/**
 * `shippie logs` — privacy-preserving maker logs.
 *
 * Shows feedback, aggregate usage, and function errors without exposing raw
 * user/session identifiers or arbitrary event metadata.
 */
import { createClient, type LogsResult } from '@shippie/core';

export async function logsCommand(slug: string | undefined, opts: {
  api?: string;
  json?: boolean;
  limit?: string;
}): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });
  const limit = parseLimit(opts.limit);

  try {
    const logs = await client.logs({ slug, limit });
    if (opts.json) {
      console.log(JSON.stringify(logs, null, 2));
      return;
    }
    printLogs(logs, slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message === 'no_auth_token' || message === 'unauthenticated') {
      console.error('Not logged in. Run: shippie login');
      process.exit(1);
    }
    console.error(`Could not fetch logs: ${message}`);
    process.exit(1);
  }
}

function printLogs(logs: LogsResult, slug: string | undefined): void {
  console.log('');
  console.log(slug ? `Logs for ${slug}` : 'Recent Shippie logs');
  console.log('-------------------');

  if (logs.feedback.length === 0 && logs.usage.length === 0 && logs.functions.length === 0) {
    console.log('No feedback, usage rollups, or function logs yet.');
    console.log('');
    return;
  }

  if (logs.feedback.length > 0) {
    console.log('');
    console.log('Feedback');
    for (const item of logs.feedback) {
      const rating = item.rating ? ` - ${item.rating}/5` : '';
      console.log(`- ${item.appSlug} - ${item.type} - ${item.status}${rating} - ${item.createdAt}`);
      if (item.title) console.log(`  ${item.title}`);
      if (item.body) console.log(`  ${item.body}`);
    }
  }

  if (logs.usage.length > 0) {
    console.log('');
    console.log('Usage rollups');
    for (const item of logs.usage) {
      console.log(`- ${item.appSlug} - ${item.day} - ${item.eventType}: ${item.count}`);
    }
  }

  if (logs.functions.length > 0) {
    console.log('');
    console.log('Function logs');
    for (const item of logs.functions) {
      const status = item.status == null ? 'unknown' : String(item.status);
      const duration = item.durationMs == null ? '' : ` - ${item.durationMs}ms`;
      console.log(`- ${item.appSlug} - ${item.functionName} ${item.method} ${status}${duration} - ${item.createdAt}`);
      if (item.error) console.log(`  ${item.error}`);
    }
  }

  console.log('');
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}
