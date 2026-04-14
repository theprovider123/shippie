/**
 * Default preflight rule registry.
 *
 * Ordering: rules run sequentially. Auto-drafting rules go first so
 * later rules see a complete manifest.
 */
import type { PreflightRule } from '../types.ts';

import { shippieJsonPresentRule } from './shippie-json-present.ts';
import { slugValidationRule } from './slug-validation.ts';
import { reservedPathsCollisionRule } from './reserved-paths-collision.ts';
import { entryFilePresentRule } from './entry-file-present.ts';
import { outputSizeRule } from './output-size.ts';

export const defaultRules: readonly PreflightRule[] = [
  shippieJsonPresentRule,
  slugValidationRule,
  reservedPathsCollisionRule,
  entryFilePresentRule,
  outputSizeRule,
];

export {
  shippieJsonPresentRule,
  slugValidationRule,
  reservedPathsCollisionRule,
  entryFilePresentRule,
  outputSizeRule,
};
