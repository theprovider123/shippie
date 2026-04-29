/**
 * Human-readable deploy stream formatting shared by CLI and MCP.
 *
 * Keep this in core so every maker interface renders the same deploy
 * intelligence transcript from the same SSE event source.
 */

export function formatDeployStreamLine(type: string, data: Record<string, unknown>): string {
  const elapsed = formatElapsed(data.elapsedMs);
  switch (type) {
    case 'ready':
      return `[${elapsed}] stream_ready      ${data.slug ?? 'deploy'} v${data.version ?? '?'} (${data.eventCount ?? 0} events)`;
    case 'pending':
      return `[${elapsed}] stream_pending    ${data.message ?? 'no events yet'}`;
    case 'deploy_received':
      return `[${elapsed}] deploy_received  ${data.slug} v${data.version} (${data.files} files, ${formatBytes(data.bytes)})`;
    case 'framework_detected':
      return `[${elapsed}] framework        ${data.framework} · ${data.indexPath}`;
    case 'route_mode_detected':
      return `[${elapsed}] route_mode       ${String(data.mode).toUpperCase()} (${formatPercent(data.confidence)})`;
    case 'asset_fixed':
      return `[${elapsed}] asset_fixed      ${data.before} -> ${data.after} (${data.file})`;
    case 'essentials_injected':
      return `[${elapsed}] essentials       ${Array.isArray(data.injected) ? data.injected.join(', ') : ''}`;
    case 'security_scan_started':
      return `[${elapsed}] security_scan    scanning ${data.filesToScan} files...`;
    case 'secret_detected':
      return `[${elapsed}] secret_detected  ${String(data.severity).toUpperCase()} ${data.rule} in ${data.location}`;
    case 'security_scan_finished':
      return `[${elapsed}] security_done    ${data.blocks} block · ${data.warns} warn · ${data.infos} info`;
    case 'privacy_audit_finished':
      return `[${elapsed}] privacy_done     ${data.trackers} tracker · ${data.feature} feature · ${data.cdn} cdn · ${data.unknown} unknown`;
    case 'kind_classified':
      return `[${elapsed}] kind_classified  detected=${data.detected} public=${data.publicKind} (${formatPercent(data.confidence)})`;
    case 'upload_started':
      return `[${elapsed}] upload_started   ${data.files} files · ${formatBytes(data.bytes)}`;
    case 'upload_finished':
      return `[${elapsed}] upload_finished  ${data.files} files · ${formatBytes(data.bytes)}`;
    case 'health_check_finished':
      return `[${elapsed}] health_check     ${data.passed ? 'PASS' : 'FAIL'} (${data.warnings} warn, ${data.failures} fail)`;
    case 'deploy_live':
      return `[${elapsed}] deploy_live      ${data.liveUrl} (${data.durationMs}ms total)`;
    case 'deploy_failed':
      return `[${elapsed}] deploy_failed    ${data.step}: ${data.reason}`;
    case 'end':
      return `[${elapsed}] stream_end`;
    default:
      return `[${elapsed}] ${type.padEnd(16)} ${JSON.stringify(data)}`;
  }
}

function formatElapsed(value: unknown): string {
  if (typeof value !== 'number') return '   ----';
  return `${(value / 1000).toFixed(2).padStart(6)}s`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== 'number') return '?%';
  return `${Math.round(value * 100)}%`;
}

function formatBytes(value: unknown): string {
  if (typeof value !== 'number') return '?B';
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}
