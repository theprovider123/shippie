/**
 * Plan E Task 9: register the sentiment-trend ambient analyser for the
 * journal's `entries` collection. Runs at app open via `runOnce`; the
 * SW's periodic-sync trigger queues a sweep marker that we drain here.
 *
 * The wrapper's observe-init.ts already handles the queue drain + insight
 * card render, so all we need to do is feed the orchestrator the journal's
 * data + the AI bridge once on app open.
 */
import { runOnce, sentimentTrendAnalyser, type AmbientConfig } from '@shippie/ambient';
import { resolveLocalDb } from '../db/runtime.ts';
import { listEntries } from '../db/queries.ts';
import { getLocalAi, isLocalAiAvailable } from '../ai/runtime.ts';

const CONFIG: AmbientConfig = {
  enabled: true,
  intervalMs: 24 * 60 * 60 * 1000,
  collections: ['entries'],
  analysers: ['sentiment-trend'],
};

export async function bootAmbientForJournal(now: number = Date.now()): Promise<void> {
  // Skip if the AI bridge isn't reachable — sentiment-trend needs `sentiment`.
  if (!isLocalAiAvailable()) return;

  const ai = getLocalAi();
  const db = resolveLocalDb();

  try {
    await runOnce({
      config: CONFIG,
      analysers: [sentimentTrendAnalyser],
      now,
      sentiment: async (text: string) => {
        const r = await ai.sentiment(text);
        return {
          sentiment:
            r.sentiment === 'positive'
              ? 'positive'
              : r.sentiment === 'negative'
                ? 'negative'
                : 'neutral',
          score: r.score,
        };
      },
      async readCollection(name: string, sinceMs: number) {
        if (name !== 'entries') return [];
        const rows = await listEntries(db);
        return rows
          .map((e) => {
            const createdAt = e.created_at;
            const ts =
              typeof createdAt === 'number'
                ? createdAt
                : typeof createdAt === 'string'
                  ? new Date(createdAt).getTime()
                  : 0;
            return {
              ts,
              text: e.body,
              id: e.id,
            };
          })
          .filter((r) => r.ts >= sinceMs && Number.isFinite(r.ts));
      },
    });
  } catch (e: unknown) {
    // Ambient is best-effort. Log but never crash the app.
    console.warn('[journal:ambient] runOnce failed', e);
  }
}
