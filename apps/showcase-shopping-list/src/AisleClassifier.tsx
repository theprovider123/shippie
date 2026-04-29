/**
 * P5 — aisle classifier for the Shopping List.
 *
 * Lets the user group items by aisle without typing aisle names. We
 * call `shippie.ai.run({ task: 'classify', input: name, options: {
 * labels: AISLES } })` against a fixed set of supermarket aisle
 * labels and bin items by the top match.
 *
 * P5 invariant: when the AI worker reports `unavailable` we hide the
 * "Group by aisle" toggle entirely. The flat list still works.
 */
import { useEffect, useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

export const AISLES = [
  'produce',
  'dairy',
  'bakery',
  'meat',
  'frozen',
  'pantry',
  'beverages',
  'snacks',
  'household',
  'pharmacy',
] as const;

export type Aisle = (typeof AISLES)[number] | 'unsorted';

interface AisleClassifierProps {
  shippie: ShippieIframeSdk;
  /** Item names to classify. Stable input → cached result. */
  itemNames: readonly string[];
  /** Map of `name -> aisle`; emitted whenever new items resolve. */
  onClassified: (map: Record<string, Aisle>) => void;
}

interface CacheEntry {
  aisle: Aisle;
  /** Confidence score from the classifier. */
  confidence: number;
}

const SESSION_CACHE = new Map<string, CacheEntry>();

export function useAisleClassifier({
  shippie,
  itemNames,
  onClassified,
}: AisleClassifierProps): { available: boolean | null; pending: number } {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (available === false) return;
    let cancelled = false;
    const todo: string[] = [];
    for (const raw of itemNames) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      if (!SESSION_CACHE.has(key)) todo.push(key);
    }
    if (todo.length === 0) {
      // All cached — emit current snapshot.
      onClassified(snapshotFor(itemNames));
      return;
    }
    setPending(todo.length);
    (async () => {
      for (const key of todo) {
        if (cancelled) return;
        try {
          const result = await shippie.ai.run({
            task: 'classify',
            input: key,
            options: { labels: [...AISLES] },
          });
          if (cancelled) return;
          if (result.source === 'unavailable') {
            setAvailable(false);
            return;
          }
          setAvailable(true);
          const out = result.output as { label?: string; confidence?: number } | null;
          const aisle = isAisle(out?.label) ? out.label : 'unsorted';
          SESSION_CACHE.set(key, {
            aisle,
            confidence: typeof out?.confidence === 'number' ? out.confidence : 0,
          });
          onClassified(snapshotFor(itemNames));
        } catch {
          if (!cancelled) setAvailable(false);
          return;
        } finally {
          if (!cancelled) setPending((n) => Math.max(0, n - 1));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemNames.join('|'), shippie, available, onClassified]);

  return { available, pending };
}

export function aisleLabel(aisle: Aisle): string {
  if (aisle === 'unsorted') return 'Other';
  return aisle.charAt(0).toUpperCase() + aisle.slice(1);
}

function snapshotFor(names: readonly string[]): Record<string, Aisle> {
  const out: Record<string, Aisle> = {};
  for (const name of names) {
    const key = name.trim().toLowerCase();
    out[name] = SESSION_CACHE.get(key)?.aisle ?? 'unsorted';
  }
  return out;
}

function isAisle(value: unknown): value is Aisle {
  return typeof value === 'string' && (AISLES as readonly string[]).includes(value);
}
