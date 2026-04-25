import { describe, expect, test } from 'bun:test';
import { createDevLocalAi } from './dev-adapter.ts';

describe('@shippie/local-ai dev adapter', () => {
  test('provides deterministic placeholder text primitives', async () => {
    const ai = createDevLocalAi();
    await expect(ai.classify('Uber to the airport', { labels: ['transport', 'food'] })).resolves.toMatchObject({
      label: 'transport',
    });
    await expect(ai.sentiment('great fast clear')).resolves.toMatchObject({ sentiment: 'positive' });
    expect((await ai.embed('creamy pasta')).length).toBe(32);
    await expect(ai.labelImage(new Blob())).rejects.toThrow(/vision model/);
  });
});
