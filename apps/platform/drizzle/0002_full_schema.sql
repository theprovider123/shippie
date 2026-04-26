-- Drop Phase 1 stub tables before recreating with the full schema.
-- Both tables were empty smoke-test placeholders (verified before applying).
-- The mirror script repopulates these from Neon.
DROP TABLE IF EXISTS `sessions`;--> statement-breakpoint
DROP TABLE IF EXISTS `users`;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` text,
	`github_id` text,
	`google_id` text,
	`apple_id` text,
	`name` text,
	`image` text,
	`username` text,
	`display_name` text,
	`avatar_url` text,
	`bio` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`verified_maker` integer DEFAULT false NOT NULL,
	`verification_source` text,
	`first_deploy_at` text,
	`first_deploy_duration_ms` integer,
	`first_deploy_app_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_apple_id_unique` ON `users` (`apple_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` text NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_tokens_token_unique` ON `verification_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `verification_tokens_expires_idx` ON `verification_tokens` (`expires`);--> statement-breakpoint
CREATE TABLE `organization_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`invited_by` text,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`billing_customer_id` text,
	`verified_business` integer DEFAULT false NOT NULL,
	`verified_at` text,
	`verified_domain` text,
	`support_email` text,
	`privacy_policy_url` text,
	`terms_url` text,
	`data_residency` text DEFAULT 'eu' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata` text,
	`ip_hash` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_org_created_idx` ON `audit_log` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `app_permissions` (
	`app_id` text PRIMARY KEY NOT NULL,
	`auth` integer DEFAULT false NOT NULL,
	`storage` text DEFAULT 'none' NOT NULL,
	`files` integer DEFAULT false NOT NULL,
	`notifications` integer DEFAULT false NOT NULL,
	`analytics` integer DEFAULT true NOT NULL,
	`external_network` integer DEFAULT false NOT NULL,
	`allowed_connect_domains` text DEFAULT ('[]') NOT NULL,
	`native_bridge_features` text DEFAULT ('[]') NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`description` text,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`icon_url` text,
	`theme_color` text DEFAULT '#000000' NOT NULL,
	`background_color` text DEFAULT '#ffffff' NOT NULL,
	`github_repo` text,
	`github_branch` text DEFAULT 'main' NOT NULL,
	`github_installation_id` integer,
	`github_verified` integer DEFAULT false NOT NULL,
	`source_type` text NOT NULL,
	`source_kind` text DEFAULT 'static' NOT NULL,
	`upstream_url` text,
	`upstream_config` text DEFAULT ('{}') NOT NULL,
	`backend_type` text,
	`backend_url` text,
	`conflict_policy` text DEFAULT 'shippie' NOT NULL,
	`maker_id` text NOT NULL,
	`organization_id` text,
	`visibility_scope` text DEFAULT 'public' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`takedown_reason` text,
	`latest_deploy_id` text,
	`latest_deploy_status` text,
	`active_deploy_id` text,
	`preview_deploy_id` text,
	`upvote_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`install_count` integer DEFAULT 0 NOT NULL,
	`active_users_30d` integer DEFAULT 0 NOT NULL,
	`feedback_open_count` integer DEFAULT 0 NOT NULL,
	`ranking_score_app` real DEFAULT 0 NOT NULL,
	`ranking_score_web_app` real DEFAULT 0 NOT NULL,
	`ranking_score_website` real DEFAULT 0 NOT NULL,
	`native_readiness_score` integer DEFAULT 0 NOT NULL,
	`compatibility_score` integer DEFAULT 0 NOT NULL,
	`native_readiness_report` text,
	`best_on` text,
	`quick_ship_slo_hit` integer,
	`support_email` text,
	`privacy_policy_url` text,
	`terms_url` text,
	`data_residency` text DEFAULT 'eu' NOT NULL,
	`screenshot_urls` text,
	`first_published_at` text,
	`last_deployed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`is_trial` integer DEFAULT false NOT NULL,
	`trial_until` text,
	`trial_claimed_by` text,
	`trial_ip_hash` text,
	FOREIGN KEY (`maker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trial_claimed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_slug_unique` ON `apps` (`slug`);--> statement-breakpoint
CREATE INDEX `apps_slug_active_idx` ON `apps` (`slug`);--> statement-breakpoint
CREATE INDEX `apps_maker_idx` ON `apps` (`maker_id`);--> statement-breakpoint
CREATE INDEX `apps_org_idx` ON `apps` (`organization_id`);--> statement-breakpoint
CREATE INDEX `apps_type_visibility_idx` ON `apps` (`type`,`visibility_scope`);--> statement-breakpoint
CREATE TABLE `deploy_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`deploy_id` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`file_count` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`manifest` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deploys` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`version` integer NOT NULL,
	`commit_sha` text,
	`source_type` text NOT NULL,
	`shippie_json` text,
	`changelog` text,
	`status` text DEFAULT 'building' NOT NULL,
	`build_log` text,
	`preflight_status` text,
	`preflight_report` text,
	`autopackaging_status` text,
	`autopackaging_report` text,
	`error_message` text,
	`duration_ms` integer,
	`source_kind` text,
	`source_ref` text,
	`csp_header` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`created_by` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deploys_app_version_unique` ON `deploys` (`app_id`,`version`);--> statement-breakpoint
CREATE INDEX `deploys_app_created_idx` ON `deploys` (`app_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reserved_slugs` (
	`slug` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_authorization_codes_expires_idx` ON `oauth_authorization_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_hash` text,
	`redirect_uris` text NOT NULL,
	`allowed_scopes` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_clients_client_id_unique` ON `oauth_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_clients_app_idx` ON `oauth_clients` (`app_id`);--> statement-breakpoint
CREATE TABLE `oauth_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`scope` text NOT NULL,
	`consented_at` text DEFAULT (datetime('now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_consents_user_app_unique` ON `oauth_consents` (`user_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `oauth_consents_user_idx` ON `oauth_consents` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_consents_app_idx` ON `oauth_consents` (`app_id`);--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`handle_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`scope` text NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	`device_fingerprint` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`rotated_from` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rotated_from`) REFERENCES `app_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_handle_hash_unique` ON `app_sessions` (`handle_hash`);--> statement-breakpoint
CREATE INDEX `app_sessions_user_app_active_idx` ON `app_sessions` (`user_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `app_sessions_handle_active_idx` ON `app_sessions` (`handle_hash`);--> statement-breakpoint
CREATE INDEX `app_sessions_expires_idx` ON `app_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `app_data` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`collection` text NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_data_app_user_idx` ON `app_data` (`app_id`,`user_id`,`collection`);--> statement-breakpoint
CREATE TABLE `app_files` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_files_r2_key_unique` ON `app_files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `app_files_app_user_idx` ON `app_files` (`app_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `app_signing_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`platform` text NOT NULL,
	`account_credential_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`ios_bundle_id` text,
	`ios_team_id` text,
	`ios_signing_mode` text,
	`ios_certificate_r2_key` text,
	`ios_certificate_password_encrypted` text,
	`ios_provisioning_profile_r2_key` text,
	`ios_entitlements_plist_r2_key` text,
	`android_package` text,
	`android_keystore_r2_key` text,
	`android_keystore_password_encrypted` text,
	`android_key_alias` text,
	`android_key_password_encrypted` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_credential_id`) REFERENCES `store_account_credentials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_signing_configs_app_platform_idx` ON `app_signing_configs` (`app_id`,`platform`);--> statement-breakpoint
CREATE TABLE `store_account_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`platform` text NOT NULL,
	`credential_type` text NOT NULL,
	`label` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`rotated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_account_credentials_unique` ON `store_account_credentials` (`subject_type`,`subject_id`,`platform`,`credential_type`,`label`);--> statement-breakpoint
CREATE INDEX `sac_subject_idx` ON `store_account_credentials` (`subject_type`,`subject_id`,`platform`);--> statement-breakpoint
CREATE TABLE `ios_signing_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`signing_config_id` text NOT NULL,
	`nonce` text NOT NULL,
	`succeeded_at` text,
	`failed_at` text,
	`failure_reason` text,
	`xcode_version` text,
	`macos_version` text,
	`log_r2_key` text,
	`verify_kit_version` integer NOT NULL,
	`invalidated_at` text,
	`invalidated_reason` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`signing_config_id`) REFERENCES `app_signing_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ios_signing_verifications_nonce_unique` ON `ios_signing_verifications` (`nonce`);--> statement-breakpoint
CREATE INDEX `ios_signing_verifications_active_idx` ON `ios_signing_verifications` (`app_id`,`signing_config_id`,`succeeded_at`);--> statement-breakpoint
CREATE TABLE `ios_verify_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`signing_config_id` text NOT NULL,
	`nonce` text NOT NULL,
	`secret` text NOT NULL,
	`kit_version` integer NOT NULL,
	`issued_to` text NOT NULL,
	`issued_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`consumption_outcome` text,
	`rejection_reason` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`signing_config_id`) REFERENCES `app_signing_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ios_verify_kits_nonce_unique` ON `ios_verify_kits` (`nonce`);--> statement-breakpoint
CREATE INDEX `ios_verify_kits_app_unused_idx` ON `ios_verify_kits` (`app_id`,`signing_config_id`);--> statement-breakpoint
CREATE TABLE `account_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`requested_at` text DEFAULT (datetime('now')) NOT NULL,
	`grace_period_ends_at` text NOT NULL,
	`confirmed_at` text,
	`executed_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_unique` ON `account_deletion_requests` (`app_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `compliance_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`platform` text NOT NULL,
	`check_type` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text,
	`checked_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compliance_checks_app_platform_idx` ON `compliance_checks` (`app_id`,`platform`);--> statement-breakpoint
CREATE INDEX `compliance_checks_app_type_idx` ON `compliance_checks` (`app_id`,`check_type`);--> statement-breakpoint
CREATE TABLE `privacy_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`deploy_id` text,
	`collected_data` text NOT NULL,
	`accessed_apis` text NOT NULL,
	`tracking_enabled` integer DEFAULT false NOT NULL,
	`tracking_domains` text,
	`data_safety_android` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL,
	`source` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `privacy_manifests_app_idx` ON `privacy_manifests` (`app_id`,`generated_at`);--> statement-breakpoint
CREATE TABLE `native_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`platform` text NOT NULL,
	`wrapper` text NOT NULL,
	`version` text NOT NULL,
	`build_number` integer NOT NULL,
	`bundle_id` text NOT NULL,
	`signed_artifact_r2_key` text,
	`readiness_score` integer,
	`readiness_report` text,
	`native_bridge_features` text,
	`submission_status` text DEFAULT 'draft' NOT NULL,
	`rejection_reason` text,
	`store_connect_id` text,
	`play_console_id` text,
	`testflight_group` text,
	`play_track` text,
	`submitted_at` text,
	`approved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `native_bundles_app_platform_idx` ON `native_bundles` (`app_id`,`platform`);--> statement-breakpoint
CREATE INDEX `native_bundles_status_idx` ON `native_bundles` (`submission_status`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_unique` ON `push_subscriptions` (`user_id`,`app_id`,`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_app_idx` ON `push_subscriptions` (`user_id`,`app_id`);--> statement-breakpoint
CREATE TABLE `app_external_domains` (
	`app_id` text NOT NULL,
	`deploy_id` text NOT NULL,
	`domain` text NOT NULL,
	`source` text NOT NULL,
	`allowed` integer NOT NULL,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`app_id`, `deploy_id`, `domain`),
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `function_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`deploy_id` text,
	`name` text NOT NULL,
	`worker_name` text,
	`bundle_hash` text NOT NULL,
	`bundle_r2_key` text NOT NULL,
	`allowed_domains` text DEFAULT ('[]') NOT NULL,
	`env_schema` text DEFAULT ('{}') NOT NULL,
	`deployed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deploy_id`) REFERENCES `deploys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_deployments_app_name_unique` ON `function_deployments` (`app_id`,`name`);--> statement-breakpoint
CREATE INDEX `function_deployments_app_idx` ON `function_deployments` (`app_id`);--> statement-breakpoint
CREATE TABLE `function_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`function_name` text NOT NULL,
	`method` text NOT NULL,
	`status` integer,
	`duration_ms` integer,
	`cpu_time_ms` integer,
	`user_id` text,
	`error` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `function_logs_app_created_idx` ON `function_logs` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `function_logs_name_idx` ON `function_logs` (`app_id`,`function_name`,`created_at`);--> statement-breakpoint
CREATE TABLE `function_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`key` text NOT NULL,
	`value_encrypted` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_secrets_app_key_unique` ON `function_secrets` (`app_id`,`key`);--> statement-breakpoint
CREATE INDEX `function_secrets_app_idx` ON `function_secrets` (`app_id`);--> statement-breakpoint
CREATE TABLE `feedback_items` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`rating` integer,
	`title` text,
	`body` text,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`duplicate_of` text,
	`external_user_id` text,
	`external_user_display` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_items_app_status_idx` ON `feedback_items` (`app_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`feedback_id` text NOT NULL,
	`user_id` text,
	`external_user_id` text,
	`value` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`session_id` text,
	`event_name` text NOT NULL,
	`properties` text,
	`url` text,
	`referrer` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `analytics_events_app_created_idx` ON `analytics_events` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_app_user_idx` ON `analytics_events` (`app_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `custom_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`domain` text NOT NULL,
	`is_canonical` integer DEFAULT false NOT NULL,
	`verification_token` text NOT NULL,
	`verified_at` text,
	`ssl_provisioned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_domains_domain_unique` ON `custom_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `custom_domains_app_idx` ON `custom_domains` (`app_id`);--> statement-breakpoint
CREATE INDEX `custom_domains_domain_idx` ON `custom_domains` (`domain`);--> statement-breakpoint
CREATE TABLE `cli_device_codes` (
	`device_code` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`client_name` text NOT NULL,
	`scopes` text DEFAULT ('[]') NOT NULL,
	`approved_at` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_device_codes_user_code_unique` ON `cli_device_codes` (`user_code`);--> statement-breakpoint
CREATE INDEX `cli_device_codes_user_code_idx` ON `cli_device_codes` (`user_code`);--> statement-breakpoint
CREATE INDEX `cli_device_codes_expires_idx` ON `cli_device_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `cli_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`client_name` text NOT NULL,
	`scopes` text DEFAULT ('[]') NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_tokens_token_hash_unique` ON `cli_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `cli_tokens_user_idx` ON `cli_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `cli_tokens_active_idx` ON `cli_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`github_installation_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`repository_selection` text NOT NULL,
	`permissions` text,
	`suspended_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_github_installation_id_unique` ON `github_installations` (`github_installation_id`);--> statement-breakpoint
CREATE INDEX `github_installations_user_idx` ON `github_installations` (`user_id`);--> statement-breakpoint
CREATE INDEX `github_installations_org_idx` ON `github_installations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `app_events` (
	`id` integer NOT NULL,
	`app_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`metadata` text DEFAULT ('{}') NOT NULL,
	`ts` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`id`, `ts`)
);
--> statement-breakpoint
CREATE INDEX `app_events_app_ts` ON `app_events` (`app_id`,`ts`);--> statement-breakpoint
CREATE INDEX `app_events_type_ts` ON `app_events` (`event_type`,`ts`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`app_id` text NOT NULL,
	`day` text NOT NULL,
	`event_type` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`app_id`, `day`, `event_type`)
);
--> statement-breakpoint
CREATE INDEX `usage_daily_app_day` ON `usage_daily` (`app_id`,`day`);--> statement-breakpoint
CREATE TABLE `wrapper_push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`keys` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wrapper_push_app` ON `wrapper_push_subscriptions` (`app_id`);--> statement-breakpoint
CREATE TABLE `app_ratings` (
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`review` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`app_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `app_ratings_app_created` ON `app_ratings` (`app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `app_ratings_user_created` ON `app_ratings` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_touch_graph` (
	`app_a` text NOT NULL,
	`app_b` text NOT NULL,
	`users` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`app_a`, `app_b`)
);
--> statement-breakpoint
CREATE INDEX `utg_app_a` ON `user_touch_graph` (`app_a`,`users`);--> statement-breakpoint
CREATE INDEX `utg_app_b` ON `user_touch_graph` (`app_b`,`users`);--> statement-breakpoint
CREATE TABLE `app_access` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`email` text,
	`invited_by` text,
	`granted_at` text DEFAULT (datetime('now')) NOT NULL,
	`revoked_at` text,
	`source` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "app_access_user_or_email" CHECK("app_access"."user_id" is not null or "app_access"."email" is not null)
);
--> statement-breakpoint
CREATE INDEX `app_access_app_active_idx` ON `app_access` (`app_id`);--> statement-breakpoint
CREATE TABLE `app_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`token` text NOT NULL,
	`kind` text NOT NULL,
	`email` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_invites_token_unique` ON `app_invites` (`token`);--> statement-breakpoint
CREATE INDEX `app_invites_app_active_idx` ON `app_invites` (`app_id`);