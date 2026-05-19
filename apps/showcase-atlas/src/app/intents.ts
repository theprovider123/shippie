import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_atlas' });
  return sdk;
}

export type AtlasIntent = 'trip-started' | 'stop-pinned' | 'trip-ended';

export function emitIntent(intent: AtlasIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    /* iframe sdk no-ops outside the container */
  }
}

/**
 * Cross-app: Restaurant Memory's `dined-out` arrivals. These don't
 * carry coordinates by design (privacy) so they can't go on the map.
 * They live as a "recent visits" sidebar on the Trips page until a
 * future stop-merge flow lets the user attach one to a trip.
 */
export interface DinedOutEntry {
  id: string;
  title: string;
  rating?: number | null;
  visitedAt: string;
  receivedAt: number;
}

const DINED_OUT_KEY = 'shippie.atlas.dined-out.v1';
const MAX_DINED_OUT = 12;

export function loadDinedOut(): DinedOutEntry[] {
  try {
    const raw = localStorage.getItem(DINED_OUT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DinedOutEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDinedOut(entries: DinedOutEntry[]): void {
  try {
    localStorage.setItem(DINED_OUT_KEY, JSON.stringify(entries.slice(0, MAX_DINED_OUT)));
  } catch {
    /* quota — ignore */
  }
}

export function subscribeDinedOut(handler: (entries: DinedOutEntry[]) => void): () => void {
  try {
    getSdk().requestIntent('dined-out');
    return getSdk().intent.subscribe('dined-out', (broadcast) => {
      const arrivals: DinedOutEntry[] = [];
      for (const raw of broadcast.rows) {
        const row = raw as { title?: string; restaurant?: string; rating?: number | null; visitedAt?: string };
        const title = row.title ?? row.restaurant;
        if (!title) continue;
        arrivals.push({
          id: `do_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title,
          rating: typeof row.rating === 'number' ? row.rating : null,
          visitedAt: typeof row.visitedAt === 'string' ? row.visitedAt : new Date().toISOString(),
          receivedAt: Date.now(),
        });
      }
      if (arrivals.length === 0) return;
      const existing = loadDinedOut();
      const merged = [
        ...arrivals,
        ...existing.filter((e) => !arrivals.some((a) => a.title === e.title && a.visitedAt === e.visitedAt)),
      ].slice(0, MAX_DINED_OUT);
      saveDinedOut(merged);
      handler(merged);
    });
  } catch {
    return () => undefined;
  }
}
