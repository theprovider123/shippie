-- Durable data-family identifier on apps, locked on first deploy.
--
-- The data-passport family was previously derived from the slug (see
-- defaultDataPassport in deploy/manifest.ts), so renaming an app silently
-- changed its data family and broke data-passport compatibility across the
-- rename. This column lets the deploy pipeline lock the family once and reuse
-- it on every subsequent deploy regardless of slug changes. Nullable; the
-- pipeline backfills lazily on each app's next deploy.

ALTER TABLE `apps` ADD COLUMN `data_family` text;
