-- 0013_github_installations.sql
--
-- GitHub App installations per user or organization.
--
-- An installation is the GitHub-side grant that lets Shippie read
-- a subset of repos (or all repos) for a given GitHub account. Users
-- land here after clicking "Install Shippie" and choosing repos on
-- github.com/apps/shippie/installations/new.
--
-- The webhook path (apps/web/app/api/github/webhook/route.ts) uses
-- installation_id to mint installation tokens for private-repo clone.
-- Migration 0001 already added apps.github_installation_id — this
-- table provides the surrounding metadata + per-user ownership.
--
-- Spec v5 §4 (GitHub integration).

create table if not exists github_installations (
  id                       uuid primary key default gen_random_uuid(),
  github_installation_id   bigint not null unique,
  user_id                  uuid not null references users(id) on delete cascade,
  organization_id          uuid references organizations(id) on delete set null,

  account_login            text not null,      -- "devante" or "shippie-templates"
  account_type             text not null,      -- 'User' | 'Organization'
  repository_selection     text not null,      -- 'all' | 'selected'

  -- Cached permissions so we can block scope-reduction surprises between pushes.
  permissions              jsonb,
  suspended_at             timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists github_installations_user_idx
  on github_installations (user_id);

create index if not exists github_installations_org_idx
  on github_installations (organization_id)
  where organization_id is not null;
