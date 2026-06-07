/**
 * Roster data-source adapters (Phase 7) — `ManualImportAdapter` + `CsvAdapter`.
 *
 * Both implement the reusable {@link DataSourceAdapter} contract so the sync
 * engine never special-cases the source. They wrap the PURE `parseCsvRoster` /
 * normalised shapes from `@shippie/cloudlet-contract`; the Wonde HTTP adapter
 * (the same interface, gated on a key) lives in `wonde-adapter.ts`.
 *
 *  - ManualImportAdapter — hand-entered pupils/classes (the "add a class by
 *    hand" setup path). Already-normalised input; always `isConfigured()`.
 *  - CsvAdapter — a CSV roster upload. Parses on construction; surfaces parse
 *    errors via `errors`. `isConfigured()` is true once a CSV string is given.
 */
import {
  parseCsvRoster,
  initialsFrom,
  type DataSourceAdapter,
  type NormalisedStaff,
  type NormalisedPupil,
  type NormalisedClass,
  type NormalisedMembership,
  type NormalisedGroup,
  type NormalisedLearnerFlags,
  type NormalisedRoster,
  type CsvParseError,
} from '@shippie/cloudlet-contract';

/** Shared base: serve a fixed normalised roster through the adapter interface. */
abstract class StaticRosterAdapter implements DataSourceAdapter {
  abstract readonly source: string;
  protected abstract roster(): NormalisedRoster;
  isConfigured(): boolean {
    return true;
  }
  async fetchStaff(): Promise<NormalisedStaff[]> {
    return this.roster().staff;
  }
  async fetchPupils(): Promise<NormalisedPupil[]> {
    return this.roster().pupils;
  }
  async fetchClasses(): Promise<NormalisedClass[]> {
    return this.roster().classes;
  }
  async fetchMemberships(): Promise<NormalisedMembership[]> {
    return this.roster().memberships;
  }
  async fetchGroups(): Promise<NormalisedGroup[]> {
    return this.roster().groups;
  }
  async fetchLearnerFlags(): Promise<NormalisedLearnerFlags[]> {
    return this.roster().learnerFlags;
  }
}

/** A hand-entered class: a few pupils typed in during setup. */
export interface ManualClassInput {
  className: string;
  yearGroup?: string;
  room?: string;
  pupils: Array<{ name: string; send?: boolean; eal?: boolean; fsm?: boolean; id?: string }>;
}

/**
 * ManualImportAdapter — the "add a class by hand" path. Takes loosely-typed
 * manual input and normalises it (deriving initials + stable ids) so the SAME
 * sync engine + diff handle it identically to a CSV or MIS import.
 */
export class ManualImportAdapter extends StaticRosterAdapter {
  readonly source = 'manual';
  private _roster: NormalisedRoster;

  constructor(classes: ManualClassInput[]) {
    super();
    const pupils: NormalisedPupil[] = [];
    const cls: NormalisedClass[] = [];
    const memberships: NormalisedMembership[] = [];
    const learnerFlags: NormalisedLearnerFlags[] = [];
    const seenPupil = new Set<string>();

    for (const c of classes) {
      const classSourceId = c.className.trim();
      if (!classSourceId) continue;
      cls.push({
        sourceId: classSourceId,
        name: classSourceId,
        yearGroup: (c.yearGroup ?? '').trim(),
        room: (c.room ?? '').trim(),
      });
      for (const p of c.pupils) {
        const name = p.name.trim();
        if (!name) continue;
        const pupilSourceId = (p.id ?? '').trim() || `${classSourceId}:${name}`;
        if (!seenPupil.has(pupilSourceId)) {
          seenPupil.add(pupilSourceId);
          const send = !!p.send;
          const eal = !!p.eal;
          const fsm = !!p.fsm;
          pupils.push({ sourceId: pupilSourceId, name, initials: initialsFrom(name), send, eal, fsm });
          learnerFlags.push({ pupilSourceId, send, eal, fsm });
        }
        memberships.push({ classSourceId, pupilSourceId });
      }
    }
    this._roster = { staff: [], pupils, classes: cls, memberships, groups: [], learnerFlags };
  }

  protected roster(): NormalisedRoster {
    return this._roster;
  }
}

/**
 * CsvAdapter — a CSV roster upload. Parses on construction via the pure
 * `parseCsvRoster`; `errors` exposes any bad-row diagnostics for the preview
 * UI. `isConfigured()` is true once a non-empty CSV is supplied.
 */
export class CsvAdapter extends StaticRosterAdapter {
  readonly source = 'csv';
  private _roster: NormalisedRoster;
  readonly errors: CsvParseError[];

  constructor(private csv: string) {
    super();
    const parsed = parseCsvRoster(csv);
    this._roster = parsed.roster;
    this.errors = parsed.errors;
  }

  isConfigured(): boolean {
    return this.csv.trim().length > 0;
  }

  protected roster(): NormalisedRoster {
    return this._roster;
  }
}
