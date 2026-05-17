/**
 * On-device summarising for saved articles.
 *
 * Two paths, both local:
 *   1. The container's AI worker exposes a `summarise` task. We try
 *      it first via `shippie.ai.run({ task: 'summarise', ... })`.
 *   2. If the worker reports `source: 'unavailable'` (no transformers
 *      runtime, model load failed, device too constrained, or no
 *      summarise model registered yet), we fall back to a simple
 *      extractive heuristic.
 *
 * The extractive heuristic is documented and load-bearing: reading is
 * the action, so we never block a save on AI being ready. The fallback
 * picks the first sentence (almost always an intro/lede in news /
 * blog posts) plus the most-substantive remaining sentences by length,
 * up to `maxSentences` total. Honest, predictable, no hallucination.
 */
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

export interface Summary {
  sentences: string[];
  source: 'ai' | 'extractive' | 'unavailable';
}

export interface SummariseOptions {
  /** Target number of sentences. Default 3. */
  maxSentences?: number;
}

const DEFAULT_MAX = 3;

/**
 * Pure extractive summary — first sentence + most substantive remaining
 * sentences by length. Deterministic, testable, no IO.
 */
export function extractiveSummary(text: string, options: SummariseOptions = {}): Summary {
  const max = Math.max(1, options.maxSentences ?? DEFAULT_MAX);
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { sentences: [], source: 'extractive' };
  if (sentences.length <= max) return { sentences, source: 'extractive' };

  const first = sentences[0]!;
  // Pick the next N-1 by length, prefer earlier on ties so the summary
  // reads vaguely in the order the user will encounter it.
  const ranked = sentences
    .slice(1)
    .map((s, i) => ({ s, i, len: s.length }))
    .sort((a, b) => b.len - a.len || a.i - b.i)
    .slice(0, max - 1)
    .sort((a, b) => a.i - b.i)
    .map((entry) => entry.s);
  return { sentences: [first, ...ranked], source: 'extractive' };
}

/**
 * Run the summarise task through the container, falling back to the
 * extractive heuristic if the worker reports `unavailable` or the
 * call throws. Always resolves — no rejected promise leaks into the
 * save flow.
 */
export async function summariseWithFallback(
  shippie: Pick<ShippieIframeSdk, 'ai'>,
  text: string,
  options: SummariseOptions = {},
): Promise<Summary> {
  const trimmed = text.trim();
  if (!trimmed) return { sentences: [], source: 'extractive' };
  const max = Math.max(1, options.maxSentences ?? DEFAULT_MAX);
  try {
    const result = await shippie.ai.run({
      task: 'summarise',
      input: trimmed,
      options: { maxSentences: max },
    });
    if (result.source === 'unavailable') {
      return extractiveSummary(trimmed, { maxSentences: max });
    }
    const aiSentences = parseAiOutput(result.output, max);
    if (aiSentences.length > 0) {
      return { sentences: aiSentences, source: 'ai' };
    }
    // AI returned a shape we couldn't read — treat as unavailable
    // rather than rendering nothing.
    return extractiveSummary(trimmed, { maxSentences: max });
  } catch {
    return extractiveSummary(trimmed, { maxSentences: max });
  }
}

/**
 * Split a body of text into sentences. We avoid `Intl.Segmenter` for
 * bundle size; a regex covers ~95% of English prose well enough for
 * a 3-sentence summary. Newlines are pre-collapsed.
 */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  // Split on sentence boundaries. We match a terminator (.!?), an
  // optional closing quote/bracket, then whitespace before the next
  // capital / number / quote. Anything below 20 chars is probably a
  // fragment ("Mr.", "1.") and gets glued back to the previous one.
  const rough = flat.split(/(?<=[.!?]["')\]]?)\s+(?=[A-Z0-9"'(\[])/);
  const result: string[] = [];
  for (const piece of rough) {
    const s = piece.trim();
    if (!s) continue;
    // Glue when the *previous* sentence ends in a known abbreviation
    // ("Mr.", "Dr.", "St.", "Mt.", "Sr.", "Jr.") — single capital +
    // optional lowercase + period. Bare-length glue mis-handles
    // legitimately terse sentences like "One. Two."
    const prev = result[result.length - 1];
    const endsInAbbrev = prev ? /\b[A-Z][a-z]?\.$/.test(prev) : false;
    if (endsInAbbrev) {
      result[result.length - 1] = `${prev} ${s}`;
    } else {
      result.push(s);
    }
  }
  return result;
}

/**
 * The AI worker shape for `summarise` isn't standardised across
 * backends. Accept the common forms we'll see in practice:
 *   - `{ summary: string }`         — flat text, split client-side
 *   - `{ sentences: string[] }`     — pre-split
 *   - `string`                      — bare summary
 */
function parseAiOutput(output: unknown, max: number): string[] {
  if (typeof output === 'string') {
    return splitSentences(output).slice(0, max);
  }
  if (output && typeof output === 'object') {
    const obj = output as { summary?: unknown; sentences?: unknown };
    if (Array.isArray(obj.sentences)) {
      return obj.sentences
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, max);
    }
    if (typeof obj.summary === 'string') {
      return splitSentences(obj.summary).slice(0, max);
    }
  }
  return [];
}
