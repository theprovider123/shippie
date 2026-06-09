// Sync queue — publishes to the shared graph when the user opts in.
//
// lot. is local-first: nothing here runs unless the user explicitly publishes
// a cup score. On publish we enqueue, attempt an immediate send to the sync
// Worker, and fall back to the queue if offline. A retry pass drains the queue
// on next app open. Every failure mode is silent — the app never errors or
// blocks on the network.

import { newId, isoNow, type Store } from '../db.ts';
import type { SyncItem } from '../types.ts';

/** Stubbed Worker endpoint. Wire NEXT_PUBLIC_SYNC_URL / VITE_SYNC_URL to a
 *  real Cloudflare Worker to go live; absent, everything queues locally. */
function syncUrl(): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return env?.VITE_SYNC_URL ?? env?.NEXT_PUBLIC_SYNC_URL;
  } catch {
    return undefined;
  }
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

async function send(item: SyncItem): Promise<boolean> {
  const url = syncUrl();
  if (!url || !isOnline()) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: item.type, payload: item.payload }),
    });
    return res.ok;
  } catch {
    return false; // silent — offline / blocked / down
  }
}

/** Enqueue a publish and try to send it immediately. Returns the updated
 *  queue (caller persists). Never throws. */
export async function publish(
  queue: SyncItem[],
  type: SyncItem['type'],
  payload: unknown,
): Promise<SyncItem[]> {
  const item: SyncItem = { id: newId('sync'), type, payload, status: 'pending', createdAt: isoNow() };
  const ok = await send(item);
  const settled: SyncItem = ok ? { ...item, status: 'sent', sentAt: isoNow() } : item;
  return [settled, ...queue].slice(0, 200);
}

/** Drain any pending items (call on app open). Returns the updated queue. */
export async function drain(queue: SyncItem[]): Promise<SyncItem[]> {
  if (!isOnline()) return queue;
  const out: SyncItem[] = [];
  for (const item of queue) {
    if (item.status === 'sent') {
      out.push(item);
      continue;
    }
    const ok = await send(item);
    out.push(ok ? { ...item, status: 'sent', sentAt: isoNow() } : { ...item, status: 'pending' });
  }
  return out;
}

export const pendingCount = (s: Store): number => s.syncQueue.filter((i) => i.status !== 'sent').length;
