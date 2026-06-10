// lot. design tokens — ported verbatim from the Claude Design handoff
// (lot-components.jsx). The cream/paper palette + Playfair/JetBrains/DM Sans
// type system is lot.'s own language; it deliberately does NOT use the dark
// Shippie design-tokens. Numbers always use F.mono; place/origin/roaster/
// variety names always use F.serif; body copy uses F.sans.

export const C = {
  cream: '#F4EFE3',
  creamDark: '#EBE3D0',
  paper: '#EDE6D2',
  paperWarm: '#E5DCC4',
  espresso: '#2C1A0E',
  espressoMid: '#52382A',
  espressoLight: '#7B5C4C',
  terracotta: '#C4633A',
  terrLight: '#D47A52',
  sage: '#6B8C6E',
  sageLight: '#9BAE9D',
  tan: '#9E8A68',
  tanLight: '#B8A48A',
} as const;

export const F = {
  serif: "'Playfair Display', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  sans: "'DM Sans', system-ui, sans-serif",
} as const;

export type Palette = typeof C;
export type Fonts = typeof F;
