// packages/sdk/src/wrapper/observe/rules/share-target.ts
/**
 * Share Target rule — when the OS hands the PWA shared content (URL,
 * text, files) via Web Share Target, route it to a maker handler
 * registered via `shippie.share.onReceive(handler)`.
 *
 * The actual OS routing is configured at install time via the manifest
 * (the Worker generates the `share_target` block from shippie.json).
 * This rule's job is page-side: read the incoming GET/POST that the OS
 * sends to the share-target action URL, decode the payload, and fan
 * out to the maker's registered handler.
 */
import type { EnhanceRule } from '../types.ts';

export interface SharedPayload {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

type Handler = (p: SharedPayload) => void | Promise<void>;
const handlers = new Set<Handler>();
let processedThisLoad = false;

export function onReceive(handler: Handler): () => void {
  handlers.add(handler);
  // If a share already arrived before this handler registered, fire it
  // synchronously after the current tick so React/Vue/etc. can attach
  // first.
  if (processedThisLoad) queueMicrotask(() => handler(lastPayload!));
  return () => {
    handlers.delete(handler);
  };
}

let lastPayload: SharedPayload | null = null;

function readUrlParams(): SharedPayload | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const title = url.searchParams.get('title') ?? undefined;
  const text = url.searchParams.get('text') ?? undefined;
  const shared = url.searchParams.get('url') ?? undefined;
  if (!title && !text && !shared) return null;
  return { title, text, url: shared };
}

async function dispatch(payload: SharedPayload): Promise<void> {
  lastPayload = payload;
  processedThisLoad = true;
  for (const h of handlers) {
    try {
      await h(payload);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('shippie:share-handler-error', {
          detail: { error: (err as Error).message },
        }),
      );
    }
  }
  // Strip share params from the URL so a refresh doesn't re-fire.
  if (typeof history !== 'undefined' && history.replaceState) {
    const u = new URL(window.location.href);
    for (const k of ['title', 'text', 'url']) u.searchParams.delete(k);
    history.replaceState(null, '', u.toString());
  }
}

export const shareTargetRule: EnhanceRule = {
  name: 'share-target',
  capabilities: ['share-target'],
  apply: () => {
    if (processedThisLoad) return;
    const params = readUrlParams();
    if (params) void dispatch(params);
    // POST/multipart shares come via service-worker → BroadcastChannel.
    // The Worker-generated SW posts a `shippie:share` message on a known
    // channel; we listen here.
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('shippie:share');
      channel.onmessage = (ev) => {
        const data = ev.data as SharedPayload | null;
        if (data) void dispatch(data);
      };
    }
    return () => {
      channel?.close();
    };
  },
};
