import { describe, expect, it } from 'bun:test';
import { displayFor, phaseAtElapsed, safetyWarnings, timelineFor } from './phase.ts';

describe('companion phase engine', () => {
  it('keeps clock phase separate from felt state', () => {
    const phases = timelineFor({ substance: 'psilocybin', amount: '2.4' });
    const phase = phaseAtElapsed(phases, 95 * 60 * 1000);
    const display = displayFor('hard', phase);

    expect(phase.id).toBe('peak');
    expect(display.line).toContain('do not need to solve it');
    expect(display.normal).toBe('Hard moments change. Breathe out slowly. Support is here.');
  });

  it('does not generate dose recommendations while calibrating psilocybin timing', () => {
    const phases = timelineFor({ substance: 'psilocybin', amount: '3.0' });
    const copy = phases.map((phase) => `${phase.voice} ${phase.normal}`).join(' ').toLowerCase();

    expect(copy).not.toContain('take');
    expect(copy).not.toContain('dose');
    expect(copy).not.toContain('recommended');
  });

  it('surfaces strong warnings for higher-risk medication flags', () => {
    const warnings = safetyWarnings(['lithium', 'tramadol', 'ssri-snri']);

    expect(warnings.join(' ')).toContain('Lithium');
    expect(warnings.join(' ')).toContain('Tramadol');
    expect(warnings.join(' ')).toContain('SSRIs');
  });
});
