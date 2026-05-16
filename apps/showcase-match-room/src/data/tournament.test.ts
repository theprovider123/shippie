import { describe, expect, test } from 'bun:test';
import { ALL_FIXTURES, GROUP_STAGE_FIXTURES, HOST_CITIES, HOST_CITY_PROFILES, KNOCKOUT_FIXTURES, OPENING_FIXTURE, TEAMS, TEAM_PROFILES, fixtureTitle } from './tournament.ts';

describe('tournament content', () => {
  test('covers the full 48-team, 104-match tournament shape', () => {
    expect(TEAMS).toHaveLength(48);
    expect(HOST_CITIES).toHaveLength(16);
    expect(GROUP_STAGE_FIXTURES).toHaveLength(72);
    expect(KNOCKOUT_FIXTURES).toHaveLength(32);
    expect(ALL_FIXTURES).toHaveLength(104);
  });

  test('keeps opening fixture accurate', () => {
    expect(OPENING_FIXTURE.home).toBe('MEX');
    expect(OPENING_FIXTURE.away).toBe('RSA');
    expect(OPENING_FIXTURE.kickoff).toBe('2026-06-11T13:00:00-06:00');
  });

  test('labels knockout placeholders like a readable wall chart', () => {
    const finalFixture = KNOCKOUT_FIXTURES[KNOCKOUT_FIXTURES.length - 1];
    expect(finalFixture).toBeDefined();
    expect(fixtureTitle(finalFixture!)).toBe('Finalist A v Finalist B');
  });

  test('has country and host-city programme details for every tile', () => {
    expect(Object.keys(TEAM_PROFILES).sort()).toEqual(TEAMS.map((team) => team.code).sort());
    expect(Object.keys(HOST_CITY_PROFILES).sort()).toEqual(HOST_CITIES.map((city) => city.code).sort());
    expect(HOST_CITY_PROFILES['MEX-CITY']?.timeZone).toBe('America/Mexico_City');
    expect(HOST_CITIES.every((city) => Boolean(HOST_CITY_PROFILES[city.code]?.paperNote))).toBe(true);
  });
});
