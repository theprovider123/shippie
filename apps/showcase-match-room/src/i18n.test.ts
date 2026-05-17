import { describe, expect, test } from 'bun:test';
import { LOCALE_LABELS, copyFor, normaliseLocale, type Locale } from './i18n.ts';

describe('match-room localisation', () => {
  test('supports tournament copy outside UK English', () => {
    const locales = Object.keys(LOCALE_LABELS) as Locale[];
    expect(locales).toEqual(['en-GB', 'en-US', 'es', 'fr', 'pt', 'de']);
    for (const locale of locales) {
      const copy = copyFor(locale);
      expect(copy.startHeadline.length).toBeGreaterThan(20);
      expect(copy.startAction.length).toBeGreaterThan(3);
      expect(copy.templatePub.length).toBeGreaterThan(2);
    }
  });

  test('normalises browser locales to supported room languages', () => {
    expect(normaliseLocale('en-US')).toBe('en-US');
    expect(normaliseLocale('en-AU')).toBe('en-GB');
    expect(normaliseLocale('es-MX')).toBe('es');
    expect(normaliseLocale('fr-CA')).toBe('fr');
    expect(normaliseLocale('pt-BR')).toBe('pt');
    expect(normaliseLocale('de-DE')).toBe('de');
  });
});
