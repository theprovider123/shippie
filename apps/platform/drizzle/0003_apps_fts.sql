-- FTS5 virtual table for the marketplace search box.
--
-- Phase 4a (the marketplace port) needs `/apps?q=` to do a substring +
-- prefix search across the apps catalogue. SQLite's FTS5 module gives us
-- exactly what tsvector did on the Postgres side, with sub-ms latency on
-- D1.
--
-- The virtual table mirrors only the searchable text columns from `apps`
-- (we don't index numeric / metadata fields). Three triggers keep it in
-- sync with the source table on insert / update / delete.
--
-- Backfill at the bottom seeds rows for the 28 apps already mirrored from
-- Postgres so search works on first deploy without waiting for the next
-- write.
CREATE VIRTUAL TABLE IF NOT EXISTS `apps_fts` USING fts5(
  rowid_id UNINDEXED,
  slug,
  name,
  tagline,
  description,
  category,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `apps_fts_insert` AFTER INSERT ON `apps`
BEGIN
  INSERT INTO `apps_fts`(rowid_id, slug, name, tagline, description, category)
  VALUES (NEW.id, NEW.slug, NEW.name, COALESCE(NEW.tagline, ''), COALESCE(NEW.description, ''), NEW.category);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `apps_fts_update` AFTER UPDATE ON `apps`
BEGIN
  DELETE FROM `apps_fts` WHERE rowid_id = OLD.id;
  INSERT INTO `apps_fts`(rowid_id, slug, name, tagline, description, category)
  VALUES (NEW.id, NEW.slug, NEW.name, COALESCE(NEW.tagline, ''), COALESCE(NEW.description, ''), NEW.category);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `apps_fts_delete` AFTER DELETE ON `apps`
BEGIN
  DELETE FROM `apps_fts` WHERE rowid_id = OLD.id;
END;
--> statement-breakpoint
INSERT INTO `apps_fts`(rowid_id, slug, name, tagline, description, category)
SELECT id, slug, name, COALESCE(tagline, ''), COALESCE(description, ''), category FROM `apps`;
