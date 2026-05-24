import { describe, expect, test } from 'bun:test';
import {
  buildProxyUrl,
  importRecipeFromUrl,
  parseIsoDurationMinutes,
  parseRecipeHtml,
  parseRecipeText,
  RecipeImportError,
} from './recipe-import.ts';

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

describe('parseIsoDurationMinutes', () => {
  test('parses common HMS durations', () => {
    expect(parseIsoDurationMinutes('PT1H30M')).toBe(90);
    expect(parseIsoDurationMinutes('PT45M')).toBe(45);
    expect(parseIsoDurationMinutes('PT2H')).toBe(120);
    expect(parseIsoDurationMinutes('PT90S')).toBe(2); // rounded up
  });

  test('returns null for empty / bogus / non-string input', () => {
    expect(parseIsoDurationMinutes('PT0M')).toBeNull();
    expect(parseIsoDurationMinutes('30 minutes')).toBeNull();
    expect(parseIsoDurationMinutes(undefined)).toBeNull();
    expect(parseIsoDurationMinutes(90)).toBeNull();
  });
});

describe('parseRecipeHtml — schema.org', () => {
  test('extracts a full schema.org/Recipe block', () => {
    const html = `<!doctype html>
<html><head>
  <title>Whatever</title>
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Roast Carrots With Honey',
    image: 'https://example.com/carrots.jpg',
    recipeYield: '4 servings',
    totalTime: 'PT45M',
    recipeIngredient: [
      '500g carrots, peeled',
      '2 tbsp honey',
      '1 tsp cumin seeds',
      '1 pinch salt',
    ],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Heat the oven to 200C.' },
      { '@type': 'HowToStep', text: 'Toss the carrots with honey and cumin.' },
      { '@type': 'HowToStep', text: 'Roast for 35 minutes, turning once.' },
    ],
  })}</script>
</head><body><h1>Whatever</h1></body></html>`;
    const parsed = parseRecipeHtml(html);
    expect(parsed.source).toBe('schema-org');
    expect(parsed.title).toBe('Roast Carrots With Honey');
    expect(parsed.imageUrl).toBe('https://example.com/carrots.jpg');
    expect(parsed.totalMinutes).toBe(45);
    expect(parsed.yieldText).toBe('4 servings');
    expect(parsed.ingredients).toHaveLength(4);
    expect(parsed.ingredients[0]).toBe('500g carrots, peeled');
    expect(parsed.steps).toEqual([
      'Heat the oven to 200C.',
      'Toss the carrots with honey and cumin.',
      'Roast for 35 minutes, turning once.',
    ]);
  });

  test('finds a Recipe nested inside a @graph wrapper', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Page title' },
        {
          '@type': ['Recipe', 'Thing'],
          name: 'Tomato Soup',
          recipeIngredient: ['1 tin tomatoes', '1 onion'],
          recipeInstructions: 'Blend tomatoes and onion. Simmer for 20 minutes.',
        },
      ],
    })}</script>`;
    const parsed = parseRecipeHtml(html);
    expect(parsed.title).toBe('Tomato Soup');
    expect(parsed.ingredients).toEqual(['1 tin tomatoes', '1 onion']);
    // String instructions get split on sentence boundaries.
    expect(parsed.steps.length).toBeGreaterThanOrEqual(1);
    expect(parsed.steps.join(' ')).toContain('Blend tomatoes');
  });

  test('flattens HowToSection groupings into a flat step list', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Layered Cake',
      recipeIngredient: ['flour', 'sugar'],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Sponge',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Cream the butter and sugar.' },
            { '@type': 'HowToStep', text: 'Fold in the flour.' },
          ],
        },
        {
          '@type': 'HowToSection',
          name: 'Icing',
          itemListElement: [{ '@type': 'HowToStep', text: 'Beat the icing sugar with butter.' }],
        },
      ],
    })}</script>`;
    const parsed = parseRecipeHtml(html);
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps[0]).toBe('Cream the butter and sugar.');
    expect(parsed.steps[2]).toBe('Beat the icing sugar with butter.');
  });
});

describe('parseRecipeHtml — open-graph fallback', () => {
  test('uses og:title + the first <ul> when there is no schema.org block', () => {
    const html = `<!doctype html>
<html><head>
  <meta property="og:title" content="Granny's Pancakes" />
  <meta property="og:image" content="https://example.com/pancakes.jpg" />
</head><body>
  <h1>Granny's Pancakes</h1>
  <p>Some intro prose about a beloved family recipe.</p>
  <ul>
    <li>200g plain flour</li>
    <li>2 eggs</li>
    <li>300ml milk</li>
    <li>1 pinch salt</li>
  </ul>
</body></html>`;
    const parsed = parseRecipeHtml(html);
    expect(parsed.source).toBe('opengraph-fallback');
    expect(parsed.title).toBe("Granny's Pancakes");
    expect(parsed.imageUrl).toBe('https://example.com/pancakes.jpg');
    expect(parsed.ingredients).toEqual([
      '200g plain flour',
      '2 eggs',
      '300ml milk',
      '1 pinch salt',
    ]);
  });

  test('throws a clean error when nothing is extractable', () => {
    const html = `<!doctype html><html><head><title>Generic page</title></head>
<body><p>Just some text. No recipe markup. No list. Nothing useful.</p></body></html>`;
    expect(() => parseRecipeHtml(html)).toThrow(RecipeImportError);
    try {
      parseRecipeHtml(html);
    } catch (err) {
      expect((err as Error).message).toContain('Try pasting the text instead');
    }
  });
});

describe('importRecipeFromUrl', () => {
  test('builds a proxy URL and parses the response', async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Mock Pasta',
      recipeIngredient: ['200g pasta'],
      recipeInstructions: ['Boil pasta.'],
    })}</script>`;
    const calls: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return new Response(html, { status: 200 });
    }) as unknown as typeof fetch;
    const parsed = await importRecipeFromUrl('https://example.com/r/123', fakeFetch);
    expect(parsed.title).toBe('Mock Pasta');
    expect(parsed.source).toBe('schema-org');
    expect(calls[0]).toBe(buildProxyUrl('https://example.com/r/123'));
  });

  test('rejects an obviously-invalid URL before hitting the network', async () => {
    const fakeFetch = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    await expect(importRecipeFromUrl('not a url', fakeFetch)).rejects.toThrow(RecipeImportError);
  });

  test('surfaces a clean error on non-2xx proxy responses', async () => {
    const fakeFetch = (async () =>
      new Response('blocked', { status: 451 })) as unknown as typeof fetch;
    await expect(importRecipeFromUrl('https://example.com', fakeFetch)).rejects.toThrow(
      /status 451/,
    );
  });
});

describe('buildProxyUrl', () => {
  test('URL-encodes the target into the ?url= parameter', () => {
    const built = buildProxyUrl('https://example.com/recipe?id=1&taste=hot');
    expect(built).toBe(
      '/__shippie/proxy?url=https%3A%2F%2Fexample.com%2Frecipe%3Fid%3D1%26taste%3Dhot',
    );
  });
});
