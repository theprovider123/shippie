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
