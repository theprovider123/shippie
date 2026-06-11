-- Keep the DB-backed marketplace row aligned with curatedAppSpecs.
-- The Cannon is an intimate/social fan-room app, not a sports utility.

UPDATE apps
SET
  category = 'social',
  updated_at = datetime('now')
WHERE slug = 'cannon';
