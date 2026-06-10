import type { Take } from '../lib/types';

/**
 * The seven launch takes — same content as D1 migration 0060's seed rows,
 * used as the offline floor when neither the API nor a cached snapshot is
 * reachable. Timestamps are relative so the feed always reads fresh
 * (2m / 8m / 15m / 22m / 34m / 1h / 2h, exactly the design's beats).
 */
const NOW = Date.now();
const MIN = 60_000;

export const SEED_TAKES: Take[] = [
  {
    id: 'seed-1',
    handle: 'WembleyWillis',
    thread: 'MATCH',
    text: 'Rice has been the most underrated title-winning midfielder in Premier League history. Every single pundit wrote him off in September. Every. Single. One. Absolute class.',
    up: 1247,
    down: 34,
    createdAt: NOW - 2 * MIN,
    myVote: null,
  },
  {
    id: 'seed-2',
    handle: 'NorthBankNelson',
    thread: 'MATCH',
    text: "I've been going to the Emirates since it opened and I've never felt what I felt on the last day of 25/26. That wasn't football. That was twenty-two years of hurt ending at once.",
    up: 2341,
    down: 58,
    createdAt: NOW - 8 * MIN,
    myVote: null,
  },
  {
    id: 'seed-3',
    handle: 'ClockEndCyrus',
    thread: 'ANALYSIS',
    text: 'Can we talk about the fact that Arteta has genuinely become the best gaffer in the world? Not top five. Not top three. The actual best. Nobody is building a club like this.',
    up: 567,
    down: 89,
    createdAt: NOW - 15 * MIN,
    myVote: null,
  },
  {
    id: 'seed-4',
    handle: 'HighburyHarold',
    thread: 'ANALYSIS',
    text: "Proper worried, me. City have brought in two world-class players and we've announced nobody. The window opened six days ago. Clock's ticking. Someone please reassure me.",
    up: 234,
    down: 312,
    createdAt: NOW - 22 * MIN,
    myVote: null,
  },
  {
    id: 'seed-5',
    handle: 'GunnerGrace',
    thread: 'MATCH',
    text: "The Community Shield has historically meant nothing and yet I absolutely need us to batter City before the season even starts for my own mental health. That's just where we are now.",
    up: 891,
    down: 67,
    createdAt: NOW - 34 * MIN,
    myVote: null,
  },
  {
    id: 'seed-6',
    handle: 'IslingtonIvan',
    thread: 'HISTORY',
    text: 'Look up the 1989 table on the last day of the season. Needed to beat Liverpool by two at Anfield. Nobody gave us a chance. Thomas. One minute to go. This is what Arsenal is.',
    up: 3102,
    down: 41,
    createdAt: NOW - 60 * MIN,
    myVote: null,
  },
  {
    id: 'seed-7',
    handle: 'AshburtonAlex',
    thread: 'ANALYSIS',
    text: "If Saka signs his extension this summer I will personally write him a letter thanking him. The fact he's stayed says everything about what Arteta has built here. Loyalty.",
    up: 744,
    down: 55,
    createdAt: NOW - 120 * MIN,
    myVote: null,
  },
];
