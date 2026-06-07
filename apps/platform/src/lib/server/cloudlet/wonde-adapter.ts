/**
 * WondeAdapter (Phase 7) — a live-MIS data source behind the SAME
 * {@link DataSourceAdapter} interface as CSV + manual.
 *
 * GATING (the plan's rule — "never block pilots, never crash"):
 *   The adapter is constructed from `{ apiKey, schoolId }`. When EITHER is
 *   absent the school is treated as NOT REGISTERED with Wonde: `isConfigured()`
 *   returns false and every fetch returns `[]` — the UI shows "not connected"
 *   and the product falls back to CSV/manual. NO secret is ever hardcoded; the
 *   key comes from `env.WONDE_API_KEY` + the per-instance school id.
 *
 * Commercial Wonde access isn't available here so this never runs live, but the
 * mapping is complete and unit-tested against a mocked Wonde response fixture
 * (`wonde-fixture.ts`). `fetch` is injected so the test serves the fixture and
 * production passes the platform `fetch`.
 *
 * Wonde REST shape: `GET {base}/schools/{schoolId}/{resource}` with a Bearer
 * token, responses `{ data: [...], meta: { pagination: { next } } }`. Student
 * inclusion flags arrive via `?include=extended_details`.
 */
import type {
  DataSourceAdapter,
  NormalisedStaff,
  NormalisedPupil,
  NormalisedClass,
  NormalisedMembership,
  NormalisedGroup,
  NormalisedLearnerFlags,
} from '@shippie/cloudlet-contract';
import { initialsFrom } from '@shippie/cloudlet-contract';

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface WondeConfig {
  apiKey?: string | null;
  schoolId?: string | null;
  /** Override for tests; defaults to the public Wonde API base. */
  baseUrl?: string;
  /** Injected fetch (platform fetch in prod, a fixture server in tests). */
  fetch?: FetchLike;
}

interface WondePage {
  data?: unknown[];
  meta?: { pagination?: { next?: string | null } };
}

const DEFAULT_BASE = 'https://api.wonde.com/v1.0';

/** Build a Wonde adapter from env — the ONLY place the key is read. */
export function wondeFromEnv(
  env: { WONDE_API_KEY?: string },
  schoolId: string | null | undefined,
  fetchImpl?: FetchLike,
): WondeAdapter {
  return new WondeAdapter({ apiKey: env.WONDE_API_KEY, schoolId, fetch: fetchImpl });
}

export class WondeAdapter implements DataSourceAdapter {
  readonly source = 'wonde';
  private apiKey: string | null;
  private schoolId: string | null;
  private base: string;
  private fetchImpl: FetchLike | null;

