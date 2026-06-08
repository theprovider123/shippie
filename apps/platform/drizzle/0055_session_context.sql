ALTER TABLE `sessions` ADD COLUMN `client_name` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `client_surface` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `client_id_hash` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `user_agent` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `created_at` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `last_seen_at` text;
--> statement-breakpoint
UPDATE `sessions`
SET `created_at` = COALESCE(`created_at`, datetime('now')),
    `last_seen_at` = COALESCE(`last_seen_at`, datetime('now'));
--> statement-breakpoint
CREATE INDEX `sessions_user_last_seen_idx` ON `sessions` (`user_id`,`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `sessions_client_id_hash_idx` ON `sessions` (`client_id_hash`);
