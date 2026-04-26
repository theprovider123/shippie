import { describe, expect, it } from 'bun:test';
import { sentimentTrendAnalyser } from './sentiment-trend.ts';
import type { AnalyserContext, SentimentResult } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

type Polarity = 'positive' | 'neutral' | 'negative';

/** Build a sentiment fn that maps each row's text to a fixed polarity. */
function makeSentiment(map: Record<string, Polarity>) {
  const calls: string[] = [];
  const fn = async (text: string): Promise<SentimentResult> => {
    calls.push(text);
    const polarity = map[text] ?? 'neutral';
    return { sentiment: polarity, score: polarity === 'neutral' ? 0.5 : 0.9 };
  };
  return { fn, calls };
}

function makeEmbed() {
  // Not used by sentiment-trend, but the type allows it. We provide a stub
  // so tests can verify the analyser doesn't accidentally call embed.
  let called = 0;
  const fn = async (_text: string) => {
    called += 1;
    return { embedding: [1, 0, 0] };
  };
  return { fn, called: () => called };
}

function ctx(
  data: Record<string, unknown>[],
  sentiment: AnalyserContext['sentiment'],
  embed?: AnalyserContext['embed'],
  now = NOW,
): AnalyserContext {
  return { collection: 'entries', data, now, embed, sentiment };
}

describe('sentimentTrendAnalyser', () => {
  it('emits a medium-urgency insight when sentiment slopes downward over weeks', async () => {
    // 4 weeks: oldest week all positive, next mixed, next negative, latest all negative.
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    const week = (offsetWeeks: number, polarity: Polarity, n: number) => {
      for (let i = 0; i < n; i++) {
        const text = `w${offsetWeeks}-${polarity}-${i}`;
        const ts = NOW - offsetWeeks * 7 * DAY_MS - i * DAY_MS - 60_000;
        rows.push({ ts, text });
        map[text] = polarity;
      }
    };
    week(3, 'positive', 3); // oldest week: avg +1
    week(2, 'positive', 3); // avg +1
    week(1, 'negative', 3); // avg -1
    week(0, 'negative', 3); // latest week: avg -1

    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));

    expect(out).toHaveLength(1);
    const insight = out[0]!;
    expect(insight.id.length).toBeGreaterThan(0);
    expect(insight.collection).toBe('entries');
    expect(insight.urgency).toBe('medium');
    expect(insight.generatedAt).toBe(NOW);
    expect(insight.title).toBe('Your mood has trended down this week');
    expect(insight.summary.length).toBeGreaterThan(0);
    expect(sentiment.calls.length).toBe(rows.length);
  });

  it('does not emit when sentiment is flat across weeks', async () => {
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 3; i++) {
        const text = `w${w}-${i}`;
        rows.push({ ts: NOW - w * 7 * DAY_MS - i * DAY_MS - 60_000, text });
        map[text] = 'neutral';
      }
    }
    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toEqual([]);
  });

  it('does not emit when sentiment slopes upward', async () => {
    // oldest = negative, latest = positive → slope > 0
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    const week = (offsetWeeks: number, polarity: Polarity, n: number) => {
      for (let i = 0; i < n; i++) {
        const text = `w${offsetWeeks}-${polarity}-${i}`;
        rows.push({ ts: NOW - offsetWeeks * 7 * DAY_MS - i * DAY_MS - 60_000, text });
        map[text] = polarity;
      }
    };
    week(3, 'negative', 3);
    week(2, 'negative', 3);
    week(1, 'positive', 3);
    week(0, 'positive', 3);
    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toEqual([]);
  });

  it('returns empty when ctx.sentiment is missing (queue path)', async () => {
    const rows = [{ ts: NOW, text: 'hi' }];
    const out = await sentimentTrendAnalyser.run(ctx(rows, undefined));
    expect(out).toEqual([]);
  });

  it('returns empty when no text-bearing field is present', async () => {
    const rows = [
      { ts: NOW - DAY_MS, mood: 1 },
      { ts: NOW - 2 * DAY_MS, mood: 2 },
    ];
    const sentiment = makeSentiment({});
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toEqual([]);
    expect(sentiment.calls.length).toBe(0);
  });

  it('prefers the `text` field over `body` and `content`', async () => {
    // Each row carries a different value in each candidate field; the analyser
    // should call sentiment with the `text` value only.
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 2; i++) {
        const text = `text-w${w}-${i}`;
        rows.push({
          ts: NOW - w * 7 * DAY_MS - i * DAY_MS - 60_000,
          text,
          body: `body-w${w}-${i}`,
          content: `content-w${w}-${i}`,
        });
        // Force a downward trend so an insight is emitted, proving we read `text`.
        map[text] = w >= 2 ? 'positive' : 'negative';
      }
    }
    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toHaveLength(1);
    // All calls should have been on the `text-` strings, never on body/content.
    expect(sentiment.calls.every((c) => c.startsWith('text-'))).toBe(true);
  });

  it('falls back to `body` when `text` is absent', async () => {
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 2; i++) {
        const body = `body-w${w}-${i}`;
        rows.push({ ts: NOW - w * 7 * DAY_MS - i * DAY_MS - 60_000, body });
        map[body] = w >= 2 ? 'positive' : 'negative';
      }
    }
    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toHaveLength(1);
    expect(sentiment.calls.every((c) => c.startsWith('body-'))).toBe(true);
  });

  it('does not emit when only one week of data exists', async () => {
    const rows: Record<string, unknown>[] = [];
    const map: Record<string, Polarity> = {};
    for (let i = 0; i < 5; i++) {
      const text = `today-${i}`;
      rows.push({ ts: NOW - i * 60_000, text });
      map[text] = 'negative';
    }
    const sentiment = makeSentiment(map);
    const out = await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn));
    expect(out).toEqual([]);
  });

  it('does not call embed', async () => {
    const rows: Record<string, unknown>[] = [{ ts: NOW, text: 'one' }];
    const sentiment = makeSentiment({ one: 'positive' });
    const embed = makeEmbed();
    await sentimentTrendAnalyser.run(ctx(rows, sentiment.fn, embed.fn));
    expect(embed.called()).toBe(0);
  });
});
