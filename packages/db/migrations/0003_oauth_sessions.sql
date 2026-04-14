-- =====================================================================
-- Shippie — Migration 0003_oauth_sessions
-- =====================================================================
-- Adds the runtime-plane auth tables and multi-tenant SDK storage:
--
--   - oauth_clients            per-app OAuth client registration
--   - oauth_consents           user-to-app consent records
--   - oauth_authorization_codes short-lived PKCE flow state
--   - app_sessions             opaque-handle per-app sessions
--   - app_data                 multi-tenant key/value store (RLS)
--   - app_files                per-user R2 file metadata (RLS)
--   - push_subscriptions       Web Push endpoints (Phase 2)
--
-- These sit alongside Auth.js's platform-side accounts/sessions/
-- verification_tokens. Do not confuse them:
--
--   sessions               → shippie.app platform session (Auth.js)
--   app_sessions           → {slug}.shippie.app per-app session (opaque handle)
--
-- Spec v6 §6 (auth architecture), §18.4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- oauth_clients  (per-app OAuth 2.0 client registration)
-- ---------------------------------------------------------------------
create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  client_id text unique not null,
  client_secret_hash text,
  redirect_uris text[] not null,
  allowed_scopes text[] not null,
  created_at timestamptz default now() not null
);
create index oauth_clients_app_idx on oauth_clients (app_id);

-- ---------------------------------------------------------------------
-- oauth_consents  (one row per user + app)
-- ---------------------------------------------------------------------
create table oauth_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  scope text[] not null,
  consented_at timestamptz default now() not null,
  revoked_at timestamptz,
  unique (user_id, app_id)
);
create index oauth_consents_user_idx on oauth_consents (user_id);
create index oauth_consents_app_idx on oauth_consents (app_id);

-- ---------------------------------------------------------------------
-- oauth_authorization_codes  (60-second PKCE codes)
-- ---------------------------------------------------------------------
create table oauth_authorization_codes (
  code text primary key,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text[] not null,
  expires_at timestamptz not null,
  used boolean default false not null
);
create index oauth_authorization_codes_expires_idx on oauth_authorization_codes (expires_at);

-- ---------------------------------------------------------------------
-- app_sessions  (Fix v5.1.1 opaque-handle model)
--
-- Cookie carries ONLY a random handle. handle_hash is SHA-256 of the
-- handle. All claims live in this row. Per-device by (ua, ip_hash,
-- device_fingerprint).
--
-- Spec v6 §6.1, §13.7 (revocation).
-- ---------------------------------------------------------------------
create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  handle_hash text unique not null,
  user_id uuid not null references users(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  scope text[] not null,
  user_agent text,
  ip_hash text,
  device_fingerprint text,
  created_at timestamptz default now() not null,
  last_seen_at timestamptz default now() not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_from uuid references app_sessions(id)
);
create index app_sessions_user_app_active_idx
  on app_sessions (user_id, app_id)
  where revoked_at is null;
create index app_sessions_handle_active_idx
  on app_sessions (handle_hash)
  where revoked_at is null;
create index app_sessions_expires_idx on app_sessions (expires_at);

-- ---------------------------------------------------------------------
-- app_data  (SDK storage)
--
-- RLS policies use two Postgres session vars set by the platform API on
-- every request:
--
--   select set_config('app.current_app_id', '<uuid>', true);
--   select set_config('app.current_user_id', '<uuid>', true);
--
-- The `select` RLS policy allows own + public; the `write` policy is
-- strict (own only) and uses WITH CHECK so neither app_id nor user_id
-- can be spoofed on insert/update.
--
-- Spec v6 §18.5, Fix v5.1.1 RLS.
-- ---------------------------------------------------------------------
create table app_data (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  collection text not null,
  key text not null,
  data jsonb not null,
  is_public boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Partial unique indexes: private and public rows cannot collide
create unique index app_data_private_unique
  on app_data (app_id, user_id, collection, key)
  where is_public = false;

create unique index app_data_public_unique
  on app_data (app_id, collection, key)
  where is_public = true;

create index app_data_app_user_idx on app_data (app_id, user_id, collection);
create index app_data_public_app_idx on app_data (app_id, collection) where is_public = true;

alter table app_data enable row level security;

create policy app_data_select on app_data
  for select using (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and (
      user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      or is_public = true
    )
  );

create policy app_data_insert on app_data
  for insert
  with check (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy app_data_update on app_data
  for update
  using (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy app_data_delete on app_data
  for delete using (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create trigger app_data_set_updated_at
  before update on app_data
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- app_files  (R2 file metadata, per-user)
-- ---------------------------------------------------------------------
create table app_files (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  r2_key text unique not null,
  size_bytes integer not null,
  mime_type text not null,
  created_at timestamptz default now() not null
);
create index app_files_app_user_idx on app_files (app_id, user_id);

alter table app_files enable row level security;

create policy app_files_select on app_files
  for select using (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

create policy app_files_write on app_files
  for all
  using (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    app_id = nullif(current_setting('app.current_app_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------
-- push_subscriptions  (Web Push endpoints, Phase 2 but schema ready)
-- ---------------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now() not null,
  unique (user_id, app_id, endpoint)
);
create index push_subscriptions_user_app_idx on push_subscriptions (user_id, app_id);
