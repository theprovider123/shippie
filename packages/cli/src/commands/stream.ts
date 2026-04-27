/**
 * `shippie stream <deploy-id>` — replay the deploy event stream.
 *
 * Same code path as the MCP `stream` tool: client.stream() backed by
 * @shippie/core. Pretty-prints events as they arrive.
 */
import { createClient } from '@shippie/core';

interface StreamOptions {
  api?: string;
  delay?: string;
}

export async function streamCommand(deployId: string, opts: StreamOptions): Promise<void> {
  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });
  const replayDelayMs = Number(opts.delay ?? '30');

  try {
    for await (const event of client.stream(deployId, { replayDelayMs })) {
      console.log(formatStreamLine(event.type, event.data));
    }
  } catch (err) {
    console.error(`Stream failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

function formatStreamLine(type: string, data: Record<string, unknown>): string {
  const elapsed =
    typeof data.elapsedMs === 'number' ? `${(data.elapsedMs / 1000).toFixed(2).padStart(6)}s` : '   ----';
  switch (type) {
    case 'deploy_received':
      return `[${elapsed}] deploy_received  ${data.slug} v${data.version} (${data.files} files, ${data.bytes} bytes)`;
    case 'security_scan_started':
      return `[${elapsed}] security_scan    scanning ${data.filesToScan} files...`;
    case 'secret_detected':
      return `[${elapsed}] secret_detected  ${String(data.severity).toUpperCase()} ${data.rule} in ${data.location}`;
    case 'security_scan_finished':
      return `[${elapsed}] security_done    ${data.blocks} block · ${data.warns} warn · ${data.infos} info`;
    case 'privacy_audit_finished':
      return `[${elapsed}] privacy_done     ${data.trackers} tracker · ${data.feature} feature · ${data.cdn} cdn · ${data.unknown} unknown`;
    case 'kind_classified':
      return `[${elapsed}] kind_classified  detected=${data.detected} public=${data.publicKind} (${Math.round(((data.confidence as number) ?? 0) * 100)}%)`;
    case 'essentials_injected':
      return `[${elapsed}] essentials       ${(data.injected as string[] | undefined)?.join(', ') ?? ''}`;
    case 'upload_started':
      return `[${elapsed}] upload_started   ${data.files} files`;
    case 'upload_finished':
      return `[${elapsed}] upload_finished  ${data.bytes} bytes`;
    case 'health_check_finished':
      return `[${elapsed}] health_check     ${data.passed ? 'PASS' : 'FAIL'} (${data.warnings} warn, ${data.failures} fail)`;
    case 'deploy_live':
      return `[${elapsed}] deploy_live      ${data.liveUrl} (${data.durationMs}ms total)`;
    case 'deploy_failed':
      return `[${elapsed}] deploy_failed    ${data.step}: ${data.reason}`;
    default:
      return `[${elapsed}] ${type.padEnd(16)} ${JSON.stringify(data)}`;
  }
}
