/**
 * recipe-import.ts — local-first heuristic recipe parser.
 *
 * Takes a blob of recipe text copied off any website and splits it into
 * a title, an ingredient list, and an ordered step list. Pure heuristics:
 * no network, no AI, no dependencies. The output feeds the existing
 * recipe-draft editor so the user can confirm or correct before saving.
 */

export interface ParsedRecipe {
  title: string;
  ingredients: string[];
  steps: string[];
}

/**
 * Units we expect to see in an ingredient line. Kept broad — covers
 * metric, imperial, and the loose kitchen vocabulary ("handful", "tin").
 */
const UNIT_WORDS = [
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'milliliter', 'milliliters',
  'l', 'liter', 'liters', 'litre', 'litres', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pint', 'pints', 'quart', 'quarts', 'gallon', 'clove', 'cloves', 'slice', 'slices',
  'pinch', 'pinches', 'dash', 'handful', 'handfuls', 'tin', 'tins', 'can', 'cans',
  'pack', 'packs', 'packet', 'packets', 'bunch', 'bunches', 'sprig', 'sprigs',
  'piece', 'pieces', 'stick', 'sticks', 'sheet', 'sheets', 'head', 'bulb', 'knob',
  'stalk', 'stalks', 'fillet', 'fillets', 'leaf', 'leaves', 'drop', 'drops', 'jar', 'jars',
];

const UNIT_PATTERN = UNIT_PATTERN_FROM(UNIT_WORDS);

