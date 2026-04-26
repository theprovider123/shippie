import { describe, expect, it } from 'bun:test';
import { topicClusterAnalyser } from './topic-cluster.ts';
import type { AnalyserContext } from '../types.ts';

const NOW = 1_700_000_000_000;

/** A stub embedder: returns a vector keyed off a tag in the text. */
function makeEmbed(tagToVector: Record<string, number[]>) {
  const calls: string[] = [];
  const fn = async (text: string) => {
    calls.push(text);
    for (const tag of Object.keys(tagToVector)) {
      if (text.includes(tag)) return { embedding: tagToVector[tag]! };
    }
    return { embedding: [0, 0, 0] };
  };
  return { fn, calls };
}

function ctx(
  data: Record<string, unknown>[],
  embed: AnalyserContext['embed'],
  now = NOW,
): AnalyserContext {
  return { collection: 'entries', data, now, embed };
}

describe('topicClusterAnalyser', () => {
  it('emits one insight per non-empty cluster, surfacing the top keyword', async () => {
    // Three obvious axes: x (positive), y (productive), z (anxious).
    const embed = makeEmbed({
      '[X]': [1, 0, 0],
      '[Y]': [0, 1, 0],
      '[Z]': [0, 0, 1],
    });
    const rows: Record<string, unknown>[] = [
      // Cluster X: 3 entries about coffee.
      { ts: NOW - 1000, text: '[X] coffee with friends today' },
      { ts: NOW - 2000, text: '[X] strong coffee fixed the morning' },
      { ts: NOW - 3000, text: '[X] coffee shop downtown was busy' },
      // Cluster Y: 3 entries about gardening.
      { ts: NOW - 4000, text: '[Y] gardening tomato beds again' },
      { ts: NOW - 5000, text: '[Y] gardening rocks today properly' },
      { ts: NOW - 6000, text: '[Y] morning gardening helped my back' },
      // Cluster Z: 3 entries about deadlines.
      { ts: NOW - 7000, text: '[Z] deadlines deadlines deadlines tomorrow' },
      { ts: NOW - 8000, text: '[Z] missed deadlines stress everywhere' },
      { ts: NOW - 9000, text: '[Z] deadlines pile up faster' },
    ];

    const out = await topicClusterAnalyser.run(ctx(rows, embed.fn));

    expect(out).toHaveLength(3);
    for (const insight of out) {
      expect(insight.collection).toBe('entries');
      expect(insight.urgency).toBe('low');
      expect(insight.generatedAt).toBe(NOW);
      expect(insight.id.length).toBeGreaterThan(0);
      expect(insight.title.startsWith("You've been writing about ")).toBe(true);
      expect(insight.summary.length).toBeGreaterThan(0);
    }
    const titles = out.map((i) => i.title).sort();
    expect(titles).toEqual([
      "You've been writing about coffee",
      "You've been writing about deadlines",
      "You've been writing about gardening",
    ]);
    expect(embed.calls.length).toBe(rows.length);
  });

  it('returns empty when ctx.embed is missing (queue path)', async () => {
    const rows = [
      { ts: NOW, text: 'one' },
      { ts: NOW - 1, text: 'two' },
      { ts: NOW - 2, text: 'three' },
    ];
    const out = await topicClusterAnalyser.run(ctx(rows, undefined));
    expect(out).toEqual([]);
  });

  it('returns empty when fewer than k entries exist', async () => {
    const embed = makeEmbed({});
    const rows = [
      { ts: NOW, text: 'only one entry exists here' },
      { ts: NOW - 1, text: 'two entries are not enough' },
    ];
    const out = await topicClusterAnalyser.run(ctx(rows, embed.fn));
    expect(out).toEqual([]);
  });

  it('returns empty when no text-bearing field is available', async () => {
    const embed = makeEmbed({});
    const rows = [
      { ts: NOW, mood: 1 },
      { ts: NOW - 1, mood: 2 },
      { ts: NOW - 2, mood: 3 },
    ];
    const out = await topicClusterAnalyser.run(ctx(rows, embed.fn));
    expect(out).toEqual([]);
    expect(embed.calls.length).toBe(0);
  });

  it('falls back to `body` when `text` is absent and skips stopwords for keyword', async () => {
    const embed = makeEmbed({
      '[A]': [1, 0, 0],
      '[B]': [0, 1, 0],
      '[C]': [0, 0, 1],
    });
    const rows = [
      { ts: NOW - 1, body: '[A] the running with the team again today' },
      { ts: NOW - 2, body: '[A] running was the highlight' },
      { ts: NOW - 3, body: '[A] running running running everywhere' },
      { ts: NOW - 4, body: '[B] cooking pasta tonight again' },
      { ts: NOW - 5, body: '[B] cooking is therapeutic' },
      { ts: NOW - 6, body: '[B] cooking dinner properly' },
      { ts: NOW - 7, body: '[C] reading novels lately' },
      { ts: NOW - 8, body: '[C] reading the new book' },
      { ts: NOW - 9, body: '[C] reading is great' },
    ];
    const out = await topicClusterAnalyser.run(ctx(rows, embed.fn));
    expect(out.length).toBe(3);
    const titles = out.map((i) => i.title).sort();
    expect(titles).toEqual([
      "You've been writing about cooking",
      "You've been writing about reading",
      "You've been writing about running",
    ]);
  });

  it('handles a single dominant cluster gracefully (other seeds may be empty)', async () => {
    // All 5 entries embed to the same vector. Two seeds will be picked by
    // the spread heuristic, but every entry collapses into one cluster.
    const embed = makeEmbed({ '[X]': [1, 0, 0] });
    const rows = [
      { ts: NOW - 1, text: '[X] alpha alpha alpha alpha' },
      { ts: NOW - 2, text: '[X] alpha beta alpha' },
      { ts: NOW - 3, text: '[X] alpha gamma alpha' },
      { ts: NOW - 4, text: '[X] alpha delta alpha' },
      { ts: NOW - 5, text: '[X] alpha epsilon alpha' },
    ];
    const out = await topicClusterAnalyser.run(ctx(rows, embed.fn));
    expect(out.length).toBeGreaterThanOrEqual(1);
    // Whichever non-empty cluster wins, "alpha" is the top keyword.
    const someAlpha = out.some((i) =>
      i.title === "You've been writing about alpha",
    );
    expect(someAlpha).toBe(true);
  });
});
