-- 2026-06-11 kitchen consolidation.
--
-- The new palate. kitchen companion (apps/showcase-palate) replaces four
-- apps: the old Palate recipe hub (apps/showcase-recipe, same slug), Mise
-- (nutrition log), Cooking (temps/timing), and Dough (baker's %). Source
-- dirs are removed from the repo; their D1 rows are kept for provenance
-- but moved off the marketplace shelves (surface='archived' — the 0052
-- retired-apps precedent). is_archived stays 0: archived placement, not a
-- takedown. Old /run and /apps URLs 302 to successors via SLUG_ALIASES in
-- showcase-slugs.ts (mise→palate, dough→palate, cooking→palate).
--
-- The /apps/[slug] marketplace page reads description from THIS table, not
-- shippie.json — so the palate row must be rewritten or prod ships the old
-- recipe copy.

UPDATE apps
SET
  surface = 'archived',
  updated_at = datetime('now')
WHERE slug IN ('mise', 'cooking', 'dough');
--> statement-breakpoint
UPDATE apps
SET
  description = 'A chef''s kitchen companion. Wind a dial, run the rail of timers, glance cook mode, probe temps, scale a baker''s formula — offline, all local.',
  tagline = 'Dial, rail, glance, probe, scale.',
  theme_color = '#b85c26',
  background_color = '#f7f3ec',
  surface = 'featured',
  updated_at = datetime('now')
WHERE slug = 'palate';
