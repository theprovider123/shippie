CREATE TABLE `cron_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `cron_string` text NOT NULL,
  `handler` text NOT NULL,
  `started_at` text DEFAULT (datetime('now')) NOT NULL,
  `finished_at` text,
  `status` text DEFAULT 'running' NOT NULL,
  `error_message` text,
  `items_processed` integer
);--> statement-breakpoint
CREATE INDEX `cron_runs_handler_started_idx` ON `cron_runs` (`handler`, `started_at`);
