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
  match_id?: string | null;
  status?: string;
  report_count?: number;
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

export interface ReportRec {
  take_id: string;
  anon_key: string;
  reason: string;
  created_at: number;
}

export interface PredictionRec {
  match_id: string;
  anon_key: string;
  pick: string;
  created_at: number;
}

export function fakeCannonDb(seed: {
  takes?: TakeRec[];
  votes?: VoteRec[];
  gauge?: GaugeRec[];
  reports?: ReportRec[];
  predictions?: PredictionRec[];
} = {}) {
  const takes: TakeRec[] = [...(seed.takes ?? [])];
  const votes: VoteRec[] = [...(seed.votes ?? [])];
  const gauge: GaugeRec[] = [...(seed.gauge ?? [])];
  const reports: ReportRec[] = [...(seed.reports ?? [])];
  const predictions: PredictionRec[] = [...(seed.predictions ?? [])];

  const statusOf = (t: TakeRec) => t.status ?? 'visible';

  function all(sql: string, args: unknown[]): unknown[] {
    if (sql.includes('FROM cannon_takes WHERE')) {
      // The takes list: WHERE status = 'visible' [AND thread = ?] [AND match_id = ?] LIMIT ?
      let rows = takes.filter((t) => statusOf(t) === 'visible');
      let i = 0;
      if (sql.includes('thread = ?')) {
        const th = args[i++];
        rows = rows.filter((t) => t.thread === th);
      }
      if (sql.includes('match_id = ?')) {
        const m = args[i++];
        rows = rows.filter((t) => t.match_id === m);
      }
      const limit = args[i] as number;
      return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
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
    if (sql.includes('SELECT pick, COUNT(*)')) {
      const counts = new Map<string, number>();
      for (const p of predictions) {
        if (p.match_id === args[0]) counts.set(p.pick, (counts.get(p.pick) ?? 0) + 1);
      }
      return [...counts.entries()].map(([pick, n]) => ({ pick, n }));
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
    if (sql.includes('SELECT id, status FROM cannon_takes WHERE id')) {
      const t = takes.find((t) => t.id === args[0]);
      return t ? { id: t.id, status: statusOf(t) } : null;
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
    if (sql.includes('SELECT COUNT(*) AS n FROM cannon_reports')) {
      return { n: reports.filter((r) => r.take_id === args[0]).length };
    }
    if (sql.includes('SELECT pick FROM cannon_predictions')) {
      const p = predictions.find((p) => p.match_id === args[0] && p.anon_key === args[1]);
      return p ? { pick: p.pick } : null;
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
        match_id: (args[5] as string | null) ?? null,
        status: 'visible',
        report_count: 0,
        up: 0,
        down: 0,
        created_at: args[6] as number,
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
    if (sql.includes('INSERT OR IGNORE INTO cannon_reports')) {
      const exists = reports.some((r) => r.take_id === args[0] && r.anon_key === args[1]);
      if (!exists) {
        reports.push({
          take_id: args[0] as string,
          anon_key: args[1] as string,
          reason: args[2] as string,
          created_at: args[3] as number,
        });
      }
      return;
    }
    if (sql.includes('UPDATE cannon_takes SET report_count')) {
      const t = takes.find((t) => t.id === args[0]);
      if (t) {
        t.report_count = args[1] as number;
        if (sql.includes("status = 'hidden'")) t.status = 'hidden';
      }
      return;
    }
    if (sql.includes('DELETE FROM cannon_predictions')) {
      const i = predictions.findIndex((p) => p.match_id === args[0] && p.anon_key === args[1]);
      if (i >= 0) predictions.splice(i, 1);
      return;
    }
    if (sql.includes('INSERT INTO cannon_predictions')) {
      const existing = predictions.find((p) => p.match_id === args[0] && p.anon_key === args[1]);
      if (existing) {
        existing.pick = args[2] as string;
        existing.created_at = args[3] as number;
      } else {
        predictions.push({
          match_id: args[0] as string,
          anon_key: args[1] as string,
          pick: args[2] as string,
          created_at: args[3] as number,
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
    reports,
    predictions,
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
