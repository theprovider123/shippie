/**
 * P1A.3 — `data.transferDrop` registry + grants.
 *
 * Mirrors `intent-registry.ts`, but keyed by transfer kind instead of
 * intent name. A destination iframe declares
 * `acceptsTransfer.kinds: ['recipe', ...]`; this module answers
 * "who accepts kind X?" so the source can light up overlays only on
 * matching iframes.
 *
 * Grants are scoped per (sourceAppId, targetAppId) pair — different
 * from intent grants which are per (consumer, intent). This is
 * deliberate: a transfer is a directed action between two specific
 * apps, and the user's mental model is "Recipe Saver can drop into
 * Meal Planner", not "Recipe Saver can send `recipe`s to anyone who
 * accepts them".
 */

import type { ContainerApp } from './state';

export interface TransferRegistration {
  kind: string;
  appId: string;
  appSlug: string;
  appName: string;
}

export interface TransferRegistry {
  acceptorsFor(kind: string): TransferRegistration[];
  refresh(apps: readonly ContainerApp[]): void;
  /** All declared kinds — for dashboard introspection. */
  allKinds(): string[];
}

export function createTransferRegistry(): TransferRegistry {
  const acceptors = new Map<string, TransferRegistration[]>();

  return {
    acceptorsFor: (kind) => acceptors.get(kind) ?? [],
    refresh: (apps) => {
      acceptors.clear();
      for (const app of apps) {
        const declared = app.permissions.capabilities.acceptsTransfer?.kinds;
        if (!declared) continue;
        for (const kind of declared) {
          if (typeof kind !== 'string' || kind.length === 0) continue;
          const list = acceptors.get(kind) ?? [];
          list.push({
            kind,
            appId: app.id,
            appSlug: app.slug,
            appName: app.name,
          });
          acceptors.set(kind, list);
        }
      }
    },
    allKinds: () => [...acceptors.keys()].sort(),
  };
}

// ---------------------------------------------------------------------------
// Per-(source, target) grants. One prompt the first time a source app
// commits a transfer at a specific target; subsequent commits flow
// through silently. Revocation removes the grant.
// ---------------------------------------------------------------------------

export type TransferGrants = Record<string, Record<string, boolean>>;

export function isTransferGranted(
  grants: TransferGrants,
  sourceAppId: string,
  targetAppId: string,
): boolean {
  return Boolean(grants[sourceAppId]?.[targetAppId]);
}

export function grantTransfer(
  grants: TransferGrants,
  sourceAppId: string,
  targetAppId: string,
): TransferGrants {
  return {
    ...grants,
    [sourceAppId]: {
      ...(grants[sourceAppId] ?? {}),
      [targetAppId]: true,
    },
  };
}

export function revokeTransfer(
  grants: TransferGrants,
  sourceAppId: string,
  targetAppId: string,
): TransferGrants {
  const sourceGrants = { ...(grants[sourceAppId] ?? {}) };
  delete sourceGrants[targetAppId];
  return { ...grants, [sourceAppId]: sourceGrants };
}

export function removeAppTransferGrants(
  grants: TransferGrants,
  appId: string,
): TransferGrants {
  const next: TransferGrants = {};
  for (const [sourceId, targetMap] of Object.entries(grants)) {
    if (sourceId === appId) continue;
    const filtered = Object.fromEntries(
      Object.entries(targetMap).filter(([targetId, granted]) => granted && targetId !== appId),
    );
    if (Object.keys(filtered).length > 0) {
      next[sourceId] = filtered;
    }
  }
  return next;
}
