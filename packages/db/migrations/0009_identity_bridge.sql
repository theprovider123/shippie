-- 0009_identity_bridge.sql — BYO backend identity + app backend config (v5 pivot)
--
-- Adds external_user_id to feedback tables so BYO-backend users can
-- submit feedback and vote without needing a Shippie platform account.
-- Also adds backend_type + backend_url columns to apps.
--
-- Spec v5 §2 (BYO backend).

-- App backend configuration
alter table apps add column if not exists backend_type text;  -- 'supabase' | 'firebase' | null
alter table apps add column if not exists backend_url text;

-- Feedback identity bridge: external_user_id + display name for BYO users
alter table feedback_items add column if not exists external_user_id text;
alter table feedback_items add column if not exists external_user_display text;

-- Feedback votes: surrogate PK + external user support
-- The existing PK is (feedback_id, user_id). We need to support external
-- users too. Drop the old PK and add a new surrogate + partial indexes.
--
-- NOTE: This migration is destructive if there are existing votes. In
-- dev that's fine; in prod you'd migrate data first.
alter table feedback_votes drop constraint if exists feedback_votes_pkey;
alter table feedback_votes add column if not exists id uuid default gen_random_uuid();
alter table feedback_votes add column if not exists external_user_id text;

-- Make user_id nullable (external users won't have one)
alter table feedback_votes alter column user_id drop not null;

-- Exactly one identity column must be set
alter table feedback_votes add constraint exactly_one_identity
  check ((user_id is not null) != (external_user_id is not null));

-- Add primary key on new surrogate
alter table feedback_votes add primary key (id);

-- Partial unique indexes for dedup (replaces the old composite PK)
create unique index if not exists feedback_votes_internal_uniq
  on feedback_votes (feedback_id, user_id) where user_id is not null;
create unique index if not exists feedback_votes_external_uniq
  on feedback_votes (feedback_id, external_user_id) where external_user_id is not null;
