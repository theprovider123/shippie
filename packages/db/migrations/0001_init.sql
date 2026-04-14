-- =====================================================================
-- Shippie — Migration 0001_init
-- =====================================================================
-- Lays down the core tables for Week 1 of the v6 build plan.
-- Subsequent migrations add: oauth + sessions, functions + business,
-- ship to stores, ios verification, feedback + moderation, analytics.
--
-- Spec references throughout: docs/specs/shippie-implementation-plan-v6.md
-- =====================================================================

create extension if not exists "pg_trgm";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Users  (spec §18.1)
--
-- `name` and `image` mirror Auth.js v5 + OAuth conventions
-- (vs spec's display_name / avatar_url) so the Drizzle adapter can use
-- this table directly without a separate identity store.
--
-- `username` is nullable — Auth.js creates user rows at first sign-in
-- before our onboarding flow claims a username.
-- ---------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  email_verified timestamptz,
  github_id text unique,
  google_id text unique,
  apple_id text unique,
  username text unique,
  name text,
  image text,
  bio text,
  verified_maker boolean default false not null,
  verification_source text,
  first_deploy_at timestamptz,
  first_deploy_duration_ms integer,
  first_deploy_app_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index users_email_idx on users (email);
create unique index users_username_unique_idx on users (username) where username is not null;

-- ---------------------------------------------------------------------
-- Organizations  (spec §15.1, §18.8)
-- ---------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  plan text default 'free' not null,
  billing_customer_id text,
  verified_business boolean default false not null,
  verified_at timestamptz,
  verified_domain text,
  support_email text,
  privacy_policy_url text,
  terms_url text,
  data_residency text default 'eu' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table organization_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- Roles: owner | admin | developer | viewer | billing_manager
  role text not null check (role in (
    'owner', 'admin', 'developer', 'viewer', 'billing_manager'
  )),
  invited_by uuid references users(id),
  joined_at timestamptz default now() not null,
  primary key (org_id, user_id)
);

create table organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references users(id),
  created_at timestamptz default now() not null
);
create index organization_invites_org_idx on organization_invites (org_id);

-- ---------------------------------------------------------------------
-- Audit log  (append-only — no UPDATE/DELETE grants; spec §15.1)
-- ---------------------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz default now() not null
);
create index audit_log_org_created_idx on audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Reserved slugs  (spec §18.2)
-- Seeded with system + brand-guard names; expand at runtime via admin.
-- ---------------------------------------------------------------------
create table reserved_slugs (
  slug text primary key,
  reason text not null,
  created_at timestamptz default now() not null
);

insert into reserved_slugs (slug, reason) values
  -- System
  ('shippie', 'system'), ('www', 'system'), ('api', 'system'), ('cdn', 'system'),
  ('admin', 'system'), ('mail', 'system'), ('docs', 'system'), ('help', 'system'),
  ('status', 'system'), ('blog', 'system'), ('about', 'system'), ('app', 'system'),
  ('apps', 'system'), ('trust', 'system'), ('dashboard', 'system'), ('security', 'system'),
  ('support', 'system'), ('pricing', 'system'), ('login', 'system'), ('signup', 'system'),
  ('signin', 'system'), ('logout', 'system'), ('oauth', 'system'), ('auth', 'system'),
  ('webhooks', 'system'), ('webhook', 'system'), ('cron', 'system'), ('internal', 'system'),
  ('preview', 'system'), ('staging', 'system'), ('test', 'system'), ('new', 'system'),
  -- Brand guard (expand over time)
  ('apple', 'brand'), ('google', 'brand'), ('microsoft', 'brand'),
  ('amazon', 'brand'), ('meta', 'brand'), ('facebook', 'brand'),
  ('instagram', 'brand'), ('twitter', 'brand'), ('tiktok', 'brand'),
  ('openai', 'brand'), ('anthropic', 'brand'), ('stripe', 'brand'),
  ('github', 'brand'), ('vercel', 'brand'), ('cloudflare', 'brand');

-- ---------------------------------------------------------------------
-- Apps  (spec §18.2)
-- ---------------------------------------------------------------------
create table apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,
  type text not null check (type in ('app', 'web_app', 'website')),
  category text not null,
  icon_url text,
  theme_color text default '#000000' not null,
  background_color text default '#ffffff' not null,

  github_repo text,
  github_branch text default 'main' not null,
  github_installation_id bigint,
  github_verified boolean default false not null,
  source_type text not null check (source_type in ('github', 'zip')),

  conflict_policy text default 'shippie' not null
    check (conflict_policy in ('shippie', 'merge', 'own')),

  maker_id uuid not null references users(id),
  organization_id uuid references organizations(id) on delete cascade,
  visibility_scope text default 'public' not null
    check (visibility_scope in ('public', 'unlisted', 'private_org', 'private_link')),
  is_archived boolean default false not null,
  takedown_reason text,

  -- Deploy pointers (derived, maintained by trigger)
  latest_deploy_id uuid,
  latest_deploy_status text,
  active_deploy_id uuid,
  preview_deploy_id uuid,

  -- Denormalized counters
  upvote_count integer default 0 not null,
  comment_count integer default 0 not null,
  install_count integer default 0 not null,
  active_users_30d integer default 0 not null,
  feedback_open_count integer default 0 not null,

  -- Ranking scores
  ranking_score_app double precision default 0 not null,
  ranking_score_web_app double precision default 0 not null,
  ranking_score_website double precision default 0 not null,

  -- Native readiness
  native_readiness_score integer default 0 not null,
  compatibility_score integer default 0 not null,
  native_readiness_report jsonb,
  best_on text check (best_on in ('mobile', 'desktop', 'any')),
  quick_ship_slo_hit boolean,

  -- Business / compliance surfaces
  support_email text,
  privacy_policy_url text,
  terms_url text,
  data_residency text default 'eu' not null,
  screenshot_urls text[],

  first_published_at timestamptz,
  last_deployed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Full-text + fuzzy search
