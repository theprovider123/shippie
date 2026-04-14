/**
 * shippie-json-present
 *
 * Auto-drafts a shippie.json when the maker didn't ship one. The draft
 * is populated from sensible defaults so the rest of preflight can run
 * against a complete manifest.
 *
 * Spec v6 §10.4 (auto-remediation).
 */
import type { PreflightRule } from '../types.ts';

export const shippieJsonPresentRule: PreflightRule = {
  id: 'shippie-json-present',
  title: 'shippie.json present or auto-drafted',
  async run(ctx) {
    const { manifestSource } = ctx.input;

    if (manifestSource === 'maker') {
      return [
        {
          rule: this.id,
          severity: 'pass',
          title: 'shippie.json provided by maker',
        },
      ];
    }

    return [
      {
        rule: this.id,
        severity: 'fix',
        title: 'shippie.json auto-drafted',
        detail:
          manifestSource === 'auto-drafted'
            ? 'No shippie.json found in the source tree; Shippie drafted one from detected framework + README.'
            : 'Maker shippie.json merged with Shippie defaults.',
        remediation: {
          kind: 'auto-draft-shippie-json',
          summary: 'Generated from framework + README + detected files',
        },
      },
    ];
  },
};
