-- Follow-up to 0063: prod-state corrections discovered at deploy verify.
--
-- The legacy palate row was visibility_scope='private' (old recipe-era
-- state), which 404s the public /apps/palate marketplace page. The chiwit
-- row carried a stray is_archived=1 takedown flag from an earlier admin
-- action; the rebuilt chiwit is a public flagship.

UPDATE apps
SET
  visibility_scope = 'public',
  updated_at = datetime('now')
WHERE slug = 'palate';
--> statement-breakpoint
UPDATE apps
SET
  is_archived = 0,
  updated_at = datetime('now')
WHERE slug = 'chiwit';
