import type { ThemeKey } from '../types';

export interface ThemePalette {
  key: ThemeKey;
  name: string;
  note: string;
  /** OS chrome color so the URL bar matches the in-app feel. */
  themeColor: string;
  /** Per-theme curated palette for crew + team accents. */
  crewColors: string[];
  /** Per-pulse accent so each pulse button has its own warmth. */
  pulseColors: Record<string, string>;
  /** Token map applied as inline CSS vars on the app shell. */
  vars: Record<string, string>;
}

/**
 * Four palettes, four vacations. Built in OKLCH so the warmth carries.
 * `--mode` is read by styles.css to flip a small set of foreground / shadow
 * decisions between light and dark variants.
 */
export const themePalettes: ThemePalette[] = [
  {
    key: 'sunset',
    name: 'Coast',
    note: 'sun on water, sand, salt-bleached rope',
    themeColor: '#F2EAD8',
    crewColors: ['#C8643A', '#D7A55A', '#5A8FA0', '#7C9F86', '#B25E5E', '#E0AA7A'],
    pulseColors: {
      hype: '#D86B3C',
      ready: '#7C9F86',
      hungry: '#D7A55A',
      lost: '#5A8FA0',
      vote: '#B25E5E',
      moment: '#C8643A',
    },
    vars: {
      '--mode': 'light',
      '--bg': '#E9DEC8',
      '--bg-tint': 'rgba(177, 126, 76, 0.2)',
      '--paper': '#F3E7D0',
      '--paper-warm': '#EBD7B4',
      '--ink': '#2A1F16',
      '--ink-soft': '#4E3D2C',
      '--ink-faint': '#75614C',
      '--line': 'rgba(94, 63, 32, 0.22)',
      '--line-strong': 'rgba(94, 63, 32, 0.4)',
      '--accent': '#C8643A',
      '--accent-soft': 'rgba(200, 100, 58, 0.18)',
      '--accent-foreground': '#FBF3DE',
      '--gold': '#D7A55A',
      '--gold-soft': 'rgba(215, 165, 90, 0.22)',
      '--leaf': '#7C9F86',
      '--sea': '#5A8FA0',
      '--shadow-soft': '0 14px 30px rgba(94, 63, 32, 0.16)',
      '--shadow-card': '0 20px 42px rgba(94, 63, 32, 0.2)',
      '--shadow-hero': '0 32px 64px rgba(94, 63, 32, 0.26)',
    },
  },
  {
    key: 'coast',
    name: 'Olive',
    note: 'siesta light through olive trees',
    themeColor: '#EFE9D4',
    crewColors: ['#7E8A4D', '#C18A4F', '#A86B47', '#5C7A6E', '#D4B26A', '#8E5E5E'],
    pulseColors: {
      hype: '#C18A4F',
      ready: '#7E8A4D',
      hungry: '#D4B26A',
      lost: '#5C7A6E',
      vote: '#8E5E5E',
      moment: '#A86B47',
    },
    vars: {
      '--mode': 'light',
      '--bg': '#E5DDC4',
      '--bg-tint': 'rgba(103, 112, 59, 0.2)',
      '--paper': '#EFE5C8',
      '--paper-warm': '#DED1A8',
      '--ink': '#26271B',
      '--ink-soft': '#454936',
      '--ink-faint': '#6E7155',
      '--line': 'rgba(60, 64, 35, 0.24)',
      '--line-strong': 'rgba(60, 64, 35, 0.42)',
      '--accent': '#7E8A4D',
      '--accent-soft': 'rgba(126, 138, 77, 0.2)',
      '--accent-foreground': '#FAF6E2',
      '--gold': '#D4B26A',
      '--gold-soft': 'rgba(212, 178, 106, 0.22)',
      '--leaf': '#7E8A4D',
      '--sea': '#5C7A6E',
      '--shadow-soft': '0 14px 30px rgba(60, 64, 35, 0.16)',
      '--shadow-card': '0 20px 42px rgba(60, 64, 35, 0.2)',
      '--shadow-hero': '0 32px 64px rgba(60, 64, 35, 0.25)',
    },
  },
  {
    key: 'garden',
    name: 'Tangerine',
    note: 'porch citrus, peeled paint, evening warm',
    themeColor: '#FAE8C8',
    crewColors: ['#E07A3C', '#D89C42', '#7A8E58', '#B45353', '#5C8AA0', '#C7855E'],
    pulseColors: {
      hype: '#E07A3C',
      ready: '#7A8E58',
      hungry: '#D89C42',
      lost: '#5C8AA0',
      vote: '#B45353',
      moment: '#C7855E',
    },
    vars: {
      '--mode': 'light',
      '--bg': '#EED9B7',
      '--bg-tint': 'rgba(184, 94, 43, 0.2)',
      '--paper': '#F6E4C2',
      '--paper-warm': '#ECC88F',
      '--ink': '#3A1E0E',
      '--ink-soft': '#603823',
      '--ink-faint': '#8B6444',
      '--line': 'rgba(96, 56, 35, 0.25)',
      '--line-strong': 'rgba(96, 56, 35, 0.42)',
      '--accent': '#E07A3C',
      '--accent-soft': 'rgba(224, 122, 60, 0.2)',
      '--accent-foreground': '#FFF4DD',
      '--gold': '#D89C42',
      '--gold-soft': 'rgba(216, 156, 66, 0.24)',
      '--leaf': '#7A8E58',
      '--sea': '#5C8AA0',
      '--shadow-soft': '0 14px 30px rgba(96, 56, 35, 0.18)',
      '--shadow-card': '0 20px 42px rgba(96, 56, 35, 0.22)',
      '--shadow-hero': '0 32px 64px rgba(96, 56, 35, 0.28)',
    },
  },
  {
    key: 'night',
    name: 'After dark',
    note: 'porch lights on, drinks poured, late laughter',
    themeColor: '#1A1410',
    crewColors: ['#E8B45F', '#E07A8C', '#7BC8B5', '#C9A0E8', '#F0A878', '#9DB89A'],
    pulseColors: {
      hype: '#E07A8C',
      ready: '#7BC8B5',
      hungry: '#E8B45F',
      lost: '#9DB89A',
      vote: '#C9A0E8',
      moment: '#F0A878',
    },
    vars: {
      '--mode': 'dark',
      '--bg': '#1A1410',
      '--bg-tint': 'rgba(232, 180, 95, 0.1)',
      '--paper': '#241B14',
      '--paper-warm': '#2E2218',
      '--ink': '#F4E5CC',
      '--ink-soft': '#D6C4A6',
      '--ink-faint': '#A89074',
      '--line': 'rgba(244, 229, 204, 0.12)',
      '--line-strong': 'rgba(244, 229, 204, 0.26)',
      '--accent': '#E8B45F',
      '--accent-soft': 'rgba(232, 180, 95, 0.16)',
      '--accent-foreground': '#1A1410',
      '--gold': '#E8B45F',
      '--gold-soft': 'rgba(232, 180, 95, 0.18)',
      '--leaf': '#7BC8B5',
      '--sea': '#9DB89A',
      '--shadow-soft': '0 12px 28px rgba(0, 0, 0, 0.42)',
      '--shadow-card': '0 18px 38px rgba(0, 0, 0, 0.5)',
      '--shadow-hero': '0 30px 60px rgba(0, 0, 0, 0.6)',
    },
  },
];

export function paletteFor(theme: ThemeKey): ThemePalette {
  return themePalettes.find((palette) => palette.key === theme) ?? themePalettes[0]!;
}
