/**
 * Minimal TypeScript representation of shippie.json v1.
 *
 * The full schema lives in docs/specs/shippie-implementation-plan-v6.md §4.
 * This file is the type contract for the runtime config consumer (deploy
 * pipeline, preflight, compliance runner).
 *
 * Validation happens via Zod in apps/web/lib/preflight; this file is the
 * shape only.
 */
import type { ProjectType } from './project-types.ts';
import type { ConflictPolicy } from './reserved-paths.ts';
import type { DeployMode, VisibilityScope } from './deploy-states.ts';

export type StoragePermission = 'none' | 'r' | 'rw';
export type SigningMode = 'automatic' | 'manual';

export interface ShippieJsonBuild {
  command: string;
  output: string;
  node?: string;
  root_directory?: string;
  env_build?: readonly string[];
  install_command?: string;
}

export interface ShippieJsonPwa {
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  orientation?: 'any' | 'portrait' | 'landscape';
  start_url?: string;
  scope?: string;
  conflict_policy?: ConflictPolicy;
  screenshots?: readonly string[];
}

export interface ShippieJsonSdk {
  /** "1.x" auto-patches; "1.2.3" pins. */
  version?: string;
  auto_inject?: boolean;
}

export interface ShippieJsonPermissions {
  auth?: boolean;
  storage?: StoragePermission;
  files?: boolean;
  notifications?: boolean;
  analytics?: boolean;
  external_network?: boolean;
  native_bridge?: readonly string[];
}

export interface ShippieJsonFunctionEnvVar {
  required: boolean;
  secret: boolean;
  scope?: 'client' | 'server';
}

export interface ShippieJsonFunctions {
  enabled: boolean;
  directory?: string;
  runtime?: 'workers';
  env?: Record<string, ShippieJsonFunctionEnvVar>;
}

export interface ShippieJsonListing {
  visibility?: VisibilityScope;
  featured_candidate?: boolean;
  require_consent_screen?: boolean;
}

export interface ShippieJsonFeedback {
  enabled?: boolean;
  types?: readonly ('comment' | 'bug' | 'request' | 'rating' | 'praise')[];
}

export interface ShippieJsonShipToStores {
  enabled: boolean;
  platforms?: readonly ('ios' | 'android')[];
  bundle_id?: string;
  version?: string;
  build_number?: number;
}

export interface ShippieJsonDistribution {
  ship_to_web?: boolean;
  ship_to_phone?: boolean;
  ship_to_stores?: ShippieJsonShipToStores;
}

export interface ShippieJsonNativeIos {
  deployment_target?: string;
  sign_in_with_apple?: boolean;
  encryption_exempt?: boolean;
}

export interface ShippieJsonNativeAndroid {
  min_sdk?: number;
  target_sdk?: number;
  play_billing?: boolean;
}

export interface ShippieJsonNative {
  wrapper?: 'capacitor' | 'twa' | 'auto';
  plugins?: readonly string[];
  ios?: ShippieJsonNativeIos;
  android?: ShippieJsonNativeAndroid;
}

export interface ShippieJsonStoreMetadata {
  short_description?: string;
  long_description?: string;
  keywords?: readonly string[];
  support_url?: string;
  privacy_url?: string;
  marketing_url?: string;
  age_rating?: string;
  primary_category?: string;
  secondary_category?: string;
  contains_ads?: boolean;
  uses_iap?: boolean;
  release_notes?: string;
}

export interface ShippieJsonAccountDeletion {
  enabled?: boolean;
  flow?: 'self_service' | 'email' | 'function';
  function?: string | null;
}

export interface ShippieJsonDataSafety {
  data_collected?: readonly string[];
  data_shared?: readonly string[];
  encrypted_in_transit?: boolean;
  encrypted_at_rest?: boolean;
  can_delete?: boolean;
}

export interface ShippieJsonCompliance {
  /** Explicit declaration. Auto-derived true if auth/storage/files set. */
  retains_user_data?: boolean;
  /** Must be explicit; SDK runtime enforces match. */
  identifiable_analytics?: boolean;
  account_deletion?: ShippieJsonAccountDeletion;
  data_safety?: ShippieJsonDataSafety;
}

export interface ShippieJson {
  $schema?: string;
  version: 1;
  slug?: string;
  type: ProjectType;
  name: string;
  tagline?: string;
  description?: string;
  category: string;
  icon?: string;
  theme_color?: string;
  background_color?: string;

  framework?: string;
  build?: ShippieJsonBuild;
  pwa?: ShippieJsonPwa;
  sdk?: ShippieJsonSdk;
  permissions?: ShippieJsonPermissions;
  allowed_connect_domains?: readonly string[];
  functions?: ShippieJsonFunctions;
  listing?: ShippieJsonListing;
  feedback?: ShippieJsonFeedback;
  deploy_mode?: DeployMode;
  auto_publish_on?: readonly string[];
  distribution?: ShippieJsonDistribution;
  native?: ShippieJsonNative;
  store_metadata?: ShippieJsonStoreMetadata;
  compliance?: ShippieJsonCompliance;
  env_schema?: Record<string, ShippieJsonFunctionEnvVar>;
}
