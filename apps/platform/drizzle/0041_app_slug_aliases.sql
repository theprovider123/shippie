-- Third-party slug-rename aliases.
--
-- Before this, renaming a maker app migrated KV/R2 and 303'd the editor to the
-- new slug, but left every external link to the OLD slug 404ing. This table
-- maps retired slug -> current slug so /apps and /run can 302 instead.
-- First-party showcase aliases stay in showcase-slugs.ts (zero-DB hot path).

CREATE TABLE `app_slug_aliases` (
  `slug` text PRIMARY KEY NOT NULL,
  `app_id` text NOT NULL,
  `target_slug` text NOT NULL,
  `reason` text DEFAULT 'rename' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `retired_at` text,
  FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_slug_aliases_app_id_idx` ON `app_slug_aliases` (`app_id`);
