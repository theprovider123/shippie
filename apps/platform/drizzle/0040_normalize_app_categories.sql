-- Remap existing apps.category values onto the controlled vocab.
--
-- apps.category was written unvalidated from several paths (manifest default,
-- wrap input, GitHub deploy 'other', free-text profile edits), so the column
-- can hold freeform/legacy values. The marketplace category filter
-- (`WHERE a.category = ?`) and the chip rail (listCategories distinct) operate
-- on this raw column, so a stray legacy value desyncs chips from filters.
--
-- Phase 1 enforces the controlled vocab at every write boundary going forward
-- (normalizeCategory in curation/schema.ts). This migration backfills existing
-- rows using the same legacy map. Idempotent: re-running is a no-op once rows
-- are already controlled. Unknown values are intentionally left untouched and
-- surfaced by scripts/audit-app-categories.mjs.

UPDATE apps SET category = 'food-drink'     WHERE category IN ('cooking', 'coffee');
--> statement-breakpoint
UPDATE apps SET category = 'health-fitness'  WHERE category IN ('fitness', 'wellness', 'health');
--> statement-breakpoint
UPDATE apps SET category = 'creative'         WHERE category = 'creativity';
--> statement-breakpoint
UPDATE apps SET category = 'productivity'     WHERE category IN ('journal', 'money', 'finance');
--> statement-breakpoint
UPDATE apps SET category = 'lifestyle'        WHERE category IN ('memory', 'home', 'family', 'travel');
--> statement-breakpoint
UPDATE apps SET category = 'tools'            WHERE category = 'other';
