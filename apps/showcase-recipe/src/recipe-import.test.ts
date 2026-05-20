import { describe, expect, test } from 'bun:test';
import { parseRecipeText } from './recipe-import.ts';

describe('parseRecipeText', () => {
  test('parses a typical blog recipe with explicit headings and numbered steps', () => {
    const blob = `
Lemon Garlic Roast Chicken

The easiest weeknight roast — bright, garlicky, done in under an hour.

Prep time: 15 minutes
Cook time: 50 minutes
Serves 4

Ingredients
- 1 whole chicken (about 1.5 kg)
- 2 tbsp olive oil
- 4 cloves garlic, minced
- 1 lemon, halved
- 1 tsp salt

Method
1. Heat the oven to 200C.
2. Rub the chicken all over with olive oil, garlic and salt.
3. Stuff the lemon halves into the cavity and roast for 50 minutes.
4. Rest for 10 minutes before carving.
`;
    const parsed = parseRecipeText(blob);
    expect(parsed.title).toBe('Lemon Garlic Roast Chicken');
    expect(parsed.ingredients).toEqual([
      '1 whole chicken (about 1.5 kg)',
      '2 tbsp olive oil',
      '4 cloves garlic, minced',
      '1 lemon, halved',
      '1 tsp salt',
    ]);
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.steps[0]).toBe('Heat the oven to 200C.');
    expect(parsed.steps[3]).toBe('Rest for 10 minutes before carving.');
    // boilerplate must not leak in
    expect(parsed.ingredients.join(' ')).not.toContain('Prep time');
    expect(parsed.steps.join(' ')).not.toContain('Serves');
  });

  test('parses a terse list with no headings — quantity lines then prose', () => {
    const blob = `Quick Tomato Pasta
200g spaghetti
3 ripe tomatoes
2 cloves garlic
1 handful basil
Boil the spaghetti in salted water until al dente.
Meanwhile soften the garlic in oil and add the chopped tomatoes.
Toss the drained pasta through the sauce and finish with torn basil.`;
    const parsed = parseRecipeText(blob);
    expect(parsed.title).toBe('Quick Tomato Pasta');
    expect(parsed.ingredients).toEqual([
      '200g spaghetti',
      '3 ripe tomatoes',
      '2 cloves garlic',
      '1 handful basil',
    ]);
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[0]).toContain('Boil the spaghetti');
    expect(parsed.steps[2]).toContain('torn basil');
  });

  test('parses bullet-list ingredients and a Steps heading with bullet steps', () => {
    const blob = `Overnight Oats

* 1/2 cup rolled oats
* 1 cup milk
* 1 tbsp chia seeds
* 1 tsp honey

Steps
- Combine everything in a jar and stir well.
- Refrigerate overnight.
- Top with fruit before eating.`;
    const parsed = parseRecipeText(blob);
    expect(parsed.title).toBe('Overnight Oats');
    expect(parsed.ingredients).toEqual([
      '1/2 cup rolled oats',
      '1 cup milk',
      '1 tbsp chia seeds',
      '1 tsp honey',
    ]);
    expect(parsed.steps).toEqual([
      'Combine everything in a jar and stir well.',
      'Refrigerate overnight.',
      'Top with fruit before eating.',
    ]);
  });

  test('handles empty or whitespace-only input gracefully', () => {
    const parsed = parseRecipeText('   \n  \n');
    expect(parsed.title).toBe('Imported recipe');
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.steps).toEqual([]);
  });
});
