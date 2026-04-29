-- Container commons package records.
--
-- The portable package artifacts live in R2 beside the deploy report. These
-- tables persist the query-critical package and lineage fields without storing
-- user install receipts, which remain local-container data.
CREATE TABLE `app_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`deploy_id` text NOT NULL,
	`version` text NOT NULL,
	`channel` text DEFAULT 'stable' NOT NULL,
	`package_hash` text NOT NULL,
	`artifact_prefix` text NOT NULL,
	`manifest_path` text NOT NULL,
	`permissions_path` text NOT NULL,
	`trust_report_path` text NOT NULL,
	`source_path` text NOT NULL,
	`deploy_report_path` text,
	`container_eligibility` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_packages_deploy_unique` ON `app_packages` (`deploy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_packages_hash_unique` ON `app_packages` (`package_hash`);--> statement-breakpoint
CREATE INDEX `app_packages_app_created_idx` ON `app_packages` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `app_packages_container_idx` ON `app_packages` (`container_eligibility`);--> statement-breakpoint
CREATE TABLE `app_lineage` (
	`app_id` text PRIMARY KEY NOT NULL,
	`template_id` text,
	`parent_app_id` text,
	`parent_version` text,
	`source_repo` text,
	`license` text,
	`remix_allowed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE set null
);