alter table apps add column fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) stored;

create index apps_fts_idx on apps using gin (fts);
create index apps_trgm_idx on apps using gin (name gin_trgm_ops);
create index apps_slug_active_idx on apps (slug);
create index apps_maker_idx on apps (maker_id);
create index apps_org_idx on apps (organization_id);
create index apps_type_visibility_idx on apps (type, visibility_scope);

-- App permissions (mirrors shippie.json.permissions)
create table app_permissions (
  app_id uuid primary key references apps(id) on delete cascade,
  auth boolean default false not null,
  storage text default 'none' not null check (storage in ('none', 'r', 'rw')),
  files boolean default false not null,
  notifications boolean default false not null,
  analytics boolean default true not null,
  external_network boolean default false not null,
  allowed_connect_domains text[] default array[]::text[] not null,
  native_bridge_features text[] default array[]::text[] not null,
  updated_at timestamptz default now() not null
);

-- ---------------------------------------------------------------------
-- Deploys  (spec §10, §18.3)
-- ---------------------------------------------------------------------
create table deploys (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  version integer not null,
  commit_sha text,
  source_type text not null,
  shippie_json jsonb,
  changelog text,
  -- 'building' | 'needs_secrets' | 'success' | 'failed' (Fix v5.1.1 D)
  status text default 'building' not null check (status in (
    'building', 'needs_secrets', 'success', 'failed'
  )),
  build_log text,
  preflight_status text,
  preflight_report jsonb,
  autopackaging_status text,
  autopackaging_report jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz default now() not null,
  completed_at timestamptz,
  created_by uuid references users(id),
  unique (app_id, version)
);
create index deploys_app_created_idx on deploys (app_id, created_at desc);

create table deploy_artifacts (
  id uuid primary key default gen_random_uuid(),
  deploy_id uuid not null references deploys(id) on delete cascade,
  r2_prefix text not null,
  file_count integer not null,
  total_bytes bigint not null,
  manifest jsonb not null,
  created_at timestamptz default now() not null
);
create index deploy_artifacts_deploy_idx on deploy_artifacts (deploy_id);

-- ---------------------------------------------------------------------
-- FK back-references for apps.{latest,active,preview}_deploy_id
-- ---------------------------------------------------------------------
alter table apps
  add constraint apps_latest_deploy_fk
    foreign key (latest_deploy_id) references deploys(id) on delete set null;

alter table apps
  add constraint apps_active_deploy_fk
    foreign key (active_deploy_id) references deploys(id) on delete set null;

alter table apps
  add constraint apps_preview_deploy_fk
    foreign key (preview_deploy_id) references deploys(id) on delete set null;

-- ---------------------------------------------------------------------
-- sync_app_latest_deploy trigger  (Fix v5.1.5 Q — same-row retry safe)
-- ---------------------------------------------------------------------
-- Maintains apps.latest_deploy_id / apps.latest_deploy_status as a cache
-- of the newest deploys row. The predicate handles three cases:
--   (1) app has no latest deploy yet
--   (2) the incoming row IS the current latest (status transition on same row)
--   (3) the incoming row's version is >= the current latest version
-- Case (2) is critical for needs_secrets → building → success transitions
-- on the same deploy row (Fix v5.1.1 D + v5.1.5 Q).
--
-- Spec v6 §18.3.
-- ---------------------------------------------------------------------
create or replace function sync_app_latest_deploy() returns trigger as $$
declare
  current_latest_version integer;
begin
  select version into current_latest_version
    from deploys
   where id = (select latest_deploy_id from apps where id = NEW.app_id);

  update apps
     set latest_deploy_id     = NEW.id,
         latest_deploy_status = NEW.status,
         updated_at           = now()
   where id = NEW.app_id
     and (
       latest_deploy_id is null
       or latest_deploy_id = NEW.id
       or coalesce(current_latest_version, -1) <= NEW.version
     );

  return NEW;
end $$ language plpgsql;

create trigger deploys_sync_app_latest
  after insert or update of status on deploys
  for each row execute function sync_app_latest_deploy();

-- ---------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end $$ language plpgsql;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create trigger apps_set_updated_at
  before update on apps
  for each row execute function set_updated_at();

create trigger app_permissions_set_updated_at
  before update on app_permissions
  for each row execute function set_updated_at();
