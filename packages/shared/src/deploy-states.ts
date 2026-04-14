/**
 * Deploy state machine.
 *
 * State lives on `deploys.status` (per-version, source of truth).
 * App-level state is derived from `apps.active_deploy_id` and
 * `apps.latest_deploy_id` via the sync_app_latest_deploy trigger.
 *
 * See spec v6 §10.1 and §18.3.
 */
export const DEPLOY_STATUSES = [
  'building',
  'needs_secrets',
  'success',
  'failed',
] as const;
export type DeployStatus = (typeof DEPLOY_STATUSES)[number];

/**
 * Visibility modes. private_link is shareable via signed URL; private_org
 * checks org membership at the Worker.
 */
export const VISIBILITY_SCOPES = ['public', 'unlisted', 'private_org', 'private_link'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

/**
 * Quick Ship vs preview deploy modes.
 */
export const DEPLOY_MODES = ['quick_ship', 'preview', 'manual'] as const;
export type DeployMode = (typeof DEPLOY_MODES)[number];

/**
 * Source provenance.
 */
export const SOURCE_TYPES = ['github', 'zip'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
