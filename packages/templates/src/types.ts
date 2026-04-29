/**
 * @shippie/templates — starter scaffolds for showcase apps.
 *
 * Phase C2 surface. Each template is a metadata object describing the
 * shippie.json shape, html shell, and demonstrated capability. The
 * `packages/cli/` and the maker-dashboard "Remix template" button both
 * read from this list to hand the maker a starter.
 *
 * Templates stay narrow: each one demonstrates exactly one Shippie
 * capability so the resulting app is readable end-to-end.
 */

export type TemplateCategory =
  | 'tracker'
  | 'crud-with-search'
  | 'camera-and-ai'
  | 'calculator'
  | 'collaborative';

export interface TemplateCapabilityProof {
  /** Capability the template demonstrates end-to-end. */
  capability: string;
  /**
   * Acceptance criterion — copied into the showcase app's CI assertion
   * so we can fail the build if the demonstrated capability regresses.
   */
  assertion: string;
}

export interface AppTemplate {
  /** Stable id used by the CLI / maker dashboard. */
  id: string;
  /** Display name. */
  name: string;
  /** One-sentence description. */
  description: string;
  category: TemplateCategory;
  /** Suggested shippie.json category field — drives AppProfile defaults. */
  shippieCategory: string;
  /** Theme color used in the manifest + meta tag. */
  themeColor: string;
  /** Capability the template proves end-to-end. */
  proves: TemplateCapabilityProof;
  /** Suggested cross-app intent declarations. */
  intents?: {
    provides?: readonly string[];
    consumes?: readonly string[];
  };
}
