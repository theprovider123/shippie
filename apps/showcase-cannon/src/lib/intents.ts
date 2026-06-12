/**
 * Cross-app intent broadcasts. Inside the Shippie container these reach
 * sibling apps and /today via the bridge; standalone (subdomain or local
 * preview) the SDK no-ops, so callers never need to care where they run.
 */
import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk | null {
  if (sdk) return sdk;
  try {
    sdk = createShippieIframeSdk({ appId: 'app_cannon' });
  } catch {
    sdk = null;
  }
  return sdk;
}

function broadcast(intent: string, row: Record<string, unknown>): void {
  try {
    getSdk()?.intent.broadcast(intent, [row]);
  } catch {
    /* outside the container — nothing to tell */
  }
}

export function broadcastMatchStarting(matchId: string, opponent: string, kickoffUtc: string): void {
  broadcast('match-starting', { matchId, opponent, kickoffUtc, club: 'Arsenal' });
}

export function broadcastScoreUpdated(matchId: string, home: number, away: number, minute: number | null): void {
  broadcast('score-updated', { matchId, home, away, minute, club: 'Arsenal' });
}

export function broadcastFanReaction(matchId: string | null, kind: 'take' | 'gauge' | 'prediction'): void {
  broadcast('fan-reaction', { matchId, kind, at: new Date().toISOString() });
}
