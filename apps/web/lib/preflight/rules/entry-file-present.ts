/**
 * entry-file-present
 *
 * Every type=app / type=web_app project must produce an index.html at
 * the output root. Websites with custom entrypoints can opt out via
 * `shippie.json.build.output`.
 *
 * Spec v6 §10.6.
 */
import type { PreflightRule } from '../types.ts';

export const entryFilePresentRule: PreflightRule = {
  id: 'entry-file-present',
  title: 'Entry file present in output',
  run(ctx) {
    const { manifest, outputFiles } = ctx.input;

    // Websites with no build step are exempt — they might be single-page
    // Markdown + CSS, etc.
    if (manifest.type === 'website' && outputFiles.length > 0) {
      return [
        { rule: this.id, severity: 'pass', title: 'Website has output files' },
      ];
    }

    if (outputFiles.length === 0) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: 'Output directory is empty',
          detail: 'Build produced no files. Check the build command and output directory in shippie.json.',
        },
      ];
    }

    const hasIndex = outputFiles.some(
      (f) => f === 'index.html' || f === '/index.html' || f.endsWith('/index.html'),
    );
    if (!hasIndex) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: 'No index.html in output',
          detail:
            'Shippie serves your app from index.html by default. Make sure your build outputs one.',
        },
      ];
    }

    return [
      { rule: this.id, severity: 'pass', title: 'index.html found in output' },
    ];
  },
};
