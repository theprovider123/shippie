-- 0012_cli_tokens.sql
--
-- CLI + MCP authentication via OAuth 2.0 Device Authorization Grant.
--
-- Flow (RFC 8628 simplified):
--   1. CLI POSTs /api/auth/cli/device → { device_code, user_code, verification_uri }
--   2. User opens verification_uri in browser (signed-in) and confirms user_code
--   3. CLI polls /api/auth/cli/poll with device_code → { access_token } once approved
--   4. Token is stored in ~/.shippie/token and sent as Bearer on every API call
--
-- Tables:
--   cli_device_codes  — short-lived, consumed once; holds the pending-auth state
--   cli_tokens        — long-lived bearer tokens bound to a user
--
-- Spec v5 §6 (auth architecture), differentiation plan Pillar C4.

create table if not exists cli_device_codes (
  device_code    text primary key,
  user_code      text not null unique,
  user_id        uuid references users(id) on delete cascade, -- null until approved
  client_name    text not null,                                -- e.g. 'shippie-cli', 'shippie-mcp'
  scopes         text[] not null default array[]::text[],
  approved_at    timestamptz,
  expires_at     timestamptz not null,
  consumed_at    timestamptz,                                   -- set when CLI polls successfully
  created_at     timestamptz not null default now()
);

create index if not exists cli_device_codes_user_code_idx
  on cli_device_codes (user_code)
  where consumed_at is null;

create index if not exists cli_device_codes_expires_idx
  on cli_device_codes (expires_at)
  where consumed_at is null;

create table if not exists cli_tokens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  token_hash     text not null unique,                          -- sha256 of the raw bearer token
  client_name    text not null,
  scopes         text[] not null default array[]::text[],
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  expires_at     timestamptz,                                   -- null = no expiry
  created_at     timestamptz not null default now()
);

create index if not exists cli_tokens_user_idx on cli_tokens (user_id);
create index if not exists cli_tokens_active_idx
  on cli_tokens (token_hash)
  where revoked_at is null;
