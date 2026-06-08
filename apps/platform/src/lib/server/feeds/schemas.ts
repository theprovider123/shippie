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

export const FEED_SCHEMAS: Record<string, SchemaValidator> = {
  'golazo.scores.v1': golazoScores,
  'golazo.results.v1': golazoResults,
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
