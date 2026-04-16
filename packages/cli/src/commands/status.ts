/**
 * shippie status <deploy-id>
 *
 * Polls /api/deploy/[id]/status until the deploy reaches a terminal phase.
 *
 * Phases: building → ready → cold-pending → done (or failed)
 *
 * See apps/web/app/api/deploy/[id]/status/route.ts for phase semantics.
 */

interface StatusResponse {
  deploy_id: string;
  slug: string;
  version: number;
  source_type: string;
  phase: 'building' | 'ready' | 'cold-pending' | 'done' | 'failed';
  status: string;
  autopackaging_status: string | null;
  duration_ms: number | null;
}

const TERMINAL_PHASES = new Set(['done', 'failed']);

export async function statusCommand(
  deployId: string,
  opts: { api?: string; watch?: boolean; interval?: string },
) {
  const apiUrl = opts.api ?? 'https://shippie.app';
  const intervalMs = Number(opts.interval ?? 2000);

  if (!deployId) {
    console.error('Usage: shippie status <deploy-id>');
    process.exit(1);
  }

  const once = !opts.watch;
  let lastPhase = '';

  while (true) {
    const res = await fetch(`${apiUrl}/api/deploy/${encodeURIComponent(deployId)}/status`);
    if (res.status === 404) {
      console.error(`Deploy not found: ${deployId}`);
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`Status request failed: ${res.status} ${res.statusText}`);
      process.exit(1);
    }

    const body = (await res.json()) as StatusResponse;
    if (body.phase !== lastPhase) {
      lastPhase = body.phase;
      console.log(formatLine(body));
    }

    if (once || TERMINAL_PHASES.has(body.phase)) {
      if (body.phase === 'failed') process.exit(2);
      return;
    }

    await sleep(intervalMs);
  }
}

function formatLine(s: StatusResponse): string {
  const dur = s.duration_ms ? ` (${(s.duration_ms / 1000).toFixed(1)}s)` : '';
  const icon = iconFor(s.phase);
  return `${icon} ${s.slug} v${s.version} · ${s.phase}${dur}`;
}

function iconFor(phase: string): string {
  switch (phase) {
    case 'building':     return '⏳';
    case 'ready':        return '→';
    case 'cold-pending': return '…';
    case 'done':         return '✓';
    case 'failed':       return '✗';
    default:             return '·';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
