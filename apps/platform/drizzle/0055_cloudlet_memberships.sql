-- Cloudlet memberships + invites — School setup, RBAC, invites (Uniti Phase 2)
--
-- Replaces the Phase-1A ownerEmail shortcut. Access to a school's private
-- workspace is granted by a VERIFIED membership row (created on invite-accept
-- or at provisioning for the office manager), never by an unverified email.
-- `role` is one of the 8 cloudlet roles in @shippie/cloudlet-contract.
--
-- Control-plane only — still NO pupil/school data (that stays in the per-school
-- SchoolWorkspace Durable Object).

CREATE TABLE IF NOT EXISTS `cloudlet_memberships` (
  `instance_id` text NOT NULL,             -- FK -> private_app_instances.id (the data-boundary identity)
  `user_id` text NOT NULL,                 -- FK -> users.id (verified Lucia identity)
  `role` text NOT NULL,                    -- one of the 8 cloudlet roles
  `scope` text,                            -- JSON {classIds?: string[]} — optional class-level scope
  `invited_by` text,                       -- users.id of inviter (null for provisioning seed)
  `joined_at` text DEFAULT (datetime('now')) NOT NULL,
  PRIMARY KEY (`instance_id`, `user_id`),
  FOREIGN KEY (`instance_id`) REFERENCES `private_app_instances`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `cloudlet_memberships_user_idx` ON `cloudlet_memberships` (`user_id`);

CREATE TABLE IF NOT EXISTS `cloudlet_invites` (
  `id` text PRIMARY KEY NOT NULL,          -- crypto.randomUUID()
  `instance_id` text NOT NULL,             -- FK -> private_app_instances.id
  `email` text NOT NULL,                   -- invitee email (lowercased)
  `role` text NOT NULL,                    -- role to grant on accept
  `scope` text,                            -- JSON {classIds?: string[]}
  `token_hash` text NOT NULL,              -- SHA-256 hex of the raw token (raw token never stored)
  `expires_at` text NOT NULL,              -- ISO timestamp
  `accepted_at` text,                      -- ISO timestamp; null while pending
  `accepted_by` text,                      -- users.id who accepted
  `revoked_at` text,                       -- ISO timestamp; null unless revoked
  `invited_by` text,                       -- users.id of inviter
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`instance_id`) REFERENCES `private_app_instances`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`accepted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `cloudlet_invites_instance_idx` ON `cloudlet_invites` (`instance_id`);
CREATE INDEX IF NOT EXISTS `cloudlet_invites_email_idx` ON `cloudlet_invites` (`email`);
CREATE INDEX IF NOT EXISTS `cloudlet_invites_token_idx` ON `cloudlet_invites` (`token_hash`);
