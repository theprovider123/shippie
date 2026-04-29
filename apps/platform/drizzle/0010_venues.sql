-- Phase 6 — venues + venue sessions.
--
-- A venue is a physical place that runs one or more Hubs. A venue
-- session is a time-bounded event (a quiz night, a festival day) the
-- platform can promote to attendees. The Hub federation primitive
-- syncs the catalogue across the venue's Hubs; the platform stores
-- the venue's identity + admin metadata so apps can render "Live at
-- X" and route in-room features.
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`organiser_user_id` text NOT NULL,
	`primary_hub_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organiser_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_slug_unique` ON `venues` (`slug`);--> statement-breakpoint
CREATE INDEX `venues_status_idx` ON `venues` (`status`);--> statement-breakpoint
CREATE TABLE `venue_hubs` (
	`venue_id` text NOT NULL,
	`hub_id` text NOT NULL,
	`url` text NOT NULL,
	`priority_rank` integer DEFAULT 100 NOT NULL,
	`last_heartbeat_at` text,
	`registered_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY (`venue_id`, `hub_id`),
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `venue_hubs_venue_idx` ON `venue_hubs` (`venue_id`);--> statement-breakpoint
CREATE INDEX `venue_hubs_heartbeat_idx` ON `venue_hubs` (`last_heartbeat_at`);--> statement-breakpoint
CREATE TABLE `venue_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`name` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`attendee_count_estimate` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `venue_sessions_venue_idx` ON `venue_sessions` (`venue_id`);--> statement-breakpoint
CREATE INDEX `venue_sessions_starts_idx` ON `venue_sessions` (`starts_at`);
