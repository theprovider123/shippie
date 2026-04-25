/**
 * Resolve the local AI bridge from `window.shippie.local.ai` (the
 * cross-origin-iframe to `ai.shippie.app`). When unavailable we return
 * a deterministic fallback that lets the rest of the UI exercise the
 * same code paths in dev/tests without performing remote inference.
 *
 * Fallback notice:
 *   - sentiment / classify use a tiny lexicon-based heuristic.
 *   - embed produces a hash-based bag-of-tokens vector.
 *   - These are clearly labelled "fallback" via `isLocalAiAvailable()`
 *     so the UI can show a banner explaining reduced fidelity.
 */
import type {
  ClassificationResult,
  SentimentResult,
  ShippieLocalAi,
} from '@shippie/local-runtime-contract';

interface ShippieGlobal {
  local?: { ai?: ShippieLocalAi };
}

export function getLocalAi(): ShippieLocalAi {
  if (typeof window !== 'undefined') {
    const shippie = (window as unknown as { shippie?: ShippieGlobal }).shippie;
    if (shippie?.local?.ai) return shippie.local.ai;
  }
  return fallbackAi;
}

export function isLocalAiAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const shippie = (window as unknown as { shippie?: ShippieGlobal }).shippie;
  return !!shippie?.local?.ai;
}

const POSITIVE = new Set([
  'love',
  'great',
  'good',
  'amazing',
  'happy',
  'joy',
  'grateful',
  'wonderful',
  'awesome',
  'excited',
  'calm',
  'peaceful',
  'kind',
  'fun',
  'beautiful',
  'thrilled',
  'energised',
  'energized',
  'proud',
  'win',
  'winning',
  'better',
]);

const NEGATIVE = new Set([
  'hate',
  'sad',
  'bad',
  'awful',
  'tired',
  'anxious',
  'angry',
  'stressed',
  'worried',
  'fear',
  'scared',
  'lonely',
  'depressed',
  'frustrated',
  'overwhelmed',
  'painful',
  'awkward',
  'terrible',
  'worse',
  'horrible',
  'crying',
  'broken',
]);

const TOPIC_KEYWORDS: Record<string, string[]> = {
  work: [
    'work',
    'office',
    'project',
    'meeting',
    'boss',
    'deadline',
    'colleague',
    'team',
    'client',
    'manager',
    'job',
    'career',
    'interview',
  ],
  relationships: [
    'partner',
    'wife',
    'husband',
    'girlfriend',
    'boyfriend',
    'mom',
    'dad',
    'family',
    'friend',
    'love',
    'date',
    'parents',
    'sister',
    'brother',
    'kids',
    'son',
    'daughter',
  ],
  health: [
    'sleep',
    'tired',
    'gym',
    'run',
    'pain',
    'doctor',
    'sick',
    'health',
    'workout',
    'eat',
    'meal',
    'food',
    'water',
    'rest',
    'meditation',
    'therapy',
  ],
  hobbies: [
    'guitar',
    'piano',
    'paint',
    'draw',
    'read',
    'book',
    'movie',
    'film',
    'game',
    'hike',
    'cook',
    'garden',
    'music',
    'photo',
    'photography',
    'craft',
    'knit',
  ],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const fallbackAi: ShippieLocalAi = {
  async available() {
    return {
      embeddings: true,
      classification: true,
      sentiment: true,
      vision: false,
      gpu: false,
      wasm: false,
    };
  },
  async classify(text: string, opts: { labels: string[] }): Promise<ClassificationResult> {
    const tokens = new Set(tokenize(text));
    let best: ClassificationResult = { label: opts.labels[0] ?? 'unknown', confidence: 0 };
    for (const label of opts.labels) {
      const keywords = TOPIC_KEYWORDS[label] ?? [label];
      let hits = 0;
      for (const k of keywords) if (tokens.has(k)) hits += 1;
      const score = hits / Math.max(1, keywords.length);
      if (score > best.confidence) best = { label, confidence: Math.min(1, score + 0.05) };
    }
    return best;
  },
  async sentiment(text: string): Promise<SentimentResult> {
    const tokens = tokenize(text);
    let pos = 0;
    let neg = 0;
    for (const t of tokens) {
      if (POSITIVE.has(t)) pos += 1;
      if (NEGATIVE.has(t)) neg += 1;
    }
    const total = pos + neg;
    if (total === 0) return { sentiment: 'neutral', score: 0 };
    const score = (pos - neg) / Math.max(total, 4);
    if (score > 0.15) return { sentiment: 'positive', score: Math.min(1, score + 0.4) };
    if (score < -0.15) return { sentiment: 'negative', score: Math.max(-1, score - 0.4) };
    return { sentiment: 'neutral', score };
  },
  async embed(text: string): Promise<Float32Array> {
    return embedDeterministic(text, 64);
  },
  async labelImage() {
    return [];
  },
};

/** Hash-based fallback embedding. Stable, deterministic, fast — and transparent. */
export function embedDeterministic(text: string, dim = 64): Float32Array {
  const v = new Float32Array(dim);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      hash ^= tok.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % dim;
    const sign = (hash >> 31) & 1 ? -1 : 1;
    v[idx]! += sign;
  }
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += v[i]! * v[i]!;
  const m = Math.sqrt(mag) || 1;
  for (let i = 0; i < dim; i++) v[i]! /= m;
  return v;
}
