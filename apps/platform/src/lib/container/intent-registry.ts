/**
 * Container — cross-app intent registry.
 *
 * Aggregates installed apps' declared `crossAppIntents.provides` and
 * `crossAppIntents.consumes` so a consumer asking for intent X can be
 * routed to a matching provider.
 *
 * Pure data structure. Bridge handlers (in `bridge-handlers.ts`) do the
 * permission gating and data fetching; this module just answers "who
 * provides X?" / "who consumes X?".
 *
 * Multiple providers per intent are allowed. v1 strategy: caller picks
 * the first match; future iterations add a user picker UI.
 */

import type { ContainerApp } from './state';

export interface IntentRegistration {
  intent: string;
  appId: string;
  appSlug: string;
  appName: string;
}

export interface IntentRegistry {
  providersFor(intent: string): IntentRegistration[];
  consumersFor(intent: string): IntentRegistration[];
  refresh(apps: ContainerApp[]): void;
  /** All declared intents — useful for the dashboard surface. */
  allIntents(): { providers: string[]; consumers: string[] };
}

export function createIntentRegistry(): IntentRegistry {
  const providers = new Map<string, IntentRegistration[]>();
  const consumers = new Map<string, IntentRegistration[]>();

  const indexFor = (
    map: Map<string, IntentRegistration[]>,
    intents: readonly string[] | undefined,
    app: ContainerApp,
  ): void => {
    if (!intents) return;
    for (const intent of intents) {
      if (typeof intent !== 'string' || intent.length === 0) continue;
      const list = map.get(intent) ?? [];
      list.push({
        intent,
        appId: app.id,
        appSlug: app.slug,
        appName: app.name,
      });
      map.set(intent, list);
    }
  };

  return {
    providersFor: (intent) => providers.get(intent) ?? [],
    consumersFor: (intent) => consumers.get(intent) ?? [],
    refresh: (apps) => {
      providers.clear();
      consumers.clear();
      for (const app of apps) {
        const grants = app.permissions.capabilities.crossAppIntents;
        indexFor(providers, grants?.provides, app);
        indexFor(consumers, grants?.consumes, app);
      }
    },
    allIntents: () => ({
      providers: [...providers.keys()].sort(),
      consumers: [...consumers.keys()].sort(),
    }),
  };
}

// ---------------------------------------------------------------------------
// Permission grants — keyed by (consumer, intent) NOT (consumer, provider).
//
// One prompt per intent that a consumer declared. Once granted, any
// provider firing that intent reaches the consumer. New providers don't
// re-prompt the user — the user already opted-in to the intent surface.
//
// Stored locally in the container state, never on Shippie's edge.
// ---------------------------------------------------------------------------

export type IntentGrants = Record<string, Record<string, boolean>>;

export function isIntentGranted(
  grants: IntentGrants,
  consumerAppId: string,
  intent: string,
): boolean {
  return Boolean(grants[consumerAppId]?.[intent]);
}

export function grantIntent(
  grants: IntentGrants,
  consumerAppId: string,
  intent: string,
): IntentGrants {
  return {
    ...grants,
    [consumerAppId]: {
      ...(grants[consumerAppId] ?? {}),
      [intent]: true,
    },
  };
}

export function revokeIntent(
  grants: IntentGrants,
  consumerAppId: string,
  intent: string,
): IntentGrants {
  const consumerGrants = { ...(grants[consumerAppId] ?? {}) };
  delete consumerGrants[intent];
  return { ...grants, [consumerAppId]: consumerGrants };
}

export function removeAppIntentGrants(grants: IntentGrants, appId: string): IntentGrants {
  const next: IntentGrants = {};
  for (const [consumerId, intentGrants] of Object.entries(grants)) {
    if (consumerId === appId) continue;
    const filtered = Object.fromEntries(
      Object.entries(intentGrants).filter(([, granted]) => granted),
    );
    if (Object.keys(filtered).length > 0) {
      next[consumerId] = filtered;
    }
  }
  return next;
}
