/**
 * Organization member roles.
 *
 * Authority asymmetry:
 *   - account credentials  → owner / admin / billing_manager only (billing-sensitive)
 *   - per-app signing config → owner / admin / billing_manager / developer
 *   - viewer → read-only dashboards, never credentials
 *
 * See spec v6 §15.2 and §18.7 for the RLS policies that enforce this.
 */
export const ORG_ROLES = ['owner', 'admin', 'developer', 'viewer', 'billing_manager'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Roles that may read or write reusable account-level credentials. */
export const ACCOUNT_CREDENTIAL_ROLES: readonly OrgRole[] = [
  'owner',
  'admin',
  'billing_manager',
];

/** Roles that may read or write per-app signing configs. */
export const APP_SIGNING_CONFIG_ROLES: readonly OrgRole[] = [
  'owner',
  'admin',
  'billing_manager',
  'developer',
];

export const canAccessAccountCredentials = (role: OrgRole): boolean =>
  ACCOUNT_CREDENTIAL_ROLES.includes(role);

export const canAccessAppSigningConfig = (role: OrgRole): boolean =>
  APP_SIGNING_CONFIG_ROLES.includes(role);
