/**
 * Curated examples gallery data.
 *
 * Separate from the organic /apps storefront — these are maker-approved
 * exemplars that work as templates. Each entry maps to a git repo that
 * the /new?template=<slug> flow can clone (v5 W4/W6 wiring).
 *
 * Pillar B1 of the differentiation plan.
 */
import type { ProjectType } from '@shippie/shared';

export interface CuratedExample {
  slug: string;
  name: string;
  tagline: string;
  type: ProjectType;
  category: string;
  themeColor: string;
  repo: string; // owner/name on GitHub
  liveUrl?: string;
}

export const CURATED_EXAMPLES: CuratedExample[] = [
  // ────────────────────────────────────────────── app ────
  {
    slug: 'recipe-saver',
    name: 'Recipe Saver',
    tagline: 'Save, organize, and share recipes. Your backend, your data.',
    type: 'app',
    category: 'food',
    themeColor: '#E8603C',
    repo: 'shippie-templates/recipe-saver',
    liveUrl: 'https://recipe-saver.shippie.app',
  },
  {
    slug: 'workout-logger',
    name: 'Workout Logger',
    tagline: 'Track lifts. Watch the numbers climb. Offline-first.',
    type: 'app',
    category: 'health',
    themeColor: '#5E7B5C',
    repo: 'shippie-templates/workout-logger',
  },
  {
    slug: 'habits',
    name: 'Habits',
    tagline: 'One tap per day. Streaks. Honest with yourself.',
    type: 'app',
    category: 'health',
    themeColor: '#7A9A6E',
    repo: 'shippie-templates/habits',
  },
  {
    slug: 'quick-capture',
    name: 'Quick Capture',
    tagline: 'Thoughts in. Organized later. Syncs to your Supabase.',
    type: 'app',
    category: 'tools',
    themeColor: '#B07856',
    repo: 'shippie-templates/quick-capture',
  },
  {
    slug: 'dough-ratios',
    name: 'Dough Ratios',
    tagline: 'Hydration, salt, yeast. Perfect pizza every time.',
    type: 'app',
    category: 'food',
    themeColor: '#E8C547',
    repo: 'shippie-templates/dough-ratios',
  },

  // ──────────────────────────────────────────── web_app ──
  {
    slug: 'timezones',
    name: 'Time Zones',
    tagline: 'Paste cities. See overlap. Schedule meetings.',
    type: 'web_app',
    category: 'tools',
    themeColor: '#8BA8B8',
    repo: 'shippie-templates/timezones',
  },
  {
    slug: 'rate-calculator',
    name: 'Rate Calculator',
    tagline: 'Expenses + goals = your real hourly rate.',
    type: 'web_app',
    category: 'finance',
    themeColor: '#3A4D35',
    repo: 'shippie-templates/rate-calculator',
  },
  {
    slug: 'dashboard-kit',
    name: 'Dashboard Kit',
    tagline: 'Opinionated internal-tools starter. BYO Supabase.',
    type: 'web_app',
    category: 'tools',
    themeColor: '#5E7B5C',
    repo: 'shippie-templates/dashboard-kit',
  },
  {
    slug: 'feedback-board',
    name: 'Feedback Board',
    tagline: 'Request tracking for tiny teams. Auth via Clerk or Supabase.',
    type: 'web_app',
    category: 'productivity',
    themeColor: '#B07856',
    repo: 'shippie-templates/feedback-board',
  },

  // ──────────────────────────────────────────── website ──
  {
    slug: 'maker-portfolio',
    name: 'Maker Portfolio',
    tagline: 'Static site with Shippie feedback widget built in.',
    type: 'website',
    category: 'personal',
    themeColor: '#7A9A6E',
    repo: 'shippie-templates/maker-portfolio',
  },
  {
    slug: 'project-docs',
    name: 'Project Docs',
    tagline: 'Markdown in. Search + analytics + feedback out.',
    type: 'website',
    category: 'docs',
    themeColor: '#8A7A66',
    repo: 'shippie-templates/project-docs',
  },
  {
    slug: 'launch-page',
    name: 'Launch Page',
    tagline: 'Email capture, changelog, and install QR on a single page.',
    type: 'website',
    category: 'marketing',
    themeColor: '#E8C547',
    repo: 'shippie-templates/launch-page',
  },
];

export function groupByType(): Record<ProjectType, CuratedExample[]> {
  const out: Record<ProjectType, CuratedExample[]> = { app: [], web_app: [], website: [] };
  for (const example of CURATED_EXAMPLES) out[example.type].push(example);
  return out;
}
