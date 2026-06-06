// Reactions: one-tap banter on a mate's row. No text, no comments — just 🔥📞💀.
// A reaction lives for 24h, then fades. Stored on-device, keyed by entry uid.

export type ReactionKind = "fire" | "phone" | "skull";

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  fire: "🔥",
  phone: "📞",
  skull: "💀",
};

export const REACTION_ORDER: ReactionKind[] = ["fire", "phone", "skull"];

interface Reaction {
  kind: ReactionKind;
  at: number;
}

/** uid -> the reactions sitting on that person's row. */
export type ReactionStore = Record<string, Reaction[]>;

const TTL_MS = 24 * 3600_000;

/** Add (or refresh) a reaction on an entry. Same kind de-dupes to the newest time. */
export function addReaction(
  store: ReactionStore,
  uid: string,
  kind: ReactionKind,
  now: number,
): ReactionStore {
  const existing = (store[uid] ?? []).filter((r) => r.kind !== kind);
  return { ...store, [uid]: [...existing, { kind, at: now }] };
}

/** The reaction kinds currently active (within 24h) on an entry. */
export function activeReactions(
  store: ReactionStore,
  uid: string,
  now: number,
): ReactionKind[] {
  return (store[uid] ?? [])
    .filter((r) => now - r.at < TTL_MS)
    .map((r) => r.kind);
}

/** How many active reactions a person has received across the given uids. */
export function reactionsReceived(
  store: ReactionStore,
  uids: string[],
  now: number,
): number {
  return uids.reduce((sum, uid) => sum + activeReactions(store, uid, now).length, 0);
}
