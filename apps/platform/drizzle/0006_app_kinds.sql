-- App Kinds vocabulary — see docs/app-kinds.md.
--
-- Adds the denormalized "current kind" pointers on the `apps` row for
-- fast marketplace queries, and a per-deploy profile blob on `deploys`
-- so kind history is preserved across versions.
ALTER TABLE `apps` ADD COLUMN `current_detected_kind` text;--> statement-breakpoint
ALTER TABLE `apps` ADD COLUMN `current_public_kind_status` text;--> statement-breakpoint
ALTER TABLE `deploys` ADD COLUMN `kind_profile_json` text;
