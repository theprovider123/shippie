-- Private-app instance erasure marker — compliance + trust (Uniti Phase 9)
--
-- `deprovision(instanceId, 'erase')` purges the school's SchoolWorkspace
-- Durable Object (its SQLite contents + DO storage) and removes the
-- space_apps install record, but KEEPS the control-plane row as a tombstone
-- with `erased_at` set, so the data-boundary erasure is provable + auditable.
--
-- Control-plane only — still NO pupil/school data here.

ALTER TABLE `private_app_instances` ADD COLUMN `erased_at` integer;
