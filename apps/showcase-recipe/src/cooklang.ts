/**
 * Cooklang export — the anti-lock-in promise made real.
 *
 * Your recipes are yours: this turns the whole cookbook into a single
 * Cooklang-compatible Markdown file (`@ingredient{qty%unit}` syntax, `>>`
 * metadata) that any Cooklang tool — or a plain text editor — can read forever.
 * No account, no proprietary cloud, no hostage data. Pure + offline.
 */

export interface ExportableRecipe {
  title: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  cuisine: string;
  category?: string;
  dietaryTags: string[];
  notes?: string;
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  steps: string[];
}

function ingredientToken(ing: { name: string; quantity: number; unit: string }): string {
  const name = ing.name.trim() || 'ingredient';
  const qty = Number.isFinite(ing.quantity) && ing.quantity > 0 ? trimNum(ing.quantity) : '';
  const unit = ing.unit && ing.unit !== 'ea' ? ing.unit.trim() : '';
  if (!qty && !unit) return `@${name}{}`;
  if (qty && unit) return `@${name}{${qty}%${unit}}`;
  return `@${name}{${qty || unit}}`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** One recipe → a Cooklang section. */
export function recipeToCooklang(recipe: ExportableRecipe): string {
  const lines: string[] = [];
  lines.push(`## ${recipe.title}`);
  lines.push(`>> servings: ${recipe.servings}`);
  const time = recipe.prepTime + recipe.cookTime;
  if (time > 0) lines.push(`>> time: ${time} min`);
  if (recipe.cuisine) lines.push(`>> cuisine: ${recipe.cuisine}`);
  if (recipe.category) lines.push(`>> course: ${recipe.category}`);
  if (recipe.dietaryTags.length > 0) lines.push(`>> tags: ${recipe.dietaryTags.join(', ')}`);
  lines.push('');
  for (const ing of recipe.ingredients) lines.push(ingredientToken(ing));
  lines.push('');
  recipe.steps.forEach((step, i) => {
    const clean = step.trim();
    if (clean) lines.push(`${i + 1}. ${clean}`);
  });
  if (recipe.notes && recipe.notes.trim()) {
    lines.push('');
    lines.push(`> ${recipe.notes.trim()}`);
  }
  return lines.join('\n');
}

/** Whole cookbook → one portable Cooklang/Markdown document. */
export function recipesToCooklang(recipes: ExportableRecipe[], exportedAtIso?: string): string {
  const header = [
    '# My Palate Kitchen',
    `> Exported${exportedAtIso ? ` ${exportedAtIso}` : ''} · ${recipes.length} recipe${recipes.length === 1 ? '' : 's'} · Cooklang-compatible · yours to keep`,
    '',
  ];
  const body = recipes.map(recipeToCooklang).join('\n\n---\n\n');
  return header.join('\n') + '\n' + body + '\n';
}

/** Trigger a client-side download of text. Best-effort; offline-safe. */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
