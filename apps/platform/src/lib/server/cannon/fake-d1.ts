/**
 * In-memory fake of the D1 surface the /api/cannon/* routes touch.
 * Test-only: pattern-matches the exact SQL those routes issue, so a change
 * to a route's SQL must be mirrored here (the route tests will fail loudly
 * if a statement goes unrecognised).
 */

export interface TakeRec {
  id: string;
  handle: string;
  anon_key: string;
  thread: string;
  text: string;
  up: number;
  down: number;
  created_at: number;
}

export interface VoteRec {
  take_id: string;
  anon_key: string;
  dir: number;
  created_at: number;
}

export interface GaugeRec {
  match_id: string;
  anon_key: string;
  rating: number | null;
  mood: string | null;
  moment: string | null;
  updated_at: number;
}

export function fakeCannonDb(seed: {
  takes?: TakeRec[];
  votes?: VoteRec[];
  gauge?: GaugeRec[];
} = {}) {
  const takes: TakeRec[] = [...(seed.takes ?? [])];
  const votes: VoteRec[] = [...(seed.votes ?? [])];
  const gauge: GaugeRec[] = [...(seed.gauge ?? [])];

  function all(sql: string, args: unknown[]): unknown[] {
    if (sql.includes('FROM cannon_takes WHERE thread')) {
      return takes
        .filter((t) => t.thread === args[0])
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, args[1] as number);
    }
    if (sql.includes('FROM cannon_takes ORDER BY created_at')) {
      return [...takes].sort((a, b) => b.created_at - a.created_at).slice(0, args[0] as number);
    }
    if (sql.includes('SELECT take_id, dir FROM cannon_votes')) {
      const ids = new Set(args.slice(1) as string[]);
      return votes
        .filter((v) => v.anon_key === args[0] && ids.has(v.take_id))
        .map((v) => ({ take_id: v.take_id, dir: v.dir }));
    }
    if (sql.includes('SELECT mood, COUNT(*)')) {
      const counts = new Map<string, number>();
      for (const g of gauge) {
        if (g.match_id === args[0] && g.mood != null) {
          counts.set(g.mood, (counts.get(g.mood) ?? 0) + 1);
        }
      }
      return [...counts.entries()].map(([mood, n]) => ({ mood, n }));
    }
    throw new Error(`fakeCannonDb: unrecognised all() SQL: ${sql}`);
  }

  function first(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT created_at FROM cannon_takes WHERE anon_key')) {
      const mine = takes
        .filter((t) => t.anon_key === args[0])
        .sort((a, b) => b.created_at - a.created_at);
      return mine.length > 0 ? { created_at: mine[0].created_at } : null;
    }
    if (sql.includes('SELECT id FROM cannon_takes WHERE id')) {
      const t = takes.find((t) => t.id === args[0]);
      return t ? { id: t.id } : null;
    }
    if (sql.includes('SELECT up, down FROM cannon_takes WHERE id')) {
      const t = takes.find((t) => t.id === args[0]);
      return t ? { up: t.up, down: t.down } : null;
    }
    if (sql.includes('SELECT dir FROM cannon_votes')) {
      const v = votes.find((v) => v.take_id === args[0] && v.anon_key === args[1]);
      return v ? { dir: v.dir } : null;
    }
    if (sql.includes('ROUND(AVG(rating)')) {
      const rated = gauge.filter((g) => g.match_id === args[0] && g.rating != null);
      if (rated.length === 0) return { avg: null, count: 0 };
      const avg =
        Math.round((rated.reduce((s, g) => s + (g.rating as number), 0) / rated.length) * 10) / 10;
      return { avg, count: rated.length };
    }
    if (sql.includes('SELECT rating, mood, moment FROM cannon_gauge')) {
      const g = gauge.find((g) => g.match_id === args[0] && g.anon_key === args[1]);
      return g ? { rating: g.rating, mood: g.mood, moment: g.moment } : null;
    }
    throw new Error(`fakeCannonDb: unrecognised first() SQL: ${sql}`);
  }

  function run(sql: string, args: unknown[]): void {
    if (sql.includes('INSERT INTO cannon_takes')) {
      takes.push({
        id: args[0] as string,
        handle: args[1] as string,
        anon_key: args[2] as string,
        thread: args[3] as string,
        text: args[4] as string,
        up: 0,
        down: 0,
        created_at: args[5] as number,
      });
      return;
    }
    if (sql.includes('DELETE FROM cannon_votes')) {
      const i = votes.findIndex((v) => v.take_id === args[0] && v.anon_key === args[1]);
      if (i >= 0) votes.splice(i, 1);
      return;
    }
    if (sql.includes('INSERT INTO cannon_votes')) {
      const existing = votes.find((v) => v.take_id === args[0] && v.anon_key === args[1]);
      if (existing) {
        existing.dir = args[2] as number;
        existing.created_at = args[3] as number;
      } else {
        votes.push({
          take_id: args[0] as string,
          anon_key: args[1] as string,
          dir: args[2] as number,
          created_at: args[3] as number,
        });
      }
      return;
    }
    if (sql.includes('UPDATE cannon_takes SET up = MAX')) {
      const t = takes.find((t) => t.id === args[0]);
      if (t) {
        t.up = Math.max(0, t.up + (args[1] as number));
        t.down = Math.max(0, t.down + (args[2] as number));
      }
      return;
    }
    if (sql.includes('INSERT INTO cannon_gauge')) {
      const existing = gauge.find((g) => g.match_id === args[0] && g.anon_key === args[1]);
      if (existing) {
        existing.rating = args[2] as number | null;
        existing.mood = args[3] as string | null;
        existing.moment = args[4] as string | null;
        existing.updated_at = args[5] as number;
      } else {
        gauge.push({
          match_id: args[0] as string,
          anon_key: args[1] as string,
          rating: args[2] as number | null,
          mood: args[3] as string | null,
          moment: args[4] as string | null,
          updated_at: args[5] as number,
        });
      }
      return;
    }
    throw new Error(`fakeCannonDb: unrecognised run() SQL: ${sql}`);
  }

  function statement(sql: string, args: unknown[]) {
    return {
      all: async () => ({ results: all(sql, args) }),
      first: async () => first(sql, args),
      run: async () => {
        run(sql, args);
        return {};
      },
    };
  }

  return {
    takes,
    votes,
    gauge,
    prepare(sql: string) {
      return {
        ...statement(sql, []),
        bind: (...args: unknown[]) => statement(sql, args),
      };
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}
