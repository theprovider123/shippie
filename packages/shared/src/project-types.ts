/**
 * The three first-class project types in Shippie.
 *
 * - `app`      — installable PWA, phone-first, full Shippie runtime + Native Bridge
 * - `web_app`  — browser-first, full runtime, passive install UX
 * - `website`  — static + light runtime, no install, content shelf
 *
 * See spec v6 §3 for the full distinction matrix.
 */
export const PROJECT_TYPES = ['app', 'web_app', 'website'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const isProjectType = (v: unknown): v is ProjectType =>
  typeof v === 'string' && (PROJECT_TYPES as readonly string[]).includes(v);

/**
 * Discovery shelf labels per project type.
 */
export const PROJECT_TYPE_SHELVES: Record<ProjectType, string> = {
  app: 'Apps',
  web_app: 'Tools',
  website: 'Sites',
};

/**
 * Default "best on" badge per project type. Can be overridden post-deploy.
 */
export const PROJECT_TYPE_BEST_ON: Record<ProjectType, 'mobile' | 'desktop' | 'any'> = {
  app: 'mobile',
  web_app: 'desktop',
  website: 'any',
};
