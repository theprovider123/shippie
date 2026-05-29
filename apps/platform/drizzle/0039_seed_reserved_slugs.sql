-- Seed the reserved_slugs table.
--
-- The table + RESERVED_SLUGS_SEED constant existed (schema/reserved-slugs.ts)
-- but no migration ever inserted the seed, so reserved-slug enforcement
-- (loadReservedSlugs -> preflight/rename) was effectively empty in production:
-- system, route-collision, and brand slugs were all claimable. This backfills
-- the full seed idempotently. Keep in sync with RESERVED_SLUGS_SEED; the
-- reserved-slugs.test.ts assertion fails if a constant entry is missing here.
--
-- INSERT OR IGNORE so this is safe on databases that already received some
-- rows via admin suspension or a prior partial seed.

INSERT OR IGNORE INTO reserved_slugs (slug, reason) VALUES
  -- Platform infrastructure
  ('shippie', 'system'),
  ('www', 'system'),
  ('api', 'system'),
  ('cdn', 'system'),
  ('admin', 'system'),
  ('mail', 'system'),
  ('docs', 'system'),
  ('help', 'system'),
  ('status', 'system'),
  ('blog', 'system'),
  ('about', 'system'),
  ('app', 'system'),
  ('apps', 'system'),
  ('trust', 'system'),
  ('dashboard', 'system'),
  ('security', 'system'),
  ('support', 'system'),
  ('pricing', 'system'),
  ('login', 'system'),
  ('signup', 'system'),
  ('signin', 'system'),
  ('logout', 'system'),
  ('oauth', 'system'),
  ('auth', 'system'),
  ('webhooks', 'system'),
  ('webhook', 'system'),
  ('cron', 'system'),
  ('internal', 'system'),
  ('preview', 'system'),
  ('staging', 'system'),
  ('test', 'system'),
  ('new', 'system'),
  -- Live top-level route collisions
  ('run', 'route'),
  ('you', 'route'),
  ('c', 'route'),
  ('i', 'route'),
  ('glance', 'route'),
  ('today', 'route'),
  ('arcade', 'route'),
  ('labs', 'route'),
  ('invite', 'route'),
  ('build', 'route'),
  ('container', 'route'),
  ('dev', 'route'),
  ('leaderboards', 'route'),
  ('professionals', 'route'),
  ('whitepaper', 'route'),
  ('why', 'route'),
  ('trust-preview', 'route'),
  -- Brand impersonation guard
  ('apple', 'brand'),
  ('google', 'brand'),
  ('microsoft', 'brand'),
  ('amazon', 'brand'),
  ('meta', 'brand'),
  ('facebook', 'brand'),
  ('instagram', 'brand'),
  ('twitter', 'brand'),
  ('tiktok', 'brand'),
  ('openai', 'brand'),
  ('anthropic', 'brand'),
  ('stripe', 'brand'),
  ('github', 'brand'),
  ('cloudflare', 'brand');
