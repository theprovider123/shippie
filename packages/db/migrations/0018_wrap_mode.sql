-- apps/web/plans/2026-04-23-url-wrap-mode.md Task 1
-- Source discriminator: 'static' (zip/github build → R2) or 'wrapped_url' (proxy)
alter table apps add column source_kind text not null default 'static';
alter table apps add constraint apps_source_kind_check
  check (source_kind in ('static', 'wrapped_url'));

-- Upstream URL — only set when source_kind='wrapped_url'
alter table apps add column upstream_url text;
alter table apps add constraint apps_upstream_url_consistency check (
  (source_kind = 'static' and upstream_url is null)
  or
  (source_kind = 'wrapped_url' and upstream_url is not null and upstream_url like 'https://%')
);

-- Proxy config: csp_mode, extra_headers, auth_redirect_hint
alter table apps add column upstream_config jsonb not null default '{}'::jsonb;

create index apps_source_kind_idx on apps (source_kind) where source_kind <> 'static';

-- Task 0 prereq: deploys gains source_kind + source_ref so wrap deploys can
-- be attributed alongside the existing source_type ('zip' | 'github').
-- Nullable because pre-existing rows have no value.
alter table deploys add column source_kind text;
alter table deploys add column source_ref text;
