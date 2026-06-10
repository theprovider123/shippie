-- The Cannon — Arsenal Fan OS. Community tables for the Terrace takes feed,
-- take votes, and the post-match Gauge. Prefixed cannon_* in the shared
-- platform D1 per convention. Identity is the app-issued anonymous key
-- (golazo playerKey idiom) — never a platform session.

CREATE TABLE cannon_takes (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  thread TEXT NOT NULL DEFAULT 'MATCH',
  text TEXT NOT NULL,
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX cannon_takes_created_idx ON cannon_takes (created_at DESC);
--> statement-breakpoint
CREATE INDEX cannon_takes_thread_idx ON cannon_takes (thread, created_at DESC);
--> statement-breakpoint
CREATE TABLE cannon_votes (
  take_id TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  dir INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (take_id, anon_key)
);
--> statement-breakpoint
CREATE TABLE cannon_gauge (
  match_id TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  rating INTEGER,
  mood TEXT,
  moment TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, anon_key)
);
--> statement-breakpoint
CREATE INDEX cannon_gauge_match_idx ON cannon_gauge (match_id);
--> statement-breakpoint
-- Seed: the seven launch takes from the design source. Vote counters are
-- baselines; live votes apply deltas on top (cannon_votes rows are only
-- created for real voters).
INSERT OR IGNORE INTO cannon_takes (id, handle, anon_key, thread, text, up, down, created_at) VALUES
  ('seed-1', 'WembleyWillis',   'seed', 'MATCH',    'Rice has been the most underrated title-winning midfielder in Premier League history. Every single pundit wrote him off in September. Every. Single. One. Absolute class.',          1247, 34,  1781099880000),
  ('seed-2', 'NorthBankNelson', 'seed', 'MATCH',    'I''ve been going to the Emirates since it opened and I''ve never felt what I felt on the last day of 25/26. That wasn''t football. That was twenty-two years of hurt ending at once.',     2341, 58,  1781099520000),
  ('seed-3', 'ClockEndCyrus',   'seed', 'ANALYSIS', 'Can we talk about the fact that Arteta has genuinely become the best gaffer in the world? Not top five. Not top three. The actual best. Nobody is building a club like this.',             567,  89,  1781099100000),
  ('seed-4', 'HighburyHarold',  'seed', 'ANALYSIS', 'Proper worried, me. City have brought in two world-class players and we''ve announced nobody. The window opened six days ago. Clock''s ticking. Someone please reassure me.',             234,  312, 1781098680000),
  ('seed-5', 'GunnerGrace',     'seed', 'MATCH',    'The Community Shield has historically meant nothing and yet I absolutely need us to batter City before the season even starts for my own mental health. That''s just where we are now.', 891,  67,  1781097960000),
  ('seed-6', 'IslingtonIvan',   'seed', 'HISTORY',  'Look up the 1989 table on the last day of the season. Needed to beat Liverpool by two at Anfield. Nobody gave us a chance. Thomas. One minute to go. This is what Arsenal is.',          3102, 41,  1781096400000),
  ('seed-7', 'AshburtonAlex',   'seed', 'ANALYSIS', 'If Saka signs his extension this summer I will personally write him a letter thanking him. The fact he''s stayed says everything about what Arteta has built here. Loyalty.',              744,  55,  1781092800000);
--> statement-breakpoint
-- Seed: Gauge baseline for the most recent result (Arsenal 2–1 Newcastle).
-- 25 ratings averaging exactly 7.4 with a mood split mirroring the design
-- read (buzzing 38 / relieved 29 / anxious 22 / frustrated 11).
INSERT OR IGNORE INTO cannon_gauge (match_id, anon_key, rating, mood, moment, updated_at) VALUES
  ('arsenal-newcastle-2026-05', 'seed-01', 6, 'anxious',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-02', 6, 'anxious',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-03', 6, 'frustrated', NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-04', 6, 'anxious',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-05', 6, 'frustrated', NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-06', 7, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-07', 7, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-08', 7, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-09', 7, 'anxious',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-10', 7, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-11', 7, 'frustrated', NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-12', 7, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-13', 7, 'anxious',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-14', 7, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-15', 8, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-16', 8, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-17', 8, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-18', 8, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-19', 8, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-20', 8, 'relieved',   NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-21', 8, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-22', 9, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-23', 9, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-24', 9, 'buzzing',    NULL, 1781000000000),
  ('arsenal-newcastle-2026-05', 'seed-25', 9, NULL,         NULL, 1781000000000);
