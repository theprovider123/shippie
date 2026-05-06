import type { ThemeKey } from '../types';

export interface ThemePalette {
  key: ThemeKey;
  name: string;
  note: string;
  vars: Record<string, string>;
  themeColor: string;
  crewColors: string[];
}

export const themePalettes: ThemePalette[] = [
  {
    key: 'sunset',
    name: 'Sunset',
    note: 'warm, social, golden',
    vars: { '--sun': '#f4c75f', '--coral': '#e76f51', '--sea': '#79a7af', '--leaf': '#86a56d', '--night': '#111310', '--panel': '#1a1d19', '--panel-soft': '#22271f' },
    themeColor: '#1a1d19',
    crewColors: ['#E8603C', '#F4C75F', '#79A7AF', '#86A56D', '#C9824D', '#D6A26B'],
  },
  {
    key: 'coast',
    name: 'Coast',
    note: 'fresh, bright, breezy',
    vars: { '--sun': '#8ed9d2', '--coral': '#ff8f70', '--sea': '#5aa7bb', '--leaf': '#9abf88', '--night': '#0f1718', '--panel': '#172222', '--panel-soft': '#20302f' },
    themeColor: '#172222',
    crewColors: ['#FF8F70', '#8ED9D2', '#5AA7BB', '#9ABF88', '#F4B95A', '#E07A8C'],
  },
  {
    key: 'garden',
    name: 'Garden',
    note: 'soft, leafy, easy',
    vars: { '--sun': '#c6d96f', '--coral': '#e78268', '--sea': '#7aa89c', '--leaf': '#8fbf6f', '--night': '#10150f', '--panel': '#192018', '--panel-soft': '#222b1f' },
    themeColor: '#192018',
    crewColors: ['#E78268', '#C6D96F', '#8FBF6F', '#7AA89C', '#D8A55C', '#B58F6B'],
  },
  {
    key: 'night',
    name: 'After dark',
    note: 'late, punchy, party',
    vars: { '--sun': '#d9b7ff', '--coral': '#ff6f91', '--sea': '#7bdff2', '--leaf': '#b2f7a5', '--night': '#111018', '--panel': '#1c1a25', '--panel-soft': '#282436' },
    themeColor: '#1c1a25',
    crewColors: ['#FF6F91', '#D9B7FF', '#7BDFF2', '#B2F7A5', '#FFB860', '#F47AA8'],
  },
];

export function paletteFor(theme: ThemeKey): ThemePalette {
  return themePalettes.find((palette) => palette.key === theme) ?? themePalettes[0]!;
}
