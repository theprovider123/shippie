import { describe, expect, test } from 'bun:test';
import { FALLBACK_ROUTE_PACK } from '../data/parade-2026';
import { createDefaultGroupPlan, createRelayRoomRef, decodePlan, encodePlan, ensurePlanRoom, validateGroupPlan } from './group-plan';

describe('group plan', () => {
  test('round-trips through the signed fragment format', async () => {
    const plan = createDefaultGroupPlan(FALLBACK_ROUTE_PACK);
    plan.name = 'North Bank';
    plan.members = ['Dev', 'Sarah'];
    plan.room = createRelayRoomRef();
    plan.roleHint = 'watch';
    const fragment = await encodePlan(plan);
    expect(fragment.length).toBeGreaterThan(200);
    const decoded = await decodePlan(fragment);
    expect(decoded?.name).toBe('North Bank');
    expect(decoded?.members).toEqual(['Dev', 'Sarah']);
    expect(decoded?.primary.label).toBe(plan.primary.label);
    expect(decoded?.room?.roomId).toBe(plan.room.roomId);
    expect(decoded?.roleHint).toBe('watch');
  });

  test('rejects wrong-version and out-of-corridor plans', () => {
    expect(validateGroupPlan({ v: 2 })).toBeNull();
    const plan = createDefaultGroupPlan(FALLBACK_ROUTE_PACK);
    plan.primary.lng = -1;
    expect(validateGroupPlan(plan)).toBeNull();
  });

  test('ensurePlanRoom adds a share room without replacing an existing one', () => {
    const plan = createDefaultGroupPlan(FALLBACK_ROUTE_PACK);
    const first = ensurePlanRoom(plan);
    const second = ensurePlanRoom(first);
    expect(first.room?.roomId).toBeTruthy();
    expect(second.room?.roomId).toBe(first.room?.roomId);
  });
});
