CREATE TABLE `capability_badges` (
	`app_id` text NOT NULL,
	`badge` text NOT NULL,
	`awarded_at` text DEFAULT (datetime('now')) NOT NULL,
	`distinct_devices` integer NOT NULL,
	PRIMARY KEY(`app_id`, `badge`),
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `capability_badges_badge` ON `capability_badges` (`badge`);--> statement-breakpoint
CREATE TABLE `proof_events` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`deploy_id` text,
	`device_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text,
	`ts` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `proof_events_app_type_ts` ON `proof_events` (`app_id`,`event_type`,`ts`);--> statement-breakpoint
CREATE INDEX `proof_events_app_device` ON `proof_events` (`app_id`,`device_hash`);