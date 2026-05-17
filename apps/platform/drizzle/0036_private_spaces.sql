-- Private Spaces v0
--
-- Spaces persist the private context behind role-bound invite links. App
-- invites still carry the public claim token; these tables add the shared
-- space record, app membership, join-token history, and owner-visible audit log.

CREATE TABLE IF NOT EXISTS `spaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_by` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `archived_at` text,
  `archive_reason` text,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `spaces_created_by_idx` ON `spaces` (`created_by`);
CREATE INDEX IF NOT EXISTS `spaces_status_idx` ON `spaces` (`status`);

CREATE TABLE IF NOT EXISTS `space_apps` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL,
  `app_id` text NOT NULL,
  `app_slug` text NOT NULL,
  `package_hash` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `space_apps_space_idx` ON `space_apps` (`space_id`);
CREATE INDEX IF NOT EXISTS `space_apps_app_idx` ON `space_apps` (`app_id`);

CREATE TABLE IF NOT EXISTS `space_join_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL,
  `app_id` text NOT NULL,
  `invite_id` text NOT NULL,
  `role` text NOT NULL,
  `max_claims` integer,
  `claim_count` integer DEFAULT 0 NOT NULL,
  `expires_at` text,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `revoked_at` text,
  `rotated_from` text,
  FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`invite_id`) REFERENCES `app_invites`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`rotated_from`) REFERENCES `space_join_tokens`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `space_join_tokens_space_idx` ON `space_join_tokens` (`space_id`);
CREATE INDEX IF NOT EXISTS `space_join_tokens_app_idx` ON `space_join_tokens` (`app_id`);
CREATE INDEX IF NOT EXISTS `space_join_tokens_invite_idx` ON `space_join_tokens` (`invite_id`);

CREATE TABLE IF NOT EXISTS `space_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `space_id` text NOT NULL,
  `app_id` text,
  `actor_id` text,
  `action` text NOT NULL,
  `metadata` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `space_audit_space_created_idx` ON `space_audit_log` (`space_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `space_audit_app_created_idx` ON `space_audit_log` (`app_id`, `created_at`);
