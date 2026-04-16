-- 0007_fts_ranking.sql — Postgres FTS + ranking (Week 10 follow-up)
--
-- Adds a generated tsvector column on apps + a pg_trgm index on name/slug
-- so the marketplace search can swap its in-memory filter for SQL.
--
-- Ranking scores (ranking_score_app / _web_app / _website) are already
-- columns on apps — this migration only adds the FTS surface.

create extension if not exists pg_trgm;

-- Generated tsvector — rebuilds on every write (no trigger needed).
alter table apps
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(slug, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'D')
  ) stored;

create index if not exists apps_search_tsv_idx on apps using gin (search_tsv);
create index if not exists apps_name_trgm_idx on apps using gin (name gin_trgm_ops);
create index if not exists apps_slug_trgm_idx on apps using gin (slug gin_trgm_ops);