  constructor(cfg: WondeConfig) {
    this.apiKey = cfg.apiKey?.trim() || null;
    this.schoolId = cfg.schoolId?.trim() || null;
    this.base = (cfg.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    this.fetchImpl = cfg.fetch ?? (typeof fetch !== 'undefined' ? (fetch as unknown as FetchLike) : null);
  }

  /** Registered ⇔ a key + a school id + a usable fetch are all present. */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.schoolId && this.fetchImpl);
  }

  /** Paginate a Wonde resource, following `meta.pagination.next`. Returns []
   * (never throws) when unconfigured or on any non-OK response so a pilot is
   * never blocked by an MIS hiccup. */
  private async getAll(resource: string): Promise<unknown[]> {
    if (!this.isConfigured()) return [];
    const out: unknown[] = [];
    let url: string | null = `${this.base}/schools/${this.schoolId}/${resource}`;
    let guard = 0;
    while (url && guard < 100) {
      guard += 1;
      let page: WondePage;
      try {
        const res = await this.fetchImpl!(url, {
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        });
        if (!res.ok) return out; // degrade gracefully — never crash a pilot
        page = (await res.json()) as WondePage;
      } catch {
        return out;
      }
      if (Array.isArray(page.data)) out.push(...page.data);
      url = page.meta?.pagination?.next ?? null;
    }
    return out;
  }

  async fetchStaff(): Promise<NormalisedStaff[]> {
    const rows = await this.getAll('employees');
    return rows.map((raw) => {
      const e = raw as Record<string, any>;
      const email: string | null =
        e?.contact_details?.data?.emails?.email ?? e?.email ?? null;
      return {
        sourceId: String(e.id),
        name: `${e.forename ?? ''} ${e.surname ?? ''}`.trim(),
        email: email ?? null,
        roleHint: e.title ?? null,
      };
    });
  }

  async fetchPupils(): Promise<NormalisedPupil[]> {
    const rows = await this.getAll('students?include=extended_details');
    return rows.map((raw) => {
      const s = raw as Record<string, any>;
      const flags = extendedFlags(s);
      const name = `${s.forename ?? ''} ${s.surname ?? ''}`.trim();
      // Prefer UPN as the stable cross-source id; fall back to the Wonde id.
      const sourceId = (s.upn && String(s.upn)) || String(s.id);
      return { sourceId, name, initials: initialsFrom(name), ...flags };
    });
  }

  async fetchClasses(): Promise<NormalisedClass[]> {
    const rows = await this.getAll('classes?include=year');
    return rows.map((raw) => {
      const c = raw as Record<string, any>;
      return {
        sourceId: String(c.id),
        name: c.name ?? c.description ?? String(c.id),
        yearGroup: c?.year?.data?.name ?? '',
        room: c?.room?.data?.name ?? '',
      };
    });
  }

  async fetchMemberships(): Promise<NormalisedMembership[]> {
    // Class→students relation is include-expanded; map to pupil source ids.
    // We resolve the pupil's UPN-or-id by re-pulling students once (small N).
    const [classRows, pupilRows] = await Promise.all([
      this.getAll('classes?include=students'),
      this.getAll('students'),
    ]);
    const idToSource = new Map<string, string>();
    for (const raw of pupilRows) {
      const s = raw as Record<string, any>;
      idToSource.set(String(s.id), (s.upn && String(s.upn)) || String(s.id));
    }
    const memberships: NormalisedMembership[] = [];
    for (const raw of classRows) {
      const c = raw as Record<string, any>;
      const students: unknown[] = c?.students?.data ?? [];
      for (const st of students) {
        const sid = String((st as Record<string, any>).id);
        memberships.push({
          classSourceId: String(c.id),
          pupilSourceId: idToSource.get(sid) ?? sid,
        });
      }
    }
    return memberships;
  }

  async fetchGroups(): Promise<NormalisedGroup[]> {
    const rows = await this.getAll('groups?include=students');
    return rows.map((raw) => {
      const g = raw as Record<string, any>;
      const students: unknown[] = g?.students?.data ?? [];
      return {
        sourceId: String(g.id),
        name: g.name ?? String(g.id),
        kind: g.type ?? 'custom',
        pupilSourceIds: students.map((s) => String((s as Record<string, any>).id)),
      };
    });
  }

  async fetchLearnerFlags(): Promise<NormalisedLearnerFlags[]> {
    const rows = await this.getAll('students?include=extended_details');
    return rows.map((raw) => {
      const s = raw as Record<string, any>;
      const sourceId = (s.upn && String(s.upn)) || String(s.id);
      return { pupilSourceId: sourceId, ...extendedFlags(s) };
    });
  }
}

/** Map Wonde extended_details into SEND/EAL/FSM booleans.
 * sen_status: 'N' none, 'K' SEN support, 'E' EHC plan → SEND = K or E. */
function extendedFlags(s: Record<string, any>): { send: boolean; eal: boolean; fsm: boolean } {
  const entries: Array<{ key?: string; value?: unknown }> = s?.extended_details?.data ?? [];
  const get = (key: string): string =>
    String(entries.find((e) => e.key === key)?.value ?? '').toLowerCase();
  const sen = get('sen_status');
  const truthy = (v: string) => v === 'true' || v === '1' || v === 'y' || v === 'yes';
  return {
    send: sen === 'k' || sen === 'e',
    eal: truthy(get('eal')),
    fsm: truthy(get('fsm_eligible')) || truthy(get('fsm')),
  };
}
