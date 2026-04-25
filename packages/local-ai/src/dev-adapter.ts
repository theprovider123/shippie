import type { ClassificationResult, SentimentResult, ShippieLocalAi } from '@shippie/local-runtime-contract';
import { detectLocalAiAvailability } from './capabilities.ts';

export function createDevLocalAi(): ShippieLocalAi {
  return {
    available: async () => detectLocalAiAvailability(),
    classify: async (text, opts) => classifyWithKeywords(text, opts.labels),
    sentiment: async (text) => sentimentWithLexicon(text),
    embed: async (text) => embedHash(text),
    labelImage: async () => {
      throw new Error('local vision model is not loaded');
    },
  };
}

function classifyWithKeywords(text: string, labels: string[]): ClassificationResult {
  if (labels.length === 0) throw new Error('classify requires at least one label');
  const normalized = tokenize(text);
  const scored = labels.map((label) => {
    const labelTokens = [...tokenize(label), ...(LABEL_HINTS[label.toLowerCase()] ?? [])];
    const hits = labelTokens.filter((token) => normalized.includes(token)).length;
    return { label, confidence: Math.min(0.99, 0.35 + hits * 0.25) };
  });
  scored.sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
  return scored[0]!;
}

function sentimentWithLexicon(text: string): SentimentResult {
  const positive = new Set(['good', 'great', 'love', 'strong', 'amazing', 'fast', 'clear', 'happy']);
  const negative = new Set(['bad', 'slow', 'hate', 'sad', 'broken', 'angry', 'awful', 'hard']);
  let score = 0;
  for (const token of tokenize(text)) {
    if (positive.has(token)) score += 1;
    if (negative.has(token)) score -= 1;
  }
  const normalized = Math.min(1, Math.abs(score) / 4);
  if (score > 0) return { sentiment: 'positive', score: normalized };
  if (score < 0) return { sentiment: 'negative', score: normalized };
  return { sentiment: 'neutral', score: 0 };
}

function embedHash(text: string): Float32Array {
  const vector = new Float32Array(32);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = hash % vector.length;
    vector[index] = (vector[index] ?? 0) + (hash % 2 === 0 ? 1 : -1);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  for (let i = 0; i < vector.length; i++) {
    vector[i] = (vector[i] ?? 0) / norm;
  }
  return vector;
}

const LABEL_HINTS: Record<string, string[]> = {
  transport: ['uber', 'taxi', 'train', 'bus', 'airport', 'flight'],
  food: ['meal', 'restaurant', 'recipe', 'pasta', 'grocery'],
  entertainment: ['movie', 'music', 'game', 'concert'],
  utilities: ['electric', 'water', 'gas', 'internet'],
  shopping: ['store', 'purchase', 'cart', 'order'],
};

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
