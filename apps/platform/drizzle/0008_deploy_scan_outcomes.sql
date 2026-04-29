-- Phase B3 — Stage B harness.
--
-- Captures maker disposition on Phase 4 Stage A scanner findings so we can
-- measure false-positive rates before promoting findings to public-facing
-- "trust" surfaces. Stays internal until Stage B promotion criteria pass.
--
-- One row per (deploy, scanner, finding) once the maker reacts. No row at
-- all if the maker never opens the deploy report — absence is a signal.
CREATE TABLE `_deploy_scan_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`deploy_id` text NOT NULL,
	`app_id` text NOT NULL,
	`scanner` text NOT NULL,
	`scanner_version` text NOT NULL,
	`finding_id` text NOT NULL,
	`severity` text NOT NULL,
	`disposition` text NOT NULL,
	`note` text,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deploy_scan_outcomes_finding_unique` ON `_deploy_scan_outcomes` (`deploy_id`, `scanner`, `finding_id`);--> statement-breakpoint
CREATE INDEX `deploy_scan_outcomes_app_recorded_idx` ON `_deploy_scan_outcomes` (`app_id`, `recorded_at`);--> statement-breakpoint
CREATE INDEX `deploy_scan_outcomes_disposition_idx` ON `_deploy_scan_outcomes` (`scanner`, `disposition`);
