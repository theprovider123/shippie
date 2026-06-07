/**
 * A mocked Wonde REST response fixture (Phase 7).
 *
 * Commercial Wonde access is not available in this environment, so the
 * {@link WondeAdapter} can't run live — but the adapter + mapping must be
 * complete and unit-tested. This fixture mirrors the shape of the real Wonde
 * endpoints (`/schools/{id}/students`, `/classes`, `/employees`, `/contacts`)
 * including the `include`-expanded `extendedFields` Wonde uses for
 * SEND / EAL / FSM / attendance, paginated under `data` + `meta.pagination`.
 *
 * Refs: Wonde API returns `{ data: [...], meta: { pagination: { next } } }`.
 * Student inclusion data arrives via `?include=extended_details` as
 * `extended_details.data[]` keyed entries.
 */

export const WONDE_STUDENTS = {
  data: [
    {
      id: 'B1234567',
      upn: 'A100',
      forename: 'Aisha',
      surname: 'Khan',
      extended_details: {
        data: [
          { key: 'sen_status', value: 'K' }, // SEN support
          { key: 'eal', value: 'false' },
          { key: 'fsm_eligible', value: 'true' },
        ],
      },
    },
    {
      id: 'B1234568',
      upn: 'A101',
      forename: 'Darius',
      surname: 'Okafor',
      extended_details: {
        data: [
          { key: 'sen_status', value: 'N' }, // no SEN
          { key: 'eal', value: 'true' },
          { key: 'fsm_eligible', value: 'false' },
        ],
      },
    },
    {
      id: 'B1234569',
      upn: 'A102',
      forename: 'Leo',
      surname: 'Smith',
      extended_details: {
        data: [
          { key: 'sen_status', value: 'E' }, // EHC plan → SEND true
          { key: 'eal', value: 'false' },
          { key: 'fsm_eligible', value: 'true' },
        ],
      },
    },
  ],
  meta: { pagination: { next: null } },
} as const;

export const WONDE_CLASSES = {
  data: [
    {
      id: 'C9000001',
      name: '4M',
      description: 'Year 4 Maple',
      // Wonde nests the year + students under include-expanded relations.
      year: { data: { name: 'Year 4', code: '4' } },
      students: { data: [{ id: 'B1234567' }, { id: 'B1234568' }, { id: 'B1234569' }] },
    },
    {
      id: 'C9000002',
      name: '3B',
      description: 'Year 3 Birch',
      year: { data: { name: 'Year 3', code: '3' } },
      students: { data: [] },
    },
  ],
  meta: { pagination: { next: null } },
} as const;

export const WONDE_EMPLOYEES = {
  data: [
    {
      id: 'E5000001',
      forename: 'Priya',
      surname: 'Mdistry',
      title: 'Mrs',
      email: 'p.mistry@greenfield.sch.uk',
      contact_details: { data: { emails: { email: 'p.mistry@greenfield.sch.uk' } } },
    },
  ],
  meta: { pagination: { next: null } },
} as const;
