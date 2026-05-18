-- App suspension semantics — split admin enforcement from maker cleanup
--
-- `is_archived` already exists but does double duty: makers use it to retire
-- their own apps; admins use it to take down policy violations. Code can't
-- tell which is which after the fact. These columns make it explicit:
--   - suspension_reason: 'dmca' | 'policy_violation' | 'spam' | etc.
--   - suspended_at: when the admin pulled the trigger
--   - suspended_by: which admin (FK -> users.id)
--
-- Maker-side archival leaves these NULL. Admin-side suspension fills them.
-- Public queries hide either; appeal/maker dashboard tells them apart.

ALTER TABLE `apps` ADD COLUMN `suspension_reason` text;
ALTER TABLE `apps` ADD COLUMN `suspended_at` text;
ALTER TABLE `apps` ADD COLUMN `suspended_by` text REFERENCES `users`(`id`);

CREATE INDEX IF NOT EXISTS `idx_apps_suspended` ON `apps` (`suspension_reason`)
  WHERE `suspension_reason` IS NOT NULL;
