/**
 * Behavior delta between two versions of an app — the monitoring signal for
 * the benign-v1 → malicious-v2 supply-chain move. Updates stay INSTANT (no
 * gate); we just record what changed and surface high-delta updates from
 * popular apps to admins. Pure (no IO) so it's fully unit-testable.
 *
 * Shippie is open: a delta is informational, never a block. A new connect
 * domain or capability on an established app is the thing a human should
 * glance at, not something to forbid.
 */

export interface BehaviorProfile {
  /** Declared outbound hosts (allowed_connect_domains). */
  connectDomains: string[];
  externalNetwork: boolean;
  /** 'none' | 'r' | 'rw' */
  storage: string;
  /** Capability flags that are ON, e.g. ['auth','files','notifications']. */
  capabilities: string[];
  totalBytes: number;
  /** App kind: 'local' | 'connected' | 'cloud' (or null when unknown). */
  kind?: string | null;
}

export interface BehaviorDelta {
  score: number;
  additions: string[];
  /** Convenience flag for the admin feed; tune threshold in one place. */
  high: boolean;
}

/**
 * Build a BehaviorProfile from a deploy manifest + measured size. The profile
 * is persisted on the deploy row so the NEXT deploy can diff against it
 * directly (no re-reading artifacts). Loose manifest shape keeps this module
 * free of the ShippieJsonLite import.
 */
export function behaviorProfileFromManifest(
  manifest: {
    permissions?: {
      external_network?: boolean;
      auth?: boolean;
      storage?: string;
      files?: boolean;
      notifications?: boolean;
    };
    allowed_connect_domains?: string[];
  },
  opts: { totalBytes: number; kind?: string | null },
): BehaviorProfile {
  const p = manifest.permissions ?? {};
  const capabilities: string[] = [];
  if (p.auth) capabilities.push('auth');
  if (p.files) capabilities.push('files');
  if (p.notifications) capabilities.push('notifications');
  return {
    connectDomains: manifest.allowed_connect_domains ?? [],
    externalNetwork: p.external_network === true,
    storage: p.storage ?? 'none',
    capabilities,
    totalBytes: opts.totalBytes,
    kind: opts.kind ?? null,
  };
}

const HIGH_DELTA_THRESHOLD = 3;
const STORAGE_RANK: Record<string, number> = { none: 0, r: 1, rw: 2 };

function storageRank(s: string): number {
  return STORAGE_RANK[s] ?? 0;
}

/**
 * Compute the delta from `prev` to `next`. When `prev` is null (a first
 * publish, not an update) there is nothing to compare — returns an empty,
 * low delta.
 */
export function computeBehaviorDelta(
  prev: BehaviorProfile | null,
  next: BehaviorProfile,
): BehaviorDelta {
  if (!prev) return { score: 0, additions: [], high: false };

  const additions: string[] = [];
  let score = 0;

  const prevDomains = new Set(prev.connectDomains.map((d) => d.trim().toLowerCase()).filter(Boolean));
  for (const raw of next.connectDomains) {
    const d = raw.trim().toLowerCase();
    if (d && !prevDomains.has(d)) {
      additions.push(`new connect domain: ${d}`);
      score += 2;
    }
  }

  if (next.externalNetwork && !prev.externalNetwork) {
    additions.push('now requests external network access');
    score += 3;
  }

  if (storageRank(next.storage) > storageRank(prev.storage)) {
    additions.push(`storage escalated ${prev.storage || 'none'} → ${next.storage}`);
    score += 2;
  }

  const prevCaps = new Set(prev.capabilities);
  for (const cap of next.capabilities) {
    if (!prevCaps.has(cap)) {
      additions.push(`now requests capability: ${cap}`);
      score += 1;
    }
  }

  if (prev.totalBytes > 0 && next.totalBytes > prev.totalBytes * 2) {
    const factor = (next.totalBytes / prev.totalBytes).toFixed(1);
    additions.push(`bundle grew ${factor}× (${prev.totalBytes} → ${next.totalBytes} bytes)`);
    score += 1;
  }

  if (prev.kind && next.kind && prev.kind !== next.kind) {
    additions.push(`app kind changed ${prev.kind} → ${next.kind}`);
    score += 2;
  }

  return { score, additions, high: score >= HIGH_DELTA_THRESHOLD };
}
