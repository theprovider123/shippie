-- User abuse reports for published apps (Phase 3 of maker-app safety).
-- Any visitor can report an app; admins triage at /admin/reports with a
-- one-click suspend that drives the Phase-1 takedown.
-- See docs/superpowers/plans/2026-06-08-maker-app-safety-enforcement.md
CREATE TABLE `app_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`slug` text NOT NULL,
	`reporter_user_id` text,
	`reason` text NOT NULL,
	`detail` text,
	`status` text DEFAULT 'open' NOT NULL,
	`moderation_flags` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `app_reports_status_created_idx` ON `app_reports` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `app_reports_app_idx` ON `app_reports` (`app_id`,`created_at`);
