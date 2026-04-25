export type CapabilityProofName =
  | 'local.opfs_probe'
  | 'local.persist_granted'
  | 'local.persist_denied'
  | 'local.db_used'
  | 'local.files_used'
  | 'local.ai_model_cached';

export interface CapabilityProofOptions {
  endpoint?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

const SENT = new Set<CapabilityProofName>();
const DEFAULT_ENDPOINT = '/__shippie/beacon';

export function recordCapabilityProof(name: CapabilityProofName, opts: CapabilityProofOptions = {}): void {
  if (SENT.has(name)) return;
  SENT.add(name);
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const event = {
    event_type: name,
    session_id: opts.sessionId ?? readSessionId(),
    ts: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
  const body = JSON.stringify({ events: [event] });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(endpoint, body)) return;
  if (typeof fetch === 'undefined') return;
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function resetCapabilityProofMemoryForTests(): void {
  SENT.clear();
}

function readSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const w = window as Window & { __shippieSessionId?: string };
  if (w.__shippieSessionId) return w.__shippieSessionId;
  const id = `s-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  w.__shippieSessionId = id;
  return id;
}
