-- 0010_custom_domains.sql — Custom domain support (Week 5)
--
-- Makers can bring their own domain (e.g., app.example.com) that resolves
-- to their Shippie-hosted app. DNS TXT verification required. One domain
-- per app can be marked canonical.
--
-- Also adds forkable toggle to apps.
--
-- Spec v5 §5.

create table if not exists custom_domains (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  domain text not null unique,
  is_canonical boolean not null default false,
  verification_token text not null,
  verified_at timestamptz,
  ssl_provisioned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists custom_domains_app_idx on custom_domains (app_id);
create index if not exists custom_domains_domain_idx on custom_domains (domain);

alter table apps add column if not exists forkable boolean not null default false;
