-- Behavior-delta monitoring (Phase 4 of maker-app safety). Per-version
-- { profile, delta } vs the previous active deploy; informational only,
-- surfaced in /admin/updates. See the maker-app-safety-enforcement plan.
ALTER TABLE `deploys` ADD COLUMN `behavior_delta_json` text;
