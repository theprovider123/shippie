/**
 * App Kind types — Local / Connected / Cloud vocabulary.
 *
 * Definitions, proof rules, and conflict handling live in
 * `docs/app-kinds.md`. The detection half (everything except
 * `declaredKind`, `publicKind`, `publicKindStatus`) is produced by the
 * @shippie/analyse package's `classifyKind` and stored per deploy.
 *
 * Structural typing on consumer code keeps this module decoupled from
 * the analyser, matching the pattern in `marketplace/capability-badges.ts`.
 */

export type AppKind = 'local' | 'connected' | 'cloud';

export type PublicKindStatus =
  | 'estimated'
  | 'verifying'
  | 'confirmed'
  | 'disputed';

export interface AppKindLocalization {
  candidate: boolean;
  blockers: string[];
  supportedTransforms: string[];
}

/**
 * Detection-only slice. Output of @shippie/analyse's classifier. Stable
 * shape; the analyser never knows about maker declaration or proof.
 */
export interface AppKindDetection {
  detectedKind: AppKind;
  confidence: number;
  reasons: string[];
  externalDomains: string[];
  backendProviders: string[];
  localSignals: string[];
  localization: AppKindLocalization;
}

/**
 * Full per-deploy profile. Stored at `apps:{slug}:kind-profile` in KV
 * and as `deploys.kind_profile_json` in D1 (Phase 0b migration).
 *
 * `publicKind` + `publicKindStatus` are denormalized from
 * `detectedKind` + proof event aggregation so the UI doesn't re-derive
 * nuance everywhere.
 */
export interface AppKindProfile extends AppKindDetection {
  declaredKind?: AppKind;
  publicKind: AppKind;
  publicKindStatus: PublicKindStatus;
}

/** Build a fresh profile from a detection result. Status starts at
 *  `estimated`; proof event aggregation upgrades to `verifying` →
 *  `confirmed` (or demotes on personal-data leak). */
export function profileFromDetection(
  detection: AppKindDetection,
  declaredKind?: AppKind,
): AppKindProfile {
  return {
    ...detection,
    declaredKind,
    publicKind: detection.detectedKind,
    publicKindStatus: 'estimated',
  };
}

/** Map a profile to the badge label per the copy bank in
 *  `docs/app-kinds.md`. */
export function publicKindLabel(
  kind: AppKind,
  status: PublicKindStatus,
): string {
  const k = kind === 'local' ? 'Local' : kind === 'connected' ? 'Connected' : 'Cloud';
  if (status === 'confirmed') return k;
  if (status === 'disputed') return `${k} — under review`;
  if (kind === 'cloud') return k;
  return `${k} — verifying`;
}
