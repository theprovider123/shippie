-- Feed Protocol (lane 3: silent data refresh). Latest snapshot per (app, feed), keyed by public
-- app slug. `sequence` bumps on every changed publish for cheap client change-detection.
-- See docs/superpowers/specs/2026-06-08-shippie-feed-protocol-design.md
CREATE TABLE `app_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`app_slug` text NOT NULL,
	`feed_id` text NOT NULL,
	`data_schema` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`stale_after` text,
	`hash` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_name` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_feeds_app_feed_idx` ON `app_feeds` (`app_slug`,`feed_id`);
