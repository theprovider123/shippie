-- =====================================================================
-- Shippie — Migration 0004_ship_to_stores
-- =====================================================================
-- Ship-to-Stores + compliance + iOS verification tables.
--
--   - store_account_credentials  polymorphic user|org reusable credentials
--                                (ASC API keys, Play service accounts)
--   - app_signing_configs        per-app, per-platform signing with
--                                exactly-one-active partial unique index
--   - ios_verify_kits            one-time kits for `shippie ios-verify`
--   - ios_signing_verifications  successful/failed verification records
--   - native_bundles             built iOS/Android submission artifacts
--   - compliance_checks          compliance runner output
--   - privacy_manifests          iOS + Android privacy disclosures
--   - account_deletion_requests  14-day grace period tracking
--   - app_external_domains       declared + discovered outbound targets
--
-- Includes the invalidate_verifications_on_config_change trigger
-- (Fix v5.1.4 P) that invalidates iOS verifications whenever any
-- signing-identity field changes in place on an active row.
--
-- Spec v6 §12, §13, §14, §18.7.
-- =====================================================================

-- ---------------------------------------------------------------------
-- store_account_credentials  (polymorphic — Fix v5.1.1 A / v5.1.2 D)
-- ---------------------------------------------------------------------
create table store_account_credentials (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'organization')),
  subject_id uuid not null,
  platform text not null check (platform in ('ios', 'android')),
  credential_type text not null check (credential_type in (
    'asc_api_key',
    'play_service_account'
  )),
  label text not null,
  encrypted_value text not null,
  metadata jsonb,
  created_at timestamptz default now() not null,
  rotated_at timestamptz,
  unique (subject_type, subject_id, platform, credential_type, label)
);
create index sac_subject_idx on store_account_credentials (subject_type, subject_id, platform);

alter table store_account_credentials enable row level security;

create policy sac_user_rw on store_account_credentials
  for all
  using (
    subject_type = 'user'
    and subject_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    subject_type = 'user'
    and subject_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy sac_org_rw on store_account_credentials
  for all
  using (
    subject_type = 'organization'
    and exists (
      select 1
        from organization_members om
       where om.org_id = store_account_credentials.subject_id
         and om.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
         and om.role in ('owner', 'admin', 'billing_manager')
    )
  )
  with check (
    subject_type = 'organization'
    and exists (
      select 1
        from organization_members om
       where om.org_id = store_account_credentials.subject_id
         and om.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
         and om.role in ('owner', 'admin', 'billing_manager')
    )
  );

-- ---------------------------------------------------------------------
-- app_signing_configs  (Fix v5.1.2 G rotation-safe)
-- ---------------------------------------------------------------------
create table app_signing_configs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  account_credential_id uuid references store_account_credentials(id) on delete restrict,
  is_active boolean default true not null,
  version integer not null default 1,

  -- iOS
  ios_bundle_id text,
  ios_team_id text,
  ios_signing_mode text check (ios_signing_mode in ('automatic', 'manual')),
  ios_certificate_r2_key text,
  ios_certificate_password_encrypted text,
  ios_provisioning_profile_r2_key text,
  ios_entitlements_plist_r2_key text,

  -- Android
  android_package text,
  android_keystore_r2_key text,
  android_keystore_password_encrypted text,
  android_key_alias text,
  android_key_password_encrypted text,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  created_by uuid references users(id)
);

-- Exactly one active per (app, platform) at any time
create unique index app_signing_configs_active_unique
  on app_signing_configs (app_id, platform)
  where is_active = true;

create index app_signing_configs_app_platform_idx on app_signing_configs (app_id, platform);

create trigger app_signing_configs_set_updated_at
  before update on app_signing_configs
  for each row execute function set_updated_at();

alter table app_signing_configs enable row level security;