function UNIT_PATTERN_FROM(units: string[]): RegExp {
  // longest-first so "tablespoons" wins over "tablespoon"
  const sorted = [...units].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${sorted.join('|')})\\b\\.?`, 'i');
}

/** Unicode and ASCII fractions, plus decimal/whole numbers and ranges. */
const QUANTITY_PATTERN = /(?:\d+\s*[-–to]+\s*\d+|\d+\s*\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅛⅜⅝⅞])/;

/**
 * Lines that mark the start of the steps block. Used as a fallback when
 * there are no numbered steps to anchor on.
 */
const METHOD_HEADINGS = /^(method|directions?|instructions?|steps?|preparation|how to make|to (?:cook|make|prepare))\b/i;
const INGREDIENT_HEADINGS = /^(ingredients?|you(?:'| wi)ll need|shopping list|what you need)\b/i;

/** Boilerplate we never want in the parsed recipe. */
const NOISE = /^(prep time|cook(?:ing)? time|total time|servings?|serves|yield|makes|difficulty|course|cuisine|calories|nutrition|by |author|published|updated|print|share|jump to|advertisement|rate this)\b/i;

function looksLikeIngredient(line: string): boolean {
  if (!line) return false;
  // A leading quantity is the strongest signal.
  if (new RegExp(`^${QUANTITY_PATTERN.source}`).test(line)) return true;
  // Otherwise: contains a unit word AND a digit/fraction somewhere.
  const hasUnit = UNIT_PATTERN.test(line);
  const hasQty = QUANTITY_PATTERN.test(line);
  return hasUnit && hasQty;
}

/** A numbered step like "1.", "1)", "Step 2:". Returns the text without the marker. */
function stripStepNumber(line: string): string | null {
  const match = line.match(/^(?:step\s*)?(\d{1,2})[.)\]:–-]\s+(.*)$/i);
  if (match && match[2]) return match[2].trim();
  return null;
}

/**
 * Strip a leading list bullet ("- ", "* ", "• ") so bulleted ingredient
 * lists parse the same as plain ones.
 */
function stripBullet(line: string): string {
  return line.replace(/^[-*•·▢□☐◦]+\s*/, '').trim();
}

function normaliseLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Pick the recipe title: a heading-like line near the top, found
 * *before* the recipe content starts. A heading is short (<= 70 chars),
 * not noise, not an ingredient, and not a section/step marker. We only
 * look at lines preceding the first ingredient / step / heading so prose
 * from the method block can never masquerade as the title. Among those
 * leading candidates we prefer the longest — blog titles tend to be the
 * meatiest short line, beating one-word labels.
 */
function pickTitle(lines: string[]): string {
  const candidates: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = stripBullet(lines[i]!);
    if (!line) continue;
    // Content has started — stop collecting title candidates.
    if (
      looksLikeIngredient(line) ||
      stripStepNumber(line) ||
      INGREDIENT_HEADINGS.test(line) ||
      METHOD_HEADINGS.test(line)
    ) {
      break;
    }
    if (line.length > 70) continue;
    if (NOISE.test(line)) continue;
    candidates.push(line);
  }
  if (candidates.length === 0) return 'Imported recipe';
  // Score each leading candidate. A title is a heading, not prose:
  //   - sentence-shaped lines (end in . ! ? or long with commas) lose;
  //   - very short one-word labels lose slightly;
  //   - earlier lines win ties (titles sit at the very top).
  const scored = candidates.map((line, index) => {
    let score = 0;
    const sentenceLike = /[.!?]$/.test(line) || (line.includes(', ') && line.length > 45);
    if (sentenceLike) score -= 100;
    if (line.split(/\s+/).length < 2) score -= 10; // bare one-word label
    score -= index; // prefer lines closer to the top
    return { line, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0]!.line;
}

/**
 * Heuristic parser. Strategy:
 *   1. Drop the title line and obvious noise/metadata.
 *   2. If explicit "Ingredients" / "Method" headings exist, split on them.
 *   3. Otherwise: a line looks like an ingredient → ingredient block;
 *      a numbered or prose line after the ingredients → step.
 */
export function parseRecipeText(raw: string): ParsedRecipe {
  const lines = normaliseLines(raw);
  if (lines.length === 0) {
    return { title: 'Imported recipe', ingredients: [], steps: [] };
  }

  const title = pickTitle(lines);
  const ingredients: string[] = [];
  const steps: string[] = [];

  // Find explicit section headings, if any.
  let ingredientHeadingIdx = -1;
  let methodHeadingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = stripBullet(lines[i]!);
    if (ingredientHeadingIdx === -1 && INGREDIENT_HEADINGS.test(line)) ingredientHeadingIdx = i;
    if (methodHeadingIdx === -1 && METHOD_HEADINGS.test(line)) methodHeadingIdx = i;
  }

  // `inSteps` flips once we leave the ingredient block. It can flip
  // early on an explicit method heading, or implicitly on the first
  // numbered step / prose line that follows at least one ingredient.
  let inSteps = false;

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]!;
    if (original === title) continue;

    const line = stripBullet(original);
    if (!line) continue;

    // Explicit headings: consume the marker, switch mode, skip the line.
    if (INGREDIENT_HEADINGS.test(line)) {
      inSteps = false;
      // a heading may carry an inline item: "Ingredients: 2 eggs"
      const inline = line.replace(INGREDIENT_HEADINGS, '').replace(/^[:\-–]\s*/, '').trim();
      if (inline && looksLikeIngredient(inline)) ingredients.push(inline);
      continue;
    }
    if (METHOD_HEADINGS.test(line)) {
      inSteps = true;
      const inline = line.replace(METHOD_HEADINGS, '').replace(/^[:\-–]\s*/, '').trim();
      if (inline) steps.push(inline);
      continue;
    }

    // Metadata / boilerplate is dropped entirely.
    if (NOISE.test(line)) continue;

    const stepText = stripStepNumber(line);

    if (!inSteps) {
      if (looksLikeIngredient(line)) {
        ingredients.push(line);
        continue;
      }
      // First numbered step after we have ingredients → we're in steps.
      if (stepText && ingredients.length > 0) {
        inSteps = true;
        steps.push(stepText);
        continue;
      }
      // A long prose line after ingredients (and no heading expected) is
      // almost certainly the start of the method.
      if (ingredients.length > 0 && !stepText && line.length > 40) {
        inSteps = true;
        steps.push(line);
        continue;
      }
      // Otherwise skip — likely intro prose before the ingredient block.
      continue;
    }

    // In the steps block.
    if (stepText) {
      steps.push(stepText);
    } else {
      steps.push(line);
    }
  }

  // Fallback: nothing landed in steps but we have a method heading whose
  // body never matched — re-scan everything after that heading as prose.
  if (steps.length === 0 && methodHeadingIdx >= 0) {
    for (let i = methodHeadingIdx + 1; i < lines.length; i++) {
      const line = stripBullet(lines[i]!);
      if (!line || NOISE.test(line) || line === title) continue;
      steps.push(stripStepNumber(line) ?? line);
    }
  }

  return {
    title,
    ingredients: dedupe(ingredients),
    steps: dedupe(steps),
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ----------------------------------------------------------------------------
// URL import — schema.org/Recipe parsing through the Shippie CORS proxy.
//
// The platform exposes `/__shippie/proxy?url=<encoded>` (a Cloudflare Worker
// endpoint with SSRF guards already applied). We fetch the HTML through that
// endpoint, then try two extraction strategies in order:
//
//   1. JSON-LD with `@type: Recipe` — schema.org, the canonical signal.
//      ~85% of major recipe sites expose this (NYT, BBC Good Food, Serious
//      Eats, AllRecipes). When present it's authoritative — we trust the
//      site's own structured data over heuristics.
//   2. Open Graph + first list-near-heading — a graceful fallback for blog
//      posts that didn't bother with structured data. We pull `og:title` /
//      `og:image` for identity and the first reasonably-sized `<ul>` / `<ol>`
//      for ingredients, then we have nothing useful for steps so we surface
//      what we found and lean on the user to clean up.
//
// Everything else is left to `parseRecipeText` — the user always confirms in
// the editor, so a partial parse is still useful.
// ----------------------------------------------------------------------------

/** Tag describing where the parsed recipe came from. Useful for telemetry / UI hints. */
export type RecipeImportSource = 'schema-org' | 'opengraph-fallback';

export interface UrlImportedRecipe extends ParsedRecipe {
  /** Hero image URL if the site exposed one. Not required. */
  imageUrl?: string;
  /** Total cook time in minutes if the recipe declared an ISO 8601 duration. */
  totalMinutes?: number;
  /** Yield string ("4 servings", "12 cookies") if declared. Free-form. */
  yieldText?: string;
  /** Where the extraction came from — schema.org is authoritative. */
  source: RecipeImportSource;
}

export class RecipeImportError extends Error {
  public readonly reason?: unknown;
  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'RecipeImportError';
    this.reason = reason;
  }
}

/** Build the proxy URL for a target page. Exported for tests / UI previews. */
export function buildProxyUrl(target: string): string {
  return `/__shippie/proxy?url=${encodeURIComponent(target)}`;
}

/**
 * Fetch + parse a recipe from a URL. Network is injected so tests can stay
 * synchronous and offline — production passes `globalThis.fetch`.
 */
export async function importRecipeFromUrl(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<UrlImportedRecipe> {
  const trimmed = url.trim();
  if (!trimmed) throw new RecipeImportError('Enter a recipe URL.');
  try {
    // Validate up front so we don't bounce a bad URL off the proxy.
    new URL(trimmed);
  } catch {
    throw new RecipeImportError("That doesn't look like a valid URL.");
  }

  let html: string;
  try {
    const response = await fetcher(buildProxyUrl(trimmed));
    if (!response.ok) {
      throw new RecipeImportError(
        `Couldn't fetch that page (status ${response.status}). Try pasting the text instead.`,
      );
    }
    html = await response.text();
  } catch (err) {
    if (err instanceof RecipeImportError) throw err;
    throw new RecipeImportError(
      "Couldn't reach that page. Try pasting the text instead.",
      err,
    );
  }

  return parseRecipeHtml(html);
}

