/**
 * Share Sheet bus (Tranche 2).
 *
 * When a showcase calls `shippie.share({content, kinds})`, the container
 * picks installed apps that consume any of the requested intent kinds
 * and presents a chooser. After the user picks, the chosen app
 * receives the payload via the existing intent bus (`intent.consume`).
 *
 * For 5A+5B the wiring already moves intents between apps; this
 * module is the pure resolver that turns an outgoing share request +
 * the live intent registry into a presentable list of candidate
 * destinations.
 */

export interface ShareRequest {
  /** Intent kinds the source app can serve. */
  kinds: readonly string[];
  /** Free-form label the source app shows in confirm dialogs. */
  label?: string;
}

export interface ShareCandidate {
  appSlug: string;
  appName: string;
  kind: string;
}

export interface ShareAppEntry {
  slug: string;
  name: string;
  consumes: readonly string[];
}

/**
 * Resolve a share request into the set of candidate destination apps.
 *
 * Candidates appear once per (app, kind) pair so the chooser can show
 * "Add to Shopping List (recipe)" and "Add to Shopping List (pantry-low)"
 * as distinct rows when both kinds match.
 */
export function resolveShareCandidates(
  request: ShareRequest,
  installedApps: readonly ShareAppEntry[],
): ShareCandidate[] {
  const out: ShareCandidate[] = [];
  const wantedKinds = new Set(request.kinds.map((k) => k.toLowerCase()));
  for (const app of installedApps) {
    for (const consumed of app.consumes) {
      if (wantedKinds.has(consumed.toLowerCase())) {
        out.push({ appSlug: app.slug, appName: app.name, kind: consumed });
      }
    }
  }
  // Deterministic order: by app name asc, then by kind asc.
  out.sort((a, b) => {
    if (a.appName !== b.appName) return a.appName.localeCompare(b.appName);
    return a.kind.localeCompare(b.kind);
  });
  return out;
}

/**
 * Decide whether the system Share Sheet should appear at all.
 *
 * Returns false when there are zero candidates — the source app falls
 * back to its own UI. The bus does not surface "no apps available"
 * empty states; that's the caller's responsibility.
 */
export function shouldOfferShareSheet(candidates: readonly ShareCandidate[]): boolean {
  return candidates.length > 0;
}
