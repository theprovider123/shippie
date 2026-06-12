-- 2026-06-12 arcade roster updates.
--
-- Docklands graduates from the private demo shelf: it joins the Arcade
-- cabinet AND stays standalone (no slug alias), so its row surfaces on the
-- arcade shelf. Crossing was rebuilt as a full Frogger game; its row was
-- unlisted/archived from before the games consolidation — align it with
-- the other cabinet games (public; direct URLs 302 into /arcade via
-- SLUG_ALIASES regardless).

UPDATE apps
SET
  surface = 'arcade',
  visibility_scope = 'public',
  updated_at = datetime('now')
WHERE slug IN ('docklands', 'crossing');
