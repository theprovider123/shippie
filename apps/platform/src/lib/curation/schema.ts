/**
 * Shared curation schema — pure module.
 *
 * Bun-importable from `apps/platform/scripts/prepare-showcases.mjs` via
 * relative path. SvelteKit-importable via $lib alias from server code.
 * **Do not** add `$lib`, `@sveltejs/...`, or any other alias-only
 * imports here — relative paths only, no transitive runtime deps.
 *
 * Two shapes:
 *   - `FirstPartyCurationEntry` — full first-party shape including
 *     `successor` (used by `prepare-showcases.mjs` and the generated
 *     manifest at `_generated/first-party-curation.ts`). First-party
 *     apps may declare a successor slug to enable the redirect plumbing
 *     in `showcase-slugs.ts`.
 *   - `MakerCuration` — maker-uploadable subset (`surface`, `category`
 *     only). Makers cannot declare `successor`: that's a curator-side
 *     decision that points across the slate, and exposing it on
 *     uploads would let a maker silently redirect their slug to
 *     someone else's app.
 *
 * Validation functions return a tagged result so callers can choose
 * to throw, surface to the user, or fall back without juggling
 * exceptions. Plain TypeScript — no Zod / Valibot dependency to keep
 * Bun script paths zero-dep.
 */

// ---------------------------------------------------------------------
// Allowed values
// ---------------------------------------------------------------------

export const VALID_SURFACES = ['featured', 'arcade', 'labs', 'archived'] as const;
export type Surface = (typeof VALID_SURFACES)[number];

export const VALID_CATEGORIES = [
  'food-drink',
  'health-fitness',
  'social',
  'games',
  'tools',
  'creative',
] as const;
export type Category = (typeof VALID_CATEGORIES)[number];

/**
 * Shelf grouping inside the `/arcade` landing surface. Optional —
 * apps with `surface: 'arcade'` but no subcategory land in the
 * uncategorised tail of the page. Used by the prepare-showcases.mjs
 * script to emit the `SHELVES` constant.
 */
export const VALID_SUBCATEGORIES = [
  'daily-brain',
  'arcade-cabinet',
  'room',
  'strategy',
] as const;
export type Subcategory = (typeof VALID_SUBCATEGORIES)[number];

const SURFACE_SET = new Set<string>(VALID_SURFACES);
const CATEGORY_SET = new Set<string>(VALID_CATEGORIES);
const SUBCATEGORY_SET = new Set<string>(VALID_SUBCATEGORIES);

// ---------------------------------------------------------------------
// First-party shape (full)
// ---------------------------------------------------------------------

export interface FirstPartyCurationEntry {
  surface: Surface;
  category: Category;
  /** Optional arcade-shelf grouping (Daily Brain / Arcade Cabinet / Room / Strategy). */
  subcategory?: Subcategory;
  /** Successor slug for redirect chains (alias from this slug → that). */
  successor?: string;
}

// ---------------------------------------------------------------------
// Maker shape (subset — no `successor`)
// ---------------------------------------------------------------------

export interface MakerCuration {
  surface: Surface;
  category: Category;
  subcategory?: Subcategory;
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkSurfaceCategory(
  raw: Record<string, unknown>,
  errors: string[],
): { surface: Surface | null; category: Category | null; subcategory: Subcategory | null } {
  const surface = raw.surface;
  const category = raw.category;
  const subcategory = raw.subcategory;
  let resolvedSurface: Surface | null = null;
  let resolvedCategory: Category | null = null;
  let resolvedSubcategory: Subcategory | null = null;
  if (typeof surface !== 'string' || !SURFACE_SET.has(surface)) {
    errors.push(
      `curation.surface=${JSON.stringify(surface)} (must be one of ${VALID_SURFACES.join(', ')})`,
    );
  } else {
    resolvedSurface = surface as Surface;
  }
  if (typeof category !== 'string' || !CATEGORY_SET.has(category)) {
    errors.push(
      `curation.category=${JSON.stringify(category)} (must be one of ${VALID_CATEGORIES.join(', ')})`,
    );
  } else {
    resolvedCategory = category as Category;
  }
  // Subcategory is optional — only validate if present.
  if (subcategory !== undefined && subcategory !== null) {
    if (typeof subcategory !== 'string' || !SUBCATEGORY_SET.has(subcategory)) {
      errors.push(
        `curation.subcategory=${JSON.stringify(subcategory)} (must be one of ${VALID_SUBCATEGORIES.join(', ')} or omitted)`,
      );
    } else {
      resolvedSubcategory = subcategory as Subcategory;
    }
  }
  return { surface: resolvedSurface, category: resolvedCategory, subcategory: resolvedSubcategory };
}

/**
 * Parse a maker-supplied curation block (e.g. from an uploaded
 * `shippie.json`). Strips `successor` defence-in-depth.
 *
 * @param raw — value of `shippie.json#curation` from a maker upload
 * @returns ok+value (validated) or ok=false+errors (human-readable)
 */
export function parseMakerCuration(raw: unknown): ValidationResult<MakerCuration> {
  if (!isObject(raw)) {
    return { ok: false, errors: ["curation block missing or not an object"] };
  }
  const errors: string[] = [];
  const { surface, category, subcategory } = checkSurfaceCategory(raw, errors);
  // Maker uploads MUST NOT carry successor; ignored if present (the
  // pipeline scrubs it before any persistence).
  if (errors.length > 0 || !surface || !category) {
    return { ok: false, errors };
  }
  const value: MakerCuration = { surface, category };
  if (subcategory) value.subcategory = subcategory;
  return { ok: true, value };
}

/**
 * Parse a first-party curation block (declared by a showcase shipped
 * inside this repo). Allows the optional `successor` field; if present,
 * the caller is responsible for verifying the successor slug actually
 * exists in the bake.
 */
export function parseFirstPartyCurationEntry(
  raw: unknown,
  opts: { successorMustExist?: (slug: string) => boolean } = {},
): ValidationResult<FirstPartyCurationEntry> {
  if (!isObject(raw)) {
    return { ok: false, errors: ["curation block missing or not an object"] };
  }
  const errors: string[] = [];
  const { surface, category, subcategory } = checkSurfaceCategory(raw, errors);
  let successor: string | undefined;
  if (raw.successor !== undefined && raw.successor !== null) {
    if (typeof raw.successor !== 'string') {
      errors.push(`curation.successor=${JSON.stringify(raw.successor)} (must be a string slug)`);
    } else if (opts.successorMustExist && !opts.successorMustExist(raw.successor)) {
      errors.push(
        `curation.successor=${JSON.stringify(raw.successor)} references a slug not in the current bake. Ship the successor first, then add the alias.`,
      );
    } else {
      successor = raw.successor;
    }
  }
  if (errors.length > 0 || !surface || !category) {
    return { ok: false, errors };
  }
  const value: FirstPartyCurationEntry = { surface, category };
  if (subcategory) value.subcategory = subcategory;
  if (successor !== undefined) value.successor = successor;
  return { ok: true, value };
}

// Re-exports for the prepare-showcases.mjs script which still uses the
// raw Sets in some places — keep them stable so behaviour matches.
export { SURFACE_SET, CATEGORY_SET, SUBCATEGORY_SET };
