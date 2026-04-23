-- Phase B — private apps + invite links (spec:
-- docs/superpowers/plans/2026-04-23-private-apps-and-invites.md Task 1)

-- Replace visibility_scope constraint. 0001_init.sql declared it with
-- ('public', 'unlisted', 'private_org', 'private_link'); collapse the two
-- private_* values into a single 'private' that the invite system gates.
-- Wrapped in DROP IF EXISTS so re-runs against fresh DBs are idempotent.
alter table apps drop constraint if exists apps_visibility_scope_check;
alter table apps add constraint apps_visibility_scope_check
  check (visibility_scope in ('public', 'unlisted', 'private'));

-- app_access — an allow-list row per (app, user|email). Source distinguishes
-- owner auto-grants from invite-link claims and direct-email invites.
create table app_access (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  email text,
  invited_by uuid references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null check (source in ('owner', 'invite_link', 'invite_email')),
  constraint app_access_user_or_email check (user_id is not null or email is not null),
  unique (app_id, user_id),
  unique (app_id, email)
);
create index app_access_app_active_idx on app_access (app_id) where revoked_at is null;

-- app_invites — invite tokens. 'link' kind is shareable and multi-use;
-- 'email' kind is bound to a specific email address.
create table app_invites (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  token text not null unique,
  kind text not null check (kind in ('link', 'email')),
  email text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  revoked_at timestamptz
);
create index app_invites_app_active_idx on app_invites (app_id) where revoked_at is null;
create index app_invites_token_idx on app_invites (token) where revoked_at is null;
