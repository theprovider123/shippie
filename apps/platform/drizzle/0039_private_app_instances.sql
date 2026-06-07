-- Private App Instances — Cloudlet control plane (Uniti Phase 1A)
--
-- Metadata ONLY. No pupil/school data ever lands here — that lives in each
-- school's isolated SchoolWorkspace Durable Object (DO + embedded SQLite).
-- This table is the registry that maps an immutable instance id → the
-- Shippie private app + space install record + the DO that holds its data.
--
-- NOTE: numbered 0039 (the next free slug in apps/platform/drizzle); the
-- plan text said 0056 but the real latest on this branch is 0038.

CREATE TABLE IF NOT EXISTS `private_app_instances` (
  `id` text PRIMARY KEY NOT NULL,          -- IMMUTABLE UUID (crypto.randomUUID()); the data-boundary identity. NEVER the slug.
  `app_id` text NOT NULL,                  -- 'uniti' (logical key)
  `app_ref` text NOT NULL,                 -- FK -> apps.id : the Shippie private app row (visibility_scope='private')
  `space_id` text NOT NULL,                -- FK -> spaces.id : the Shippie install record for this school
  `slug` text NOT NULL UNIQUE,             -- mutable friendly alias ('greenfield-primary')
  `name` text NOT NULL,                    -- 'Greenfield Primary'
  `region` text DEFAULT 'uk' NOT NULL,
  `branding` text DEFAULT '{}' NOT NULL,   -- JSON
  `owner_email` text NOT NULL,
  `modules` text DEFAULT '[]' NOT NULL,    -- JSON array
  `workspace_do_id` text NOT NULL,         -- toString of idFromName(`uniti:${id}`) — derived from the immutable id
  `created_by` text,                       -- users.id of admin who provisioned
  `created_at` integer NOT NULL,           -- unix ms
  FOREIGN KEY (`app_ref`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX IF NOT EXISTS `idx_private_app_instances_app` ON `private_app_instances` (`app_id`);
CREATE INDEX IF NOT EXISTS `idx_private_app_instances_space` ON `private_app_instances` (`space_id`);
