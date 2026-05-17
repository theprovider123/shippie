-- Slate v4 → Arcade v2: introduce a marketplace `surface` column on
-- the `apps` table so third-party makers can publish into /arcade or
-- /labs alongside the curated first-party showcases. Allowed values
-- are validated app-side in `lib/curation/schema.ts`:
-- featured | arcade | labs | archived. Extensible without a migration.
--
-- Default 'featured' so every existing row keeps its current marketplace
-- placement. New uploads pick this up via the surface resolver in
-- `server/deploy/pipeline.ts` (priority: manifest > form override >
-- existing row > 'featured').

ALTER TABLE apps ADD COLUMN surface TEXT NOT NULL DEFAULT 'featured';

-- Help future surface-filtered queries (browsePublic, searchPublic,
-- listCategories, /arcade UNION query, /labs UNION query). Cheap on
-- a low-cardinality column.
CREATE INDEX IF NOT EXISTS apps_surface_idx ON apps(surface);
