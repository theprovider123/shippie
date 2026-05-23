/**
 * 18×14 SVG battery glyph with three internal bars. State is colour, not
 * shape, so the affordance reads the same at any zoom:
 *   • ON  (saving)  — top bar empty, lower two filled sage. "Energy kept."
 *   • OFF (full draw) — all three bars red. "Drawing power."
 * Stroke is ink so the glyph holds its place against any paper-tone neighbour.
 */
interface BatterySaverGlyphProps {
  on: boolean;
}

export function BatterySaverGlyph({ on }: BatterySaverGlyphProps) {
  const stroke = '#14120F';
  const topFill = on ? 'transparent' : '#EF0107';
  const midFill = on ? '#5E7B5C' : '#EF0107';
  const botFill = on ? '#5E7B5C' : '#EF0107';
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="13" stroke={stroke} strokeWidth="1" />
      <rect x="15.5" y="3.5" width="2" height="7" fill={stroke} />
      <rect x="2" y="2" width="12" height="2.5" fill={topFill} />
      <rect x="2" y="5.5" width="12" height="2.5" fill={midFill} />
      <rect x="2" y="9" width="12" height="2.5" fill={botFill} />
    </svg>
  );
}