/**
 * Pure HTML → ParsedRecipe. Exposed for tests (so we can hand it a sample
 * page without going through the network) and for any future caller that
 * already has the bytes.
 */
export function parseRecipeHtml(html: string): UrlImportedRecipe {
  const schema = extractSchemaOrgRecipe(html);
  if (schema) return schema;

  const fallback = extractOpenGraphFallback(html);
  if (fallback) return fallback;

  throw new RecipeImportError(
    "Couldn't extract a recipe from this page. Try pasting the text instead.",
  );
}

/**
 * Walk every `<script type="application/ld+json">` block and look for an
 * object whose `@type` is `Recipe` (or includes `Recipe` in an array, or
 * is nested inside a `@graph`). Returns the first match.
 */
function extractSchemaOrgRecipe(html: string): UrlImportedRecipe | null {
  const scripts = collectJsonLdScripts(html);
  for (const raw of scripts) {
    const recipe = findRecipeNode(safeJsonParse(raw));
    if (recipe) return normaliseSchemaRecipe(recipe);
  }
  return null;
}

function collectJsonLdScripts(html: string): string[] {
  const out: string[] = [];
  // Tolerate attribute order and extra attributes. Non-greedy body match.
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const body = (match[1] ?? '').trim();
    if (body) out.push(body);
  }
  return out;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Recursive search: schema.org payloads can be a single object, an array,
 * or wrapped in `{ "@graph": [...] }`. We walk all of those.
 */
function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (isRecipeType(obj['@type'])) return obj;
  if (Array.isArray(obj['@graph'])) {
    const found = findRecipeNode(obj['@graph']);
    if (found) return found;
  }
  return null;
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'recipe';
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'recipe');
  }
  return false;
}

