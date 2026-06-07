/**
 * MIS / roster sync — the reusable data-source layer (Phase 7).
 *
 * `DataSourceAdapter` is the ONE interface every roster source implements:
 * a CSV upload, hand-entered pupils, or a live MIS (Wonde first; Arbor / SIMS /
 * Bromcom later, all behind the SAME shape). App code never special-cases the
 * provider — it asks an adapter for normalised staff / pupils / classes /
 * memberships / groups / learner-flags and feeds them through the sync engine.
 *
 * This module is PURE (no I/O, no fetch, no Cloudflare primitives) — it holds
 * the interface, the normalised domain shapes, a pure CSV roster PARSER, and a
 * pure DIFF function (preview: adds / updates / deactivations) — so it is
 * Node-unit-tested with sample CSV fixtures, exactly like `WorkspaceStore`.
 * The HTTP-bound adapters (Wonde) and the apply-to-DO wiring live server-side.
 */

// ── Normalised domain shapes ───────────────────────────────────────────────
// These map 1:1 to the school workspace domain (pupils w/ SEND/EAL/FSM,
// classes, class memberships) so an import is a pure transform, not a guess.

/** A normalised staff member (teacher / TA / leader / office). */
export interface NormalisedStaff {
  /** Stable source id (MIS id, or derived from CSV email/row). */
  sourceId: string;
  name: string;
  email: string | null;
  /** Free-text role hint from the source (mapped to a cloudlet Role on apply). */
  roleHint: string | null;
}

/** A normalised pupil with the inclusion flags the domain reasons over. */
export interface NormalisedPupil {
  sourceId: string;
  name: string;
  /** Display initials; derived from `name` when the source omits them. */
  initials: string;
  send: boolean;
  eal: boolean;
  fsm: boolean;
}

/** A normalised teaching class / group container. */
export interface NormalisedClass {
  sourceId: string;
  name: string; // "4M"
  yearGroup: string; // "Year 4"
  room: string;
}

/** A pupil↔class membership edge. */
export interface NormalisedMembership {
  classSourceId: string;
  pupilSourceId: string;
}

/** A non-registration grouping (intervention set, SEND register, etc.). */
export interface NormalisedGroup {
  sourceId: string;
  name: string;
  kind: string; // 'intervention' | 'send' | 'custom' …
  pupilSourceIds: string[];
}

/** Per-pupil learner flags, kept separate so a flags-only refresh is cheap. */
export interface NormalisedLearnerFlags {
  pupilSourceId: string;
  send: boolean;
  eal: boolean;
  fsm: boolean;
}

/** Everything an adapter can surface, normalised. The sync engine applies it. */
export interface NormalisedRoster {
  staff: NormalisedStaff[];
  pupils: NormalisedPupil[];
  classes: NormalisedClass[];
  memberships: NormalisedMembership[];
  groups: NormalisedGroup[];
  learnerFlags: NormalisedLearnerFlags[];
}

/**
 * The reusable data-source contract. Every method is independently fetchable so
 * a flags-only refresh doesn't re-pull the whole roster. A source that cannot
 * supply a category returns `[]` (never throws) — CSV has no groups, manual has
 * no staff, etc. `isConfigured()` lets the UI show data-source status and lets
 * a not-yet-registered MIS resolve to "not connected" rather than crashing.
 */
export interface DataSourceAdapter {
  /** Stable provider key — 'manual' | 'csv' | 'wonde'. */
  readonly source: string;
  /** True when the adapter can actually run (e.g. Wonde key + school id set). */
  isConfigured(): boolean;
  fetchStaff(): Promise<NormalisedStaff[]>;
  fetchPupils(): Promise<NormalisedPupil[]>;
  fetchClasses(): Promise<NormalisedClass[]>;
  fetchMemberships(): Promise<NormalisedMembership[]>;
  fetchGroups(): Promise<NormalisedGroup[]>;
  fetchLearnerFlags(): Promise<NormalisedLearnerFlags[]>;
}

