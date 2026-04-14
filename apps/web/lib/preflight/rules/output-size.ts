/**
 * output-size
 *
 * Warns at 100MB, blocks at 200MB (free tier). Pro tier raises these
 * limits via quota lookup (wired later).
 *
 * Spec v6 §10 (deploy pipeline), §15.4 (plans).
 */
import type { PreflightRule } from '../types.ts';

const WARN_BYTES = 100 * 1024 * 1024;
const BLOCK_BYTES = 200 * 1024 * 1024;

export const outputSizeRule: PreflightRule = {
  id: 'output-size',
  title: 'Output size within free tier limits',
  run(ctx) {
    const bytes = ctx.input.outputBytes ?? 0;

    if (bytes > BLOCK_BYTES) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: `Output exceeds 200MB free-tier limit`,
          detail: `Built output is ${formatBytes(bytes)}. Reduce bundle size or upgrade to Pro.`,
          metadata: { bytes, limit: BLOCK_BYTES },
        },
      ];
    }

    if (bytes > WARN_BYTES) {
      return [
        {
          rule: this.id,
          severity: 'warn',
          title: `Output is ${formatBytes(bytes)}`,
          detail: 'Approaching the 200MB free-tier limit. Consider removing unused assets.',
          metadata: { bytes, warn: WARN_BYTES, block: BLOCK_BYTES },
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
