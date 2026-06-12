/**
 * Feed payload schemas — the ring-fence. Only declared, validated `dataSchema` shapes can be
 * stored. A validator returns a list of human-readable errors (empty = valid). Add new schemas
 * here as apps onboard; a `*.raw.v1` escape hatch accepts any object/array for prototyping.
 */

export type SchemaValidator = (payload: unknown) => string[];

const isObj = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function golazoScores(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (!Array.isArray(payload.live)) errors.push('`live` must be an array');
  else {
    payload.live.forEach((m, i) => {
      if (!isObj(m)) { errors.push(`live[${i}] must be an object`); return; }
      if (typeof m.matchId !== 'string' || !m.matchId) errors.push(`live[${i}].matchId required`);
      if (typeof m.home !== 'string') errors.push(`live[${i}].home required`);
      if (typeof m.away !== 'string') errors.push(`live[${i}].away required`);
      if (!['upcoming', 'live', 'ft'].includes(String(m.status))) errors.push(`live[${i}].status invalid`);
    });
  }
  if (payload.news != null && !Array.isArray(payload.news)) errors.push('`news` must be an array when present');
  return errors;
}

function golazoResults(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (payload.groups != null && !isObj(payload.groups)) errors.push('`groups` must be an object');
  if (payload.knockout != null && !isObj(payload.knockout)) errors.push('`knockout` must be an object');
  return errors;
}

// ── The Cannon (Arsenal fan app) — five season feeds ──

const CANNON_MATCH_ID = /^[a-z0-9-]{1,64}$/;
const CANNON_PHASES = ['idle', 'pre', 'live', 'ht', 'ft'];
const CANNON_VENUES = ['H', 'A', 'N'];
const CANNON_FIXTURE_STATUS = ['scheduled', 'live', 'ft', 'postponed'];
const CANNON_AVAILABILITY = ['fit', 'doubt', 'injured', 'suspended'];

function cannonFixtures(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (typeof payload.season !== 'string' || !payload.season) errors.push('`season` required');
  if (!Array.isArray(payload.fixtures)) {
    errors.push('`fixtures` must be an array');
    return errors;
  }
  payload.fixtures.forEach((f, i) => {
    if (!isObj(f)) { errors.push(`fixtures[${i}] must be an object`); return; }
    if (typeof f.id !== 'string' || !CANNON_MATCH_ID.test(f.id)) errors.push(`fixtures[${i}].id must be slug-shaped`);
    if (typeof f.kickoffUtc !== 'string' || Number.isNaN(Date.parse(f.kickoffUtc))) errors.push(`fixtures[${i}].kickoffUtc must be an ISO timestamp`);
    if (typeof f.opponent !== 'string' || !f.opponent) errors.push(`fixtures[${i}].opponent required`);
    if (!CANNON_VENUES.includes(String(f.venue))) errors.push(`fixtures[${i}].venue must be H|A|N`);
    if (!CANNON_FIXTURE_STATUS.includes(String(f.status))) errors.push(`fixtures[${i}].status invalid`);
    if (f.score != null && !isObj(f.score)) errors.push(`fixtures[${i}].score must be an object when present`);
  });
  if (payload.h2h != null && !isObj(payload.h2h)) errors.push('`h2h` must be an object when present');
  return errors;
}

function cannonMatch(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (!CANNON_PHASES.includes(String(payload.phase))) errors.push('`phase` must be idle|pre|live|ht|ft');
  if (typeof payload.matchId !== 'string' || !CANNON_MATCH_ID.test(payload.matchId)) errors.push('`matchId` must be slug-shaped');
  if (typeof payload.kickoffUtc !== 'string' || Number.isNaN(Date.parse(payload.kickoffUtc))) errors.push('`kickoffUtc` must be an ISO timestamp');
  if (typeof payload.opponent !== 'string' || !payload.opponent) errors.push('`opponent` required');
  if (payload.score != null) {
    if (!isObj(payload.score) || typeof payload.score.home !== 'number' || typeof payload.score.away !== 'number') {
      errors.push('`score` must be {home:number, away:number} when present');
    }
  }
  if (payload.events != null) {
    if (!Array.isArray(payload.events)) errors.push('`events` must be an array when present');
    else payload.events.forEach((e, i) => {
      if (!isObj(e) || typeof e.min !== 'number' || typeof e.type !== 'string') errors.push(`events[${i}] needs {min:number, type:string}`);
    });
  }
  if (payload.lastResult != null && !isObj(payload.lastResult)) errors.push('`lastResult` must be an object when present');
  return errors;
}

