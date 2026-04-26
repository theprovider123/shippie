/**
 * Topic-cluster analyser (AI-backed).
 *
 * Embeds every text-bearing entry via `ctx.embed`, then runs a simple greedy
 * clustering with k=3:
 *  1. Pick the entry with the largest embedding norm as the first seed.
 *  2. Iteratively add as a seed the entry whose minimum cosine distance to
 *     the existing seeds is greatest (i.e. the most-distant remaining point).
 *     This deterministically picks the three "most spread" entries.
 *  3. Assign each remaining entry to the closest seed by cosine similarity.
 *
 * For each non-empty cluster, emits one `urgency: 'low'` Insight titled
 * "You've been writing about <top-keyword>" where the keyword is the most
 * frequent non-stopword token across the cluster's texts.
 *
 * `syncable: false` — requires the AI bridge.
 */
import type { Analyser, AnalyserContext, Insight } from '../types.ts';

const K = 3;
const MIN_ENTRIES = K; // need at least K entries to seed K clusters
const TEXT_FIELDS = ['text', 'body', 'content'] as const;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him',
  'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'no', 'not',
  'of', 'on', 'or', 'our', 'ours', 'out', 'over', 'she', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'to', 'too', 'under', 'up', 'us', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'would', 'you', 'your', 'yours', 'do', 'does', 'did',
  'about', 'after', 'before', 'just', 'like', 'now', 'only', 'very',
  'can', 'could', 'should', 'would', 'also', 'because', 'how', 'all',
]);

function newId(idx: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `topic-cluster-${crypto.randomUUID()}`;
  }
  return `topic-cluster-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickTextField(rows: ReadonlyArray<Record<string, unknown>>): string | null {
  for (const name of TEXT_FIELDS) {
    for (const row of rows) {
      const v = row[name];
      if (typeof v === 'string' && v.length > 0) return name;
    }
  }
  return null;
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Cosine distance in [0, 2]. */
function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosine(a, b);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function topKeyword(texts: string[]): string | null {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const tok of tokenize(t)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [tok, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && tok < best)) {
      best = tok;
      bestCount = c;
    }
  }
  return best;
}

export const topicClusterAnalyser: Analyser = {
  id: 'topic-cluster',
  syncable: false,
  async run(ctx: AnalyserContext): Promise<Insight[]> {
    const { collection, data, now, embed } = ctx;
    if (!embed) return [];
    if (data.length < MIN_ENTRIES) return [];

    const textField = pickTextField(data);
    if (!textField) return [];

    type Item = { text: string; embedding: number[] };
    const items: Item[] = [];

    for (const row of data) {
      const v = row[textField];
      if (typeof v !== 'string' || v.length === 0) continue;
      try {
        const { embedding } = await embed(v);
        if (Array.isArray(embedding) && embedding.length > 0) {
          items.push({ text: v, embedding });
        }
      } catch {
        continue;
      }
    }

    if (items.length < MIN_ENTRIES) return [];

    // Pick seeds: start with the largest-norm vector, then iteratively pick
    // the item whose min-distance to existing seeds is largest.
    const seedIdx: number[] = [];
    let firstIdx = 0;
    let firstNorm = -Infinity;
    for (let i = 0; i < items.length; i++) {
      const n = norm(items[i]!.embedding);
      if (n > firstNorm) {
        firstNorm = n;
        firstIdx = i;
      }
    }
    seedIdx.push(firstIdx);

    while (seedIdx.length < K) {
      let bestIdx = -1;
      let bestMinDist = -Infinity;
      for (let i = 0; i < items.length; i++) {
        if (seedIdx.includes(i)) continue;
        let minDist = Infinity;
        for (const s of seedIdx) {
          const d = cosineDistance(items[i]!.embedding, items[s]!.embedding);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      seedIdx.push(bestIdx);
    }

    // Assign every item to the nearest seed by cosine similarity.
    const clusters: string[][] = seedIdx.map(() => []);
    for (let i = 0; i < items.length; i++) {
      let bestSeed = 0;
      let bestSim = -Infinity;
      for (let s = 0; s < seedIdx.length; s++) {
        const sim = cosine(items[i]!.embedding, items[seedIdx[s]!]!.embedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestSeed = s;
        }
      }
      clusters[bestSeed]!.push(items[i]!.text);
    }

    const insights: Insight[] = [];
    for (let s = 0; s < clusters.length; s++) {
      const texts = clusters[s]!;
      if (texts.length === 0) continue;
      const keyword = topKeyword(texts);
      if (!keyword) continue;
      insights.push({
        id: newId(s),
        collection,
        generatedAt: now,
        urgency: 'low',
        title: `You've been writing about ${keyword}`,
        summary: `${texts.length} recent ${
          texts.length === 1 ? 'entry mentions' : 'entries mention'
        } "${keyword}".`,
      });
    }

    return insights;
  },
};
