ALTER TABLE apps ADD COLUMN current_pwa_readiness text;
ALTER TABLE apps ADD COLUMN current_pwa_readiness_reasons text DEFAULT '[]' NOT NULL;
ALTER TABLE apps ADD COLUMN current_pwa_readiness_checked_at integer;
