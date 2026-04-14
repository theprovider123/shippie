/**
 * reserved-paths-collision
 *
 * Blocks any deploy whose source or output tree contains files under
 * `__shippie/`. This is a HARD BLOCK — never silently rewritten
 * (Fix v5.1 Patch 3 preserved through v6).
 *
 * Only exception: top-level `manifest.json` / `sw.js` which are handled
 * by pwa.conflict_policy elsewhere (merge, own, or shippie override).
 *
 * Spec v6 §5.2.
 */
import { isReservedPath } from '@shippie/shared';
import type { PreflightRule } from '../types.ts';

export const reservedPathsCollisionRule: PreflightRule = {
  id: 'reserved-paths-collision',
  title: 'Reserved path collision',
  run(ctx) {
    const { sourceFiles, outputFiles } = ctx.input;
    const collisions = new Set<string>();

    for (const f of sourceFiles) if (isReservedPath(f)) collisions.add(f);
    for (const f of outputFiles) if (isReservedPath(f)) collisions.add(f);

    if (collisions.size === 0) {
      return [{ rule: this.id, severity: 'pass', title: 'No __shippie/* collisions' }];
    }

    return [
      {
        rule: this.id,
        severity: 'block',
        title: `${collisions.size} file(s) collide with reserved __shippie/* paths`,
        detail:
          'Shippie owns every path under __shippie/ on every app origin. ' +
          'Rename or move these files before redeploying — Shippie never rewrites build output.',
        metadata: { files: Array.from(collisions).slice(0, 20) },
      },
    ];
  },
};