/** Pull every category into one normalised roster (parallel). */
export async function fetchNormalisedRoster(
  adapter: DataSourceAdapter,
): Promise<NormalisedRoster> {
  const [staff, pupils, classes, memberships, groups, learnerFlags] = await Promise.all([
    adapter.fetchStaff(),
    adapter.fetchPupils(),
    adapter.fetchClasses(),
    adapter.fetchMemberships(),
    adapter.fetchGroups(),
    adapter.fetchLearnerFlags(),
  ]);
  return { staff, pupils, classes, memberships, groups, learnerFlags };
}

// ── CSV roster parser (pure) ───────────────────────────────────────────────
// A single wide CSV row = one pupil + their class + their flags. Column mapping
// is forgiving (case/space/synonym-insensitive) but errors clearly on bad rows.

/** Synonyms accepted for each logical column (lower-cased, trimmed). */
const COLUMN_ALIASES: Record<string, string[]> = {
  pupilName: ['pupil', 'pupil name', 'name', 'student', 'student name', 'full name'],
  pupilId: ['pupil id', 'upn', 'admission number', 'adno', 'student id', 'id'],
  className: ['class', 'class name', 'reg class', 'registration group', 'form'],
  yearGroup: ['year', 'year group', 'yr', 'nc year'],
  room: ['room', 'classroom'],
  send: ['send', 'sen', 'send status'],
  eal: ['eal'],
  fsm: ['fsm', 'free school meals', 'pp', 'pupil premium'],
};

/** A truthy flag cell — 'y','yes','true','1','x' all mean "set". */
function parseFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'y' || v === 'yes' || v === 'true' || v === '1' || v === 'x';
}

/** Two-letter initials from a name ("Aisha Khan" → "AK", "Leo" → "LE"). */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export interface CsvParseError {
  /** 1-based data row number (excludes the header row). */
  row: number;
  message: string;
}

export interface CsvParseResult {
  roster: NormalisedRoster;
  errors: CsvParseError[];
  /** Logical→actual header mapping resolved from the CSV's first row. */
  columnMap: Partial<Record<keyof typeof COLUMN_ALIASES, string>>;
}

/** Split one CSV line, honouring double-quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parse a CSV roster into the normalised shape. Tolerant column mapping; one
 * row = one pupil (+ their class + flags). Malformed rows are SKIPPED and
 * reported in `errors` (clear message + row number) — the parse never throws on
 * bad data, so a good roster still imports past a few broken lines.
 *
 * REQUIRED columns: a pupil name + a class name. A pupil with no source id gets
 * a stable derived id (`${className}:${pupilName}`) so re-imports are diffable.
 */