-- Fix v5.1.2 F: developer IS in both USING and WITH CHECK
create policy asc_rw on app_signing_configs
  for all
  using (
    exists (
      select 1 from apps a
       where a.id = app_signing_configs.app_id
         and (
           (a.organization_id is null
             and a.maker_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
           or (a.organization_id is not null
             and exists (
               select 1 from organization_members om
                where om.org_id = a.organization_id
                  and om.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
                  and om.role in ('owner', 'admin', 'billing_manager', 'developer')
             ))
         )
    )
  )
  with check (
    exists (
      select 1 from apps a
       where a.id = app_signing_configs.app_id
         and (
           (a.organization_id is null
             and a.maker_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
           or (a.organization_id is not null
             and exists (
               select 1 from organization_members om
                where om.org_id = a.organization_id
                  and om.user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
                  and om.role in ('owner', 'admin', 'billing_manager', 'developer')
             ))
         )
    )
  );

-- ---------------------------------------------------------------------
-- ios_verify_kits  (Fix v5.1.5 R one-shot, v5.1.5 Q row-lock-safe)
-- ---------------------------------------------------------------------
create table ios_verify_kits (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid not null references app_signing_configs(id) on delete cascade,
  nonce text unique not null,
  secret text not null,
  kit_version integer not null,
  issued_to uuid not null references users(id),
  issued_at timestamptz default now() not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumption_outcome text check (consumption_outcome in ('accepted', 'rejected')),
  rejection_reason text
);
create index ios_verify_kits_app_unused_idx
  on ios_verify_kits (app_id, signing_config_id)
  where consumed_at is null;

-- ---------------------------------------------------------------------
-- ios_signing_verifications  (Fix v5.1.3 J active-config bound)
-- ---------------------------------------------------------------------
create table ios_signing_verifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  signing_config_id uuid not null references app_signing_configs(id) on delete cascade,
  nonce text unique not null,
  succeeded_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  xcode_version text,
  macos_version text,
  log_r2_key text,
  verify_kit_version integer not null,
  invalidated_at timestamptz,
  invalidated_reason text
);
create index ios_signing_verifications_active_idx
  on ios_signing_verifications (app_id, signing_config_id, succeeded_at desc)
  where invalidated_at is null;

-- ---------------------------------------------------------------------
-- Trigger: invalidate verifications on in-place config edits
-- (Fix v5.1.4 P)
-- ---------------------------------------------------------------------
create or replace function invalidate_verifications_on_config_change()
returns trigger as $$
begin
  if NEW.platform <> 'ios' then
    return NEW;
  end if;

  if (
       coalesce(OLD.ios_team_id, '')
         is distinct from coalesce(NEW.ios_team_id, '')
    or coalesce(OLD.ios_bundle_id, '')
         is distinct from coalesce(NEW.ios_bundle_id, '')
    or coalesce(OLD.ios_signing_mode, '')
         is distinct from coalesce(NEW.ios_signing_mode, '')
    or coalesce(OLD.ios_certificate_r2_key, '')
         is distinct from coalesce(NEW.ios_certificate_r2_key, '')
    or coalesce(OLD.ios_provisioning_profile_r2_key, '')
         is distinct from coalesce(NEW.ios_provisioning_profile_r2_key, '')
    or coalesce(OLD.ios_entitlements_plist_r2_key, '')
         is distinct from coalesce(NEW.ios_entitlements_plist_r2_key, '')
  ) then
    update ios_signing_verifications
       set invalidated_at     = now(),
           invalidated_reason = format(
             'signing config %s updated in place (version %s)',
             NEW.id, NEW.version
           )
     where signing_config_id = NEW.id
       and invalidated_at is null;
  end if;

  return NEW;
end $$ language plpgsql;

create trigger app_signing_configs_invalidate_verifications
  after update on app_signing_configs
  for each row execute function invalidate_verifications_on_config_change();

-- ---------------------------------------------------------------------
-- native_bundles  (built store submission artifacts)
-- ---------------------------------------------------------------------
create table native_bundles (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  wrapper text not null check (wrapper in ('capacitor', 'twa')),
  version text not null,
  build_number integer not null,
  bundle_id text not null,
  signed_artifact_r2_key text,
  readiness_score integer,
  readiness_report jsonb,
  native_bridge_features text[],
  submission_status text default 'draft' not null check (submission_status in (
    'draft', 'building', 'ready', 'submitted', 'in_review',
    'approved', 'rejected', 'live', 'removed'
  )),
  rejection_reason text,
  store_connect_id text,
  play_console_id text,
  testflight_group text,
  play_track text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now() not null
);
create index native_bundles_app_platform_idx on native_bundles (app_id, platform);
create index native_bundles_status_idx on native_bundles (submission_status);

-- ---------------------------------------------------------------------
-- compliance_checks  (Fix v5.1.3 M includes 'needs_action')
-- ---------------------------------------------------------------------
create table compliance_checks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'both', 'web')),
  check_type text not null,
  status text not null check (status in (
    'passed',
    'failed',
    'pending',
    'not_applicable',
    'needs_action'
  )),
  evidence jsonb,
  checked_at timestamptz default now() not null
);
create index compliance_checks_app_platform_idx
  on compliance_checks (app_id, platform);
create index compliance_checks_app_type_idx
  on compliance_checks (app_id, check_type);

-- ---------------------------------------------------------------------
-- privacy_manifests  (iOS PrivacyInfo + Android Data Safety)
-- ---------------------------------------------------------------------
create table privacy_manifests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid references deploys(id) on delete set null,
  collected_data jsonb not null,
  accessed_apis jsonb not null,
  tracking_enabled boolean default false not null,
  tracking_domains text[],
  data_safety_android jsonb not null,
  generated_at timestamptz default now() not null,
  source text
);
create index privacy_manifests_app_idx on privacy_manifests (app_id, generated_at desc);

-- ---------------------------------------------------------------------
-- account_deletion_requests  (14-day grace period tracking)
-- ---------------------------------------------------------------------
create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  requested_at timestamptz default now() not null,
  grace_period_ends_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz,
  unique (app_id, user_id)
);
comment on table account_deletion_requests is
  'Populated only when an app retains user data. Stateless apps never have rows here. Compliance runner enforces applicability via shippie.json + static analysis (Fix v5.1.2 I).';

-- ---------------------------------------------------------------------
-- app_external_domains  (declared + discovered outbound targets)
-- ---------------------------------------------------------------------
create table app_external_domains (
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid not null references deploys(id) on delete cascade,
  domain text not null,
  source text not null,                    -- 'html' | 'js' | 'function' | 'manifest'
  allowed boolean not null,
  first_seen_at timestamptz default now() not null,
  primary key (app_id, deploy_id, domain)
);
