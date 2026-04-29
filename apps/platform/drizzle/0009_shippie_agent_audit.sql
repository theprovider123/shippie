-- Phase C1 — local agent audit log.
--
-- One row per insight surfaced to the user. The agent runs at the
-- container's origin under the system-permissions tier, so the audit
-- log is the only persisted trace of an agent action — used for rate
-- limit enforcement across reloads, dedupe across days, and quarterly
-- "did the agent ever say something useful" review.
--
-- All payload fields are local-context — no PII beyond app slugs the
-- user has already installed.
CREATE TABLE `_shippie_agent_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`insight_id` text NOT NULL,
	`strategy` text NOT NULL,
	`urgency` text NOT NULL,
	`target_app` text NOT NULL,
	`disposition` text DEFAULT 'shown' NOT NULL,
	`generated_at` text NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_audit_user_insight_unique` ON `_shippie_agent_audit` (`user_id`, `insight_id`);--> statement-breakpoint
CREATE INDEX `agent_audit_user_recorded_idx` ON `_shippie_agent_audit` (`user_id`, `recorded_at`);--> statement-breakpoint
CREATE INDEX `agent_audit_strategy_idx` ON `_shippie_agent_audit` (`strategy`, `recorded_at`);
