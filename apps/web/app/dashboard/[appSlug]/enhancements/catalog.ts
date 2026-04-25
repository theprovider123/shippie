/**
 * Static capability catalog. Each entry describes an opt-in feature a
 * maker can enable beyond what zero-config detected. Rendered on the
 * Enhancements tab. Hand-maintained — no dynamic discovery.
 *
 * When you add a capability:
 *   1. Add an entry here with stable id (don't reuse ids across removals).
 *   2. Wire `extractEnabledCapabilities` in page.tsx to detect when the
 *      capability is already present in the maker's shippie.json.
 *   3. Stub the docs page at `apps/web/app/docs/<topic>` if it doesn't
 *      already exist.
 */
export interface CapabilityEntry {
  id: string;
  label: string;
  blurb: string;
  /** Snippet to merge into shippie.json. */
  snippet: Record<string, unknown>;
  docsHref: string;
  category: 'sound' | 'ai' | 'mesh' | 'device' | 'backup' | 'data';
}

export const CAPABILITY_CATALOG: readonly CapabilityEntry[] = [
  {
    id: 'sound',
    label: 'Sound design',
    blurb: 'Add subtle audio feedback to taps and confirmations. Off by default.',
    snippet: { sound: true },
    docsHref: '/docs/feel/sound',
    category: 'sound',
  },
  {
    id: 'barcode',
    label: 'Barcode scanning',
    blurb: 'Scan product barcodes via the device camera (Android Chrome).',
    snippet: { capabilities: ['barcode'] },
    docsHref: '/docs/device/barcode',
    category: 'device',
  },
  {
    id: 'ai-classify',
    label: 'On-device classification',
    blurb: 'Categorise text locally — zero-shot. No data leaves the phone.',
    snippet: { ai: ['classify'] },
    docsHref: '/docs/ai/classify',
    category: 'ai',
  },
  {
    id: 'ai-embed',
    label: 'Semantic search',
    blurb: 'Search by meaning, not just keywords. Vector embeddings on-device.',
    snippet: { ai: ['embed'] },
    docsHref: '/docs/ai/embed',
    category: 'ai',
  },
  {
    id: 'ai-sentiment',
    label: 'Sentiment analysis',
    blurb: 'Score text positivity locally. Useful for journals, feedback, mood tracking.',
    snippet: { ai: ['sentiment'] },
    docsHref: '/docs/ai/sentiment',
    category: 'ai',
  },
  {
    id: 'ambient',
    label: 'Background insights',
    blurb:
      'Quietly analyse local data for trends and surface insights when the user opens the app. ' +
      'Insights appear on app open, not while sleeping.',
    snippet: { ambient: { analyse: true } },
    docsHref: '/docs/ambient',
    category: 'ai',
  },
  {
    id: 'groups',
    label: 'Local groups (mesh)',
    blurb: 'Real-time collaboration over the local network or internet — no server in the path.',
    snippet: { groups: { enabled: true } },
    docsHref: '/docs/groups',
    category: 'mesh',
  },
  {
    id: 'backup',
    label: 'Cloud backup to user drive',
    blurb: "User-controlled backups to their own Google Drive. Shippie's servers can't read them.",
    snippet: { backup: { provider: 'google-drive' } },
    docsHref: '/docs/backup',
    category: 'backup',
  },
];

/**
 * Inspect a maker's shippie.json and return the catalog ids that are
 * already enabled. Used to subtract from the "Available" list.
 */
export function extractEnabledCapabilityIds(
  json: Record<string, unknown> | null,
): string[] {
  if (!json) return [];
  const ids: string[] = [];
  if (json.sound === true) ids.push('sound');
  const ai = json.ai;
  if (Array.isArray(ai)) {
    if (ai.includes('classify')) ids.push('ai-classify');
    if (ai.includes('embed')) ids.push('ai-embed');
    if (ai.includes('sentiment')) ids.push('ai-sentiment');
  }
  const ambient = json.ambient as { analyse?: boolean } | undefined;
  if (ambient?.analyse) ids.push('ambient');
  const groups = json.groups as { enabled?: boolean } | undefined;
  if (groups?.enabled) ids.push('groups');
  const backup = json.backup as { provider?: string } | undefined;
  if (backup?.provider) ids.push('backup');
  const caps = json.capabilities;
  if (Array.isArray(caps) && caps.includes('barcode')) ids.push('barcode');
  return ids;
}