export function parseCsvRoster(csv: string): CsvParseResult {
  const errors: CsvParseError[] = [];
  const empty: CsvParseResult = {
    roster: { staff: [], pupils: [], classes: [], memberships: [], groups: [], learnerFlags: [] },
    errors,
    columnMap: {},
  };

  const lines = csv.split(/\r\n|\n|\r/);
  // Drop trailing blank lines.
  while (lines.length && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  const headerLine = lines[0] ?? '';
  if (lines.length === 0 || headerLine.trim() === '') {
    errors.push({ row: 0, message: 'empty file: no header row found' });
    return empty;
  }

  const header = splitCsvLine(headerLine).map((h) => h.toLowerCase());
  const columnMap: CsvParseResult['columnMap'] = {};
  for (const [logical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h));
    if (idx >= 0) columnMap[logical as keyof typeof COLUMN_ALIASES] = header[idx] ?? '';
  }
  const col = (logical: keyof typeof COLUMN_ALIASES): number => {
    const actual = columnMap[logical];
    return actual ? header.indexOf(actual) : -1;
  };

  const iName = col('pupilName');
  const iClass = col('className');
  if (iName < 0 || iClass < 0) {
    const missing = [iName < 0 ? 'pupil name' : null, iClass < 0 ? 'class' : null].filter(Boolean);
    errors.push({ row: 0, message: `missing required column(s): ${missing.join(', ')}` });
    return { ...empty, columnMap };
  }
  const iId = col('pupilId');
  const iYear = col('yearGroup');
  const iRoom = col('room');
  const iSend = col('send');
  const iEal = col('eal');
  const iFsm = col('fsm');

  const pupils = new Map<string, NormalisedPupil>();
  const classes = new Map<string, NormalisedClass>();
  const memberships: NormalisedMembership[] = [];
  const learnerFlags: NormalisedLearnerFlags[] = [];
  const seenMembership = new Set<string>();

  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitCsvLine(lines[r] ?? '');
    const dataRow = r; // 1-based data row (header is row 0)
    const pupilName = (cells[iName] ?? '').trim();
    const className = (cells[iClass] ?? '').trim();
    if (pupilName === '' && className === '') continue; // wholly blank line — skip silently
    if (pupilName === '') {
      errors.push({ row: dataRow, message: 'missing pupil name' });
      continue;
    }
    if (className === '') {
      errors.push({ row: dataRow, message: `missing class for "${pupilName}"` });
      continue;
    }

    const classSourceId = className;
    if (!classes.has(classSourceId)) {
      classes.set(classSourceId, {
        sourceId: classSourceId,
        name: className,
        yearGroup: (iYear >= 0 ? cells[iYear] : '')?.trim() || '',
        room: (iRoom >= 0 ? cells[iRoom] : '')?.trim() || '',
      });
    }

    const rawId = iId >= 0 ? (cells[iId] ?? '').trim() : '';
    const pupilSourceId = rawId !== '' ? rawId : `${classSourceId}:${pupilName}`;
    const send = parseFlag(iSend >= 0 ? cells[iSend] : undefined);
    const eal = parseFlag(iEal >= 0 ? cells[iEal] : undefined);
    const fsm = parseFlag(iFsm >= 0 ? cells[iFsm] : undefined);

    if (!pupils.has(pupilSourceId)) {
      pupils.set(pupilSourceId, {
        sourceId: pupilSourceId,
        name: pupilName,
        initials: initialsFrom(pupilName),
        send,
        eal,
        fsm,
      });
      learnerFlags.push({ pupilSourceId, send, eal, fsm });
    }

    const mKey = `${classSourceId}::${pupilSourceId}`;
    if (!seenMembership.has(mKey)) {
      seenMembership.add(mKey);
      memberships.push({ classSourceId, pupilSourceId });
    }
  }

  return {
    roster: {
      staff: [],
      pupils: [...pupils.values()],
      classes: [...classes.values()],
      memberships,
      groups: [],
      learnerFlags,
    },
    errors,
    columnMap,
  };
}

// ── Import diff / preview (pure) ────────────────────────────────────────────
// The current workspace snapshot vs the incoming roster → adds / updates /
// deactivations. NOTHING is hard-deleted: a pupil/class present now but absent
// from the import is a DEACTIVATION (tombstone), never a delete, so historic
// feedback survives. This preview is shown BEFORE apply.

/** The workspace's current roster snapshot, used as the diff baseline. */
export interface RosterSnapshot {
  pupils: Array<{ id: string; name: string; send: boolean; eal: boolean; fsm: boolean; active: boolean }>;
  classes: Array<{ id: string; name: string; yearGroup: string; room: string; active: boolean }>;
  memberships: Array<{ classId: string; pupilId: string }>;
}

export interface PupilChange {
  sourceId: string;
  name: string;
  /** Field-level deltas for an update (old→new), empty for an add. */
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}

export interface RosterDiff {
  pupils: {
    adds: NormalisedPupil[];
    updates: PupilChange[];
    deactivations: Array<{ id: string; name: string }>;
    reactivations: Array<{ id: string; name: string }>;
  };
  classes: {
    adds: NormalisedClass[];
    updates: Array<{ sourceId: string; name: string; changes: Array<{ field: string; from: unknown; to: unknown }> }>;
    deactivations: Array<{ id: string; name: string }>;
    reactivations: Array<{ id: string; name: string }>;
  };
  memberships: {
    adds: NormalisedMembership[];
    removes: NormalisedMembership[];
  };
  /** True when nothing changes — UI shows "already up to date". */
  empty: boolean;
}

