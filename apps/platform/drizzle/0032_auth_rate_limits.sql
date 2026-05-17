CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `reset_at` text NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_rate_limits_reset_idx` ON `auth_rate_limits` (`reset_at`);