function normaliseSchemaRecipe(recipe: Record<string, unknown>): UrlImportedRecipe {
  const title = typeof recipe.name === 'string' ? recipe.name.trim() : 'Imported recipe';
  const ingredients = toStringArray(recipe.recipeIngredient).map((s) => s.trim()).filter(Boolean);
  const steps = flattenInstructions(recipe.recipeInstructions);

  const result: UrlImportedRecipe = {
    title: title || 'Imported recipe',
    ingredients: dedupe(ingredients),
    steps: dedupe(steps),
    source: 'schema-org',
  };

  const imageUrl = pickImageUrl(recipe.image);
  if (imageUrl) result.imageUrl = imageUrl;

  const totalMinutes = parseIsoDurationMinutes(recipe.totalTime);
  if (totalMinutes !== null) result.totalMinutes = totalMinutes;

  const yieldText = pickYield(recipe.recipeYield);
  if (yieldText) result.yieldText = yieldText;

  return result;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

/**
 * `recipeInstructions` is the messy one: it can be a string, an array of
 * strings, an array of `{ "@type": "HowToStep", text }`, or an array of
 * `HowToSection` objects whose `itemListElement` holds the real steps.
 * We flatten all of those.
 */
function flattenInstructions(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(/(?<=[.!?])\s+(?=[A-Z])|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const type = typeof obj['@type'] === 'string' ? (obj['@type'] as string).toLowerCase() : '';
      if (type === 'howtosection' && Array.isArray(obj.itemListElement)) {
        // Recurse into the section's steps.
        for (const step of flattenInstructions(obj.itemListElement)) out.push(step);
        continue;
      }
      const text = typeof obj.text === 'string' ? obj.text.trim() : '';
      if (text) {
        out.push(text);
        continue;
      }
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      if (name) out.push(name);
    }
  }
  return out;
}

function pickImageUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = pickImageUrl(entry);
      if (url) return url;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
  }
  return undefined;
}

/**
 * Parse ISO 8601 duration → minutes. Schema.org uses PT#H#M#S; we ignore
 * day/week/month grains (no recipe takes that long) and treat seconds as
 * rounding noise. Returns null on anything we can't parse.
 */
export function parseIsoDurationMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value.trim());
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}

function pickYield(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return `${value}`;
  if (Array.isArray(value)) {
    // Schema sometimes ships ["4", "4 servings"]; prefer the wordier one.
    const strings = value.filter((entry): entry is string => typeof entry === 'string');
    if (strings.length === 0) return undefined;
    return strings.sort((a, b) => b.length - a.length)[0];
  }
  return undefined;
}

/**
 * Fallback: no schema.org block. Pull `og:title` + `og:image`, find the
 * first usable `<ul>` / `<ol>` near the page's main heading, and feed the
 * stripped contents through the heuristic text parser so units and quantities
 * still get respected.
 */
function extractOpenGraphFallback(html: string): UrlImportedRecipe | null {
  const ogTitle = extractMeta(html, 'og:title');
  const ogImage = extractMeta(html, 'og:image');
  const h1 = extractFirstTag(html, 'h1');
  const title = (ogTitle || h1 || '').trim();
  if (!title) return null;

  const list = extractFirstListItems(html);
  // Treat anything in the list as candidate ingredients; defer real parsing
  // to parseRecipeText so unit + quantity heuristics still kick in.
  const blob = [title, ...(list ?? [])].join('\n');
  const parsed = parseRecipeText(blob);

  const ingredients = parsed.ingredients.length > 0 ? parsed.ingredients : list ?? [];
  if (ingredients.length === 0) return null;

  const result: UrlImportedRecipe = {
    title,
    ingredients: dedupe(ingredients),
    steps: parsed.steps, // typically empty in the fallback path
    source: 'opengraph-fallback',
  };
  if (ogImage) result.imageUrl = ogImage;
  return result;
}

function extractMeta(html: string, property: string): string | null {
  // Match either property= or name= since OG sometimes appears as both.
  // Quote-matched content blocks so an embedded apostrophe inside a
  // double-quoted attribute (Granny's Pancakes) doesn't truncate the value.
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*"${escaped}"[^>]*content\\s*=\\s*"([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*'${escaped}'[^>]*content\\s*=\\s*'([^']*)'`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*"([^"]*)"[^>]*(?:property|name)\\s*=\\s*"${escaped}"`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*'([^']*)'[^>]*(?:property|name)\\s*=\\s*'${escaped}'`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

function extractFirstTag(html: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = pattern.exec(html);
  if (!match || !match[1]) return null;
  return decodeHtmlEntities(stripTags(match[1])).trim();
}

/**
 * Find the first list with >= 2 items — that's almost always the ingredient
 * block on a recipe page. We try `<ul>` first (more common) then `<ol>`.
 */
function extractFirstListItems(html: string): string[] | null {
  const blocks = [
    ...collectMatches(html, /<ul\b[^>]*>([\s\S]*?)<\/ul>/gi),
    ...collectMatches(html, /<ol\b[^>]*>([\s\S]*?)<\/ol>/gi),
  ];
  for (const block of blocks) {
    const items = collectMatches(block, /<li\b[^>]*>([\s\S]*?)<\/li>/gi)
      .map((body) => decodeHtmlEntities(stripTags(body)).trim())
      .filter(Boolean);
    if (items.length >= 2) return items;
  }
  return null;
}

function collectMatches(input: string, pattern: RegExp): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  // Clone so we don't mutate caller's lastIndex.
  const re = new RegExp(pattern.source, pattern.flags);
  while ((match = re.exec(input)) !== null) {
    if (match[1] !== undefined) out.push(match[1]);
  }
  return out;
}

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
