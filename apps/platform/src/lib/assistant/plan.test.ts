import { describe, expect, it } from 'vitest';
import {
  MAX_PLAN_STEPS,
  buildPlan,
  buildStep,
  defaultConfirmRequired,
  validatePlan,
} from './plan';

describe('defaultConfirmRequired', () => {
  it('reads do not require confirm', () => {
    expect(defaultConfirmRequired('intent.consume')).toBe(false);
    expect(defaultConfirmRequired('ai.run')).toBe(false);
  });

  it('writes + shares + reminders require confirm', () => {
    expect(defaultConfirmRequired('intent.provide')).toBe(true);
    expect(defaultConfirmRequired('share.send')).toBe(true);
    expect(defaultConfirmRequired('reminders.set')).toBe(true);
  });
});

describe('buildStep', () => {
  it('defaults requiresConfirm based on kind', () => {
    const step = buildStep('intent.provide', 'recipe', 'broadcast cooked-meal', {});
    expect(step.requiresConfirm).toBe(true);
  });

  it('allows overrides', () => {
    const step = buildStep('intent.consume', 'journal', 'read sleep-logged', {}, { requiresConfirm: true });
    expect(step.requiresConfirm).toBe(true);
  });
});

describe('buildPlan + validatePlan', () => {
  it('aggregates requiresConfirm across steps', () => {
    const plan = buildPlan('cook + plan', [
      buildStep('intent.consume', 'recipe', 'find recipe', {}),
      buildStep('intent.provide', 'shopping-list', 'add to list', {}),
    ]);
    expect(plan.requiresConfirm).toBe(true);
  });

  it('rejects empty plans', () => {
    expect(() => validatePlan(buildPlan('goal', []))).toThrow(/no steps/);
  });

  it('rejects plans exceeding MAX_PLAN_STEPS', () => {
    const tooMany = Array.from({ length: MAX_PLAN_STEPS + 1 }, () =>
      buildStep('intent.consume', 'a', 'd', {}),
    );
    expect(() => validatePlan(buildPlan('goal', tooMany))).toThrow(/max is/);
  });

  it('rejects steps missing appSlug or describe', () => {
    const noSlug = buildStep('intent.consume', '', 'd', {});
    expect(() => validatePlan(buildPlan('goal', [noSlug]))).toThrow(/missing appSlug/);
  });
});
