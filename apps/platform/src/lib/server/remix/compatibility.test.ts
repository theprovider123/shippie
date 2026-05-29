import { describe, expect, it } from 'vitest';
import { describeRemixDataCompatibility } from './compatibility';

describe('describeRemixDataCompatibility', () => {
  it('reports unknown when the parent has no data family', () => {
    const r = describeRemixDataCompatibility({ family: null });
    expect(r.status).toBe('unknown');
    expect(r.parentFamily).toBeNull();
  });

  it('at handoff (child family unknown) surfaces the inherited parent family', () => {
    const r = describeRemixDataCompatibility({ family: 'receipt-inbox' });
    expect(r.status).toBe('unknown');
    expect(r.parentFamily).toBe('receipt-inbox');
    expect(r.summary).toContain('receipt-inbox');
  });

  it('reports same-schema when child keeps the parent family', () => {
    const r = describeRemixDataCompatibility(
      { family: 'receipt-inbox' },
      { family: 'receipt-inbox' },
    );
    expect(r.status).toBe('same-schema');
  });

  it('reports incompatible-family when the child changes the family', () => {
    const r = describeRemixDataCompatibility(
      { family: 'receipt-inbox' },
      { family: 'budget-tracker' },
    );
    expect(r.status).toBe('incompatible-family');
  });
});
