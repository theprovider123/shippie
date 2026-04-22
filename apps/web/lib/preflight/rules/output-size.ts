/**
 * output-size
 *
 * Warns at 100MB, blocks at 200MB (free tier defaults). Pro tier raises
 * these limits via quota lookup (wired later).
 *
 * Both thresholds are env-overridable so self-hosters and dev instances
 * can tune without patching code:
 *   SHIPPIE_PREFLIGHT_WARN_BYTES    override WARN_BYTES (default 100MB)
 *   SHIPPIE_PREFLIGHT_BLOCK_BYTES   override BLOCK_BYTES (default 200MB)
 *
 * Spec v6 §10 (deploy pipeline), §15.4 (plans).
 */
import type { PreflightRule } from '../types.ts';

const DEFAULT_WARN_BYTES = 100 * 1024 * 1024;
const DEFAULT_BLOCK_BYTES = 200 * 1024 * 1024;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const outputSizeRule: PreflightRule = {
  id: 'output-size',
  title: 'Output size within free tier limits',
  run(ctx) {
    const warnBytes = envNumber('SHIPPIE_PREFLIGHT_WARN_BYTES', DEFAULT_WARN_BYTES);
    const blockBytes = envNumber('SHIPPIE_PREFLIGHT_BLOCK_BYTES', DEFAULT_BLOCK_BYTES);
    const bytes = ctx.input.outputBytes ?? 0;

    if (bytes > blockBytes) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: `Output exceeds ${formatBytes(blockBytes)} limit`,
          detail: `Built output is ${formatBytes(bytes)}. Reduce bundle size or raise the limit via SHIPPIE_PREFLIGHT_BLOCK_BYTES.`,
          metadata: { bytes, limit: blockBytes },
        },
      ];
    }

    if (bytes > warnBytes) {
      return [
        {
          rule: this.id,
          severity: 'warn',
          title: `Output is ${formatBytes(bytes)}`,
          detail: `Approaching the ${formatBytes(blockBytes)} limit. Consider removing unused assets.`,
          metadata: { bytes, warn: warnBytes, block: blockBytes },
        },
      ];
    }

    return [
      {
        rule: this.id,
        severity: 'pass',
        title: `Output is ${formatBytes(bytes)}`,
      },
    ];
  },
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
