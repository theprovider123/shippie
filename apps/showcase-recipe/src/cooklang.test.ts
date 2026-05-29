import { describe, expect, test } from 'bun:test';
import { recipeToCooklang, recipesToCooklang, type ExportableRecipe } from './cooklang.ts';

function r(over: Partial<ExportableRecipe> = {}): ExportableRecipe {
  return {
    title: 'Sage Butter Bean Stew',
    servings: 4,
    prepTime: 10,
    cookTime: 28,
    cuisine: 'Italian',
    category: 'Dinner',
    dietaryTags: ['vegetarian'],
    ingredients: [
      { name: 'butter beans', quantity: 400, unit: 'g' },
      { name: 'sage', quantity: 6, unit: 'leaves' },
      { name: 'salt', quantity: 0, unit: 'ea' },
      { name: 'egg', quantity: 2, unit: 'ea' },
    ],
    steps: ['Warm the oil.', 'Add the beans and simmer.'],
    notes: 'Great with crusty bread.',
    ...over,
  };
}

describe('recipeToCooklang', () => {
  const out = recipeToCooklang(r());

  test('emits a section heading + metadata', () => {
    expect(out).toContain('## Sage Butter Bean Stew');
    expect(out).toContain('>> servings: 4');
    expect(out).toContain('>> time: 38 min');
    expect(out).toContain('>> cuisine: Italian');
    expect(out).toContain('>> tags: vegetarian');
  });

  test('emits Cooklang ingredient tokens with quantity + unit', () => {
    expect(out).toContain('@butter beans{400%g}');
    expect(out).toContain('@sage{6%leaves}');
  });

  test('quantity-less / unit-less ingredients use empty braces', () => {
    expect(out).toContain('@salt{}'); // qty 0, unit 'ea' → bare
    expect(out).toContain('@egg{2}'); // qty only, 'ea' unit dropped
  });

  test('numbers the steps and appends notes', () => {
    expect(out).toContain('1. Warm the oil.');
    expect(out).toContain('2. Add the beans and simmer.');
    expect(out).toContain('> Great with crusty bread.');
  });
});

describe('recipesToCooklang', () => {
  test('wraps the whole cookbook with a header + separators', () => {
    const doc = recipesToCooklang([r(), r({ title: 'Citrus Salmon' })], '2026-06-01');
    expect(doc).toContain('# My Palate Kitchen');
    expect(doc).toContain('2 recipes');
    expect(doc).toContain('Cooklang-compatible');
    expect(doc).toContain('## Sage Butter Bean Stew');
    expect(doc).toContain('## Citrus Salmon');
    expect(doc).toContain('\n---\n'); // section separator
  });

  test('handles a single recipe (no plural)', () => {
    expect(recipesToCooklang([r()])).toContain('1 recipe ·');
  });
});