/**
 * Compute the import preview diff. Source ids are matched 1:1 against existing
 * workspace ids (the import keeps the source's id as the workspace id, so a
 * re-import is stable). Server/MIS WINS for roster: an incoming change updates;
 * a present-but-now-absent entity DEACTIVATES (never deletes); an absent-but-now-
 * present-again entity REACTIVATES. Pure + deterministic.
 */
export function computeRosterDiff(
  snapshot: RosterSnapshot,
  roster: NormalisedRoster,
): RosterDiff {
  const exPupils = new Map(snapshot.pupils.map((p) => [p.id, p]));
  const exClasses = new Map(snapshot.classes.map((c) => [c.id, c]));
  const inPupils = new Map(roster.pupils.map((p) => [p.sourceId, p]));
  const inClasses = new Map(roster.classes.map((c) => [c.sourceId, c]));

  const pupilAdds: NormalisedPupil[] = [];
  const pupilUpdates: PupilChange[] = [];
  const pupilReact: Array<{ id: string; name: string }> = [];
  for (const p of roster.pupils) {
    const ex = exPupils.get(p.sourceId);
    if (!ex) {
      pupilAdds.push(p);
      continue;
    }
    const changes: PupilChange['changes'] = [];
    if (ex.name !== p.name) changes.push({ field: 'name', from: ex.name, to: p.name });
    if (ex.send !== p.send) changes.push({ field: 'send', from: ex.send, to: p.send });
    if (ex.eal !== p.eal) changes.push({ field: 'eal', from: ex.eal, to: p.eal });
    if (ex.fsm !== p.fsm) changes.push({ field: 'fsm', from: ex.fsm, to: p.fsm });
    if (changes.length) pupilUpdates.push({ sourceId: p.sourceId, name: p.name, changes });
    if (!ex.active) pupilReact.push({ id: p.sourceId, name: p.name });
  }
  const pupilDeact = snapshot.pupils
    .filter((p) => p.active && !inPupils.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  const classAdds: NormalisedClass[] = [];
  const classUpdates: RosterDiff['classes']['updates'] = [];
  const classReact: Array<{ id: string; name: string }> = [];
  for (const c of roster.classes) {
    const ex = exClasses.get(c.sourceId);
    if (!ex) {
      classAdds.push(c);
      continue;
    }
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (ex.name !== c.name) changes.push({ field: 'name', from: ex.name, to: c.name });
    if (ex.yearGroup !== c.yearGroup) changes.push({ field: 'yearGroup', from: ex.yearGroup, to: c.yearGroup });
    if (ex.room !== c.room) changes.push({ field: 'room', from: ex.room, to: c.room });
    if (changes.length) classUpdates.push({ sourceId: c.sourceId, name: c.name, changes });
    if (!ex.active) classReact.push({ id: c.sourceId, name: c.name });
  }
  const classDeact = snapshot.classes
    .filter((c) => c.active && !inClasses.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  const exMembership = new Set(snapshot.memberships.map((m) => `${m.classId}::${m.pupilId}`));
  const inMembership = new Set(roster.memberships.map((m) => `${m.classSourceId}::${m.pupilSourceId}`));
  const membershipAdds = roster.memberships.filter(
    (m) => !exMembership.has(`${m.classSourceId}::${m.pupilSourceId}`),
  );
  const membershipRemoves = snapshot.memberships
    .filter((m) => !inMembership.has(`${m.classId}::${m.pupilId}`))
    .map((m) => ({ classSourceId: m.classId, pupilSourceId: m.pupilId }));

  const empty =
    pupilAdds.length === 0 &&
    pupilUpdates.length === 0 &&
    pupilDeact.length === 0 &&
    pupilReact.length === 0 &&
    classAdds.length === 0 &&
    classUpdates.length === 0 &&
    classDeact.length === 0 &&
    classReact.length === 0 &&
    membershipAdds.length === 0 &&
    membershipRemoves.length === 0;

  return {
    pupils: { adds: pupilAdds, updates: pupilUpdates, deactivations: pupilDeact, reactivations: pupilReact },
    classes: { adds: classAdds, updates: classUpdates, deactivations: classDeact, reactivations: classReact },
    memberships: { adds: membershipAdds, removes: membershipRemoves },
    empty,
  };
}