function cannonSquad(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (!Array.isArray(payload.players)) return ['`players` must be an array'];
  payload.players.forEach((p, i) => {
    if (!isObj(p)) { errors.push(`players[${i}] must be an object`); return; }
    if (typeof p.id !== 'string' || !p.id) errors.push(`players[${i}].id required`);
    if (typeof p.name !== 'string' || !p.name) errors.push(`players[${i}].name required`);
    if (typeof p.num !== 'number') errors.push(`players[${i}].num must be a number`);
    if (typeof p.pos !== 'string') errors.push(`players[${i}].pos required`);
    if (typeof p.group !== 'string') errors.push(`players[${i}].group required`);
    if (!CANNON_AVAILABILITY.includes(String(p.availability))) errors.push(`players[${i}].availability must be fit|doubt|injured|suspended`);
    if (!isObj(p.stats)) errors.push(`players[${i}].stats must be an object`);
  });
  return errors;
}

function cannonNews(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (!Array.isArray(payload.items)) return ['`items` must be an array'];
  payload.items.forEach((n, i) => {
    if (!isObj(n)) { errors.push(`items[${i}] must be an object`); return; }
    if (typeof n.id !== 'string' || !n.id) errors.push(`items[${i}].id required`);
    if (typeof n.title !== 'string' || !n.title) errors.push(`items[${i}].title required`);
    if (typeof n.summary !== 'string' || !n.summary) errors.push(`items[${i}].summary required (own words, never wholesale copy)`);
    if (typeof n.url !== 'string' || !/^https?:\/\//.test(String(n.url))) errors.push(`items[${i}].url must be an http(s) link`);
    if (typeof n.source !== 'string' || !n.source) errors.push(`items[${i}].source required`);
    if (typeof n.publishedAt !== 'string' || Number.isNaN(Date.parse(n.publishedAt))) errors.push(`items[${i}].publishedAt must be an ISO timestamp`);
  });
  return errors;
}

function cannonClub(payload: unknown): string[] {
  if (!isObj(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  if (!Array.isArray(payload.trophies)) errors.push('`trophies` must be an array');
  if (payload.thisDay != null && !isObj(payload.thisDay)) errors.push('`thisDay` must be an object keyed MM-DD');
  if (payload.lastSeason != null && !isObj(payload.lastSeason)) errors.push('`lastSeason` must be an object when present');
  return errors;
}

export const FEED_SCHEMAS: Record<string, SchemaValidator> = {
  'golazo.scores.v1': golazoScores,
  'golazo.results.v1': golazoResults,
  'cannon.fixtures.v1': cannonFixtures,
  'cannon.match.v1': cannonMatch,
  'cannon.squad.v1': cannonSquad,
  'cannon.news.v1': cannonNews,
  'cannon.club.v1': cannonClub,
};

/** Validate a payload against its declared dataSchema. Returns errors ([] = valid). */
export function validateFeedPayload(dataSchema: string, payload: unknown): string[] {
  if (dataSchema.endsWith('.raw.v1')) {
    return isObj(payload) || Array.isArray(payload) ? [] : ['payload must be an object or array'];
  }
  const validator = FEED_SCHEMAS[dataSchema];
  if (!validator) return [`unknown dataSchema: ${dataSchema}`];
  return validator(payload);
}

export function isKnownSchema(dataSchema: string): boolean {
  return dataSchema.endsWith('.raw.v1') || dataSchema in FEED_SCHEMAS;
}
