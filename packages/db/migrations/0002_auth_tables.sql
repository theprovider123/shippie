-- =====================================================================
-- Shippie — Migration 0002_auth_tables
-- =====================================================================
-- Adds the Auth.js v5 Drizzle adapter tables: accounts, sessions,
-- verification_tokens. These sit alongside Shippie's existing `users`
-- table (which was set up in 0001_init with Auth.js-compatible column
-- names).
--
-- These tables support PLATFORM authentication on shippie.app. They are
-- separate from `app_sessions` (added in a later migration), which
-- stores opaque handles for per-app OAuth sessions on {slug}.shippie.app.
--
-- Spec v6 §6 (Auth architecture), §18.4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- accounts — linked OAuth accounts for platform users
-- ---------------------------------------------------------------------
create table accounts (
  user_id uuid not null references users(id) on delete cascade,
  type text not null,                      -- 'oauth' | 'oidc' | 'email' | 'webauthn'
  provider text not null,                  -- 'github' | 'google' | 'apple' | 'nodemailer' | ...
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text,

  primary key (provider, provider_account_id)
);
create index accounts_user_id_idx on accounts (user_id);

-- ---------------------------------------------------------------------
-- sessions — platform (shippie.app) database sessions
--
-- These cookies are httpOnly + first-party to shippie.app only. They
-- are NOT shared with {slug}.shippie.app subdomains — per-app auth
-- uses the opaque-handle model in `app_sessions` (later migration).
-- ---------------------------------------------------------------------
create table sessions (
  session_token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires timestamptz not null
);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires);

-- ---------------------------------------------------------------------
-- verification_tokens — magic-link + email-verification tokens
-- ---------------------------------------------------------------------
create table verification_tokens (
  identifier text not null,                -- email address
  token text not null unique,
  expires timestamptz not null,

  primary key (identifier, token)
);
create index verification_tokens_expires_idx on verification_tokens (expires);
