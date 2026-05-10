/**
 * Surface resolver — decides the final marketplace surface for an app
 * being deployed. Used by `pipeline.ts:deployStatic` for both
 * first-create and redeploy paths.
 *
 * Priority (high → low):
 *   1. **Manifest**: `shippie.json#curation.surface` declared by the
 *      maker. Canonical and version-controlled with their app code.
 *   2. **Form override**: explicit picker selection in `/new`. Only set
 *      when the maker chose something other than "Auto" (i.e. the form
 *      omits this field unless the picker says App / Game / Experiment).
 *   3. **Existing row**: the current `apps.surface` value if the app
 *      already exists. **Preserve-on-redeploy** semantics: a deploy
 *      that doesn't touch surface should leave the existing one alone.
 *   4. **Fallback**: `'featured'`. Only on first create with no signal
 *      from anywhere.
 *
 * Why this order:
 *   - Manifest > form: the manifest is the maker's checked-in source
 *     of truth; the form is convenience UI. If they disagree, the
 *     code wins so future deploys are reproducible.
 *   - Form > existing: a maker who explicitly picks a surface in the
 *     form is signalling a deliberate change; respect it.
 *   - Existing > fallback: redeploys never silently demote an arcade
 *     game back to featured just because the deploy harness didn't
 *     send a signal.
 */
import { VALID_SURFACES, type Surface } from '$lib/curation/schema';

export interface ResolveSurfaceInput {
  /** Surface declared in `shippie.json#curation.surface`. */
  manifestSurface: Surface | undefined;
  /**
   * Surface chosen via the upload form picker. Should be `undefined`
   * when the maker picked "Auto" — never `'featured'` as a default,
   * because that would clobber existing arcade rows on redeploy.
   */
  formOverride: Surface | undefined;
  /**
   * Current `apps.surface` value if the app already exists in D1.
   * `undefined` for first-create.
   */
  existingSurface: string | undefined;
}

export interface ResolveSurfaceOutput {
  surface: Surface;
  /** Which input bucket the resolver picked from. Useful for telemetry / logs. */
  source: 'manifest' | 'form' | 'existing' | 'fallback';
}

const SURFACE_SET = new Set<string>(VALID_SURFACES);

function asSurface(raw: string | undefined): Surface | undefined {
  if (!raw) return undefined;
  return SURFACE_SET.has(raw) ? (raw as Surface) : undefined;
}

export function resolveSurface(input: ResolveSurfaceInput): ResolveSurfaceOutput {
  if (input.manifestSurface) {
    return { surface: input.manifestSurface, source: 'manifest' };
  }
  if (input.formOverride) {
    return { surface: input.formOverride, source: 'form' };
  }
  const existing = asSurface(input.existingSurface);
  if (existing) {
    return { surface: existing, source: 'existing' };
  }
  return { surface: 'featured', source: 'fallback' };
}
