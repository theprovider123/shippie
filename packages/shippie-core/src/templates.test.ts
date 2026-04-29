import { describe, expect, test } from 'bun:test';
import { getTemplate, listTemplates } from './templates.ts';

describe('template registry core', () => {
  test('lists showcase templates from the shared registry', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(8);
    expect(templates.map((template) => template.id)).toContain('recipe-saver');
  });

  test('gets one template by id without exposing mutable registry objects', () => {
    const template = getTemplate('habit-tracker');
    expect(template?.name).toBe('Habit Tracker');
    expect(template?.proves.capability).toContain('cross-cluster');
  });

  test('returns null for unknown templates', () => {
    expect(getTemplate('unknown')).toBeNull();
  });
});
