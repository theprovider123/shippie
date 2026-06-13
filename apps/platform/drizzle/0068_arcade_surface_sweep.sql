-- 2026-06-13 — Surface guard backfill.
--
-- surface='arcade' is now honored only for baked first-party arcade games
-- (apps/showcase-*/shippie.json curation.surface='arcade'). Any other app
-- that currently holds surface='arcade' in D1 (e.g. a maker/remix that
-- self-declared it before the guard existed) is downgraded to 'featured'.
-- The allowlist below mirrors the generated first-party-curation arcade set
-- at authoring time; new arcade games added later are baked and unaffected.

UPDATE apps
SET surface = 'featured', updated_at = datetime('now')
WHERE surface = 'arcade'
  AND slug NOT IN (
    'block-drop','bricks','bulwark','chess','crossing','daily-puzzle',
    'drawing-telephone','drift','five-letter','invaders','lustre','maze',
    'memory-grid','quartet','reaction','snake','stack','sudoku',
    'world-cup-fantasy','would-you-rather','docklands'
  );
