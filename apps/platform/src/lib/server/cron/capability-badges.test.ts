/**
 * Tests for the pure `deriveBadges` rule engine. The full SQL-side
 * pipeline is exercised against a real D1 in integration tests; here
 * we lock the badge-award decision logic.
 */
import { describe, expect, test } from 'vitest';
import { deriveBadges } from './capability-badges';
import { BADGE_RULES, CAPABILITY_BADGES, PROOF_EVENT_TYPES, type ProofEventType } from '../proof/taxonomy';

function counts(map: Partial<Record<ProofEventType, number>>): Record<ProofEventType, number> {
  const out = {} as Record<ProofEventType, number>;
  for (const t of PROOF_EVENT_TYPES) out[t] = map[t] ?? 0;
  return out;
}

describe('deriveBadges', () => {
  test('no events → no badges', () => {
    expect(deriveBadges(counts({}))).toEqual([]);
  });

  test('runs-local-db awards at threshold of 3 distinct devices', () => {
    expect(deriveBadges(counts({ local_db_used: 2 }))).toEqual([]);
    const at3 = deriveBadges(counts({ local_db_used: 3 }));
    expect(at3.find((b) => b.badge === 'runs-local-db')?.minDistinctDevices).toBe(3);
  });

  test('works-offline requires BOTH service_worker_active AND offline_loaded above threshold', () => {
    // Only one of the two events met → no badge.
    expect(
      deriveBadges(counts({ service_worker_active: 5 })).find((b) => b.badge === 'works-offline'),
    ).toBeUndefined();
    expect(
      deriveBadges(counts({ offline_loaded: 5 })).find((b) => b.badge === 'works-offline'),
    ).toBeUndefined();
    // Both at threshold → badge awarded; min reflects the lower of the two.
    const both = deriveBadges(counts({ service_worker_active: 4, offline_loaded: 7 }));
    expect(both.find((b) => b.badge === 'works-offline')?.minDistinctDevices).toBe(4);
  });

  test('mesh-ready requires room_joined AND peer_synced', () => {
    const onlyOne = deriveBadges(counts({ room_joined: 5 }));
    expect(onlyOne.find((b) => b.badge === 'mesh-ready')).toBeUndefined();
    const both = deriveBadges(counts({ room_joined: 3, peer_synced: 6 }));
    expect(both.find((b) => b.badge === 'mesh-ready')?.minDistinctDevices).toBe(3);
  });

  test('all single-event badges award at exactly the threshold (3)', () => {
    const eventToBadge: Record<string, string> = {
      local_db_used: 'runs-local-db',
      ai_ran_local: 'uses-local-ai',
      data_exported: 'data-export-verified',
      backup_restored: 'backup-restore-verified',
      device_transferred: 'device-transfer-verified',
    };
    for (const [event, badge] of Object.entries(eventToBadge)) {
      const ev = event as ProofEventType;
      const at2 = deriveBadges(counts({ [ev]: 2 }));
      expect(at2.find((b) => b.badge === badge)).toBeUndefined();
      const at3 = deriveBadges(counts({ [ev]: 3 }));
      expect(at3.find((b) => b.badge === badge)?.minDistinctDevices).toBe(3);
    }
  });

  test('every badge in CAPABILITY_BADGES has a matching rule entry', () => {
    for (const badge of CAPABILITY_BADGES) {
      expect(BADGE_RULES[badge]).toBeDefined();
      expect(BADGE_RULES[badge].events.length).toBeGreaterThan(0);
      expect(BADGE_RULES[badge].threshold).toBeGreaterThan(0);
    }
  });
});
