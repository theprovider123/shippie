import { describe, expect, test } from 'bun:test';
import { monogram, accentColor } from '../packages/design-tokens/src/tool-icon.ts';
import { buildMonogramSvg } from './generate-monogram-icons.mjs';

describe('generated SVG parity with the shared algorithm', () => {
  test('SVG embeds the same monogram and accent as ToolGlyph would', () => {
    const svg = buildMonogramSvg({ name: 'Symptom Diary', slug: 'symptom-diary', themeColor: '#000000' });
    expect(svg).toContain('>SD<');
    expect(svg).toContain(accentColor('symptom-diary', '#000000'));
  });
  test('respects a real maker theme colour', () => {
    const svg = buildMonogramSvg({ name: 'Dough', slug: 'dough', themeColor: '#e07a4d' });
    expect(svg).toContain('#e07a4d');
    expect(svg).toContain(`>${monogram('Dough', 'dough')}<`);
  });
  test('uses the hybrid radius (rx=3)', () => {
    const svg = buildMonogramSvg({ name: 'Lift', slug: 'lift', themeColor: '#000' });
    expect(svg).toContain('rx="3"');
  });
});
