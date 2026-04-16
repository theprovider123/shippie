-- 0005_functions.sql — Shippie Functions (Week 7)
--
-- Per-app secret-backed server capability. In dev, code runs in a
-- locally-dispatched Node VM. In production, it's deployed to Cloudflare
-- Workers for Platforms as a user Worker in a dispatch namespace.
-- Same schema for both paths.
--
-- Spec v6 §1 (Shippie Functions).

create table if not exists function_deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  deploy_id uuid references deploys(id) on delete cascade,
  name text not null,                          -- e.g. 'subscribe', 'ai/chat'
  worker_name text,                            -- CFW4P dispatch name (null in dev)
  bundle_hash text not null,                   -- sha256 of compiled bundle
  bundle_r2_key text not null,                 -- where the bundle lives in R2
  allowed_domains text[] not null default array[]::text[],
  env_schema jsonb not null default '{}'::jsonb,  -- declared env keys + required flag
  deployed_at timestamptz not null default now(),
  unique (app_id, name)
);
create index if not exists function_deployments_app_idx on function_deployments (app_id);

create table if not exists function_secrets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  key text not null,
  value_encrypted text not null,                 -- AES-GCM(ciphertext ‖ iv ‖ tag), base64
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, key)
);
create index if not exists function_secrets_app_idx on function_secrets (app_id);

create trigger function_secrets_updated_at
  before update on function_secrets
  for each row execute function set_updated_at();

create table if not exists function_logs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  function_name text not null,
  method text not null,
  status int,
  duration_ms int,
  cpu_time_ms int,
  user_id uuid references users(id) on delete set null,
  error text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists function_logs_app_created_idx on function_logs (app_id, created_at desc);
create index if not exists function_logs_name_idx on function_logs (app_id, function_name, created_at desc);
