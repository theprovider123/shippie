import { describe, expect, it } from 'vitest';
import { TZ_OPTIONS, detectTZ, localiseMatchTime } from './tz';

describe('timezone system', () => {
  it('localises a 15:00 UK kick-off for every option', () => {
    expect(localiseMatchTime('15:00', 'BST')).toBe('16:00 BST');
    expect(localiseMatchTime('15:00', 'GMT')).toBe('15:00 GMT');
    expect(localiseMatchTime('15:00', 'CET')).toBe('17:00 CET');
    expect(localiseMatchTime('15:00', 'ET')).toBe('11:00 ET');
    expect(localiseMatchTime('15:00', 'PT')).toBe('08:00 PT');
    expect(localiseMatchTime('15:00', 'IST')).toBe('20:30 IST');
    expect(localiseMatchTime('15:00', 'AEST')).toBe('01:00 AEST');
  });

  it('wraps past midnight cleanly', () => {
    expect(localiseMatchTime('20:00', 'AEST')).toBe('06:00 AEST');
    expect(localiseMatchTime('03:00', 'PT')).toBe('20:00 PT');
  });

  it('detects the timezone from a UTC offset', () => {
    expect(detectTZ(1)).toBe('BST');
    expect(detectTZ(2)).toBe('CET');
    expect(detectTZ(-4)).toBe('ET');
    expect(detectTZ(-7)).toBe('PT');
    expect(detectTZ(5.5)).toBe('IST');
    expect(detectTZ(10)).toBe('AEST');
    expect(detectTZ(0)).toBe('GMT');
    expect(detectTZ(3)).toBe('GMT');
  });

  it('the option list cycles without gaps', () => {
    const ids = TZ_OPTIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[(ids.indexOf('AEST') + 1) % ids.length]).toBe('BST');
  });
});
