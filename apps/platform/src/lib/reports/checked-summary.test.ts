import { describe, expect, test } from 'vitest';
import { summarizeChecks } from './checked-summary';

describe('summarizeChecks', () => {
  test('no external domains → local + no-connections badges', () => {
    const s = summarizeChecks({ externalDomains: [] });
    expect(s.badges).toEqual(['Runs on your device', 'No third-party connections']);
    expect(s.connectDomains).toEqual([]);
  });

  test('lists declared connect domains', () => {
    const s = summarizeChecks({ externalDomains: [{ domain: 'api.weather.test' }, { domain: 'cdn.example' }] });
    expect(s.badges[0]).toBe('Connects to 2 declared domains');
    expect(s.connectDomains).toEqual(['api.weather.test', 'cdn.example']);
  });

  test('singular wording for one domain', () => {
    const s = summarizeChecks({ externalDomains: [{ domain: 'api.example' }] });
    expect(s.badges[0]).toBe('Connects to 1 declared domain');
  });

  test('never leaks internal scores/grades even if passed extra fields', () => {
    // Cast simulates a careless caller spreading the whole trustCard in.
    const s = summarizeChecks({
      externalDomains: [],
      // @ts-expect-error — extra internal fields must be ignored, not surfaced.
      securityScore: 'A+',
      privacyGrade: 'B',
      findings: ['leaked secret in bundle'],
    });
    const blob = JSON.stringify(s).toLowerCase();
    expect(blob).not.toContain('a+');
    expect(blob).not.toContain('grade');
    expect(blob).not.toContain('score');
    expect(blob).not.toContain('finding');
    expect(blob).not.toContain('secret');
  });
});
