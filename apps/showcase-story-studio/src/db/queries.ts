/**
 * Story + page queries. Two tables, one-to-many; pages reference
 * stories via `story_id`. Page assets (SVG drawing + audio) live in
 * OPFS — these helpers only touch the metadata DB.
 */
import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  PAGES_TABLE,
  STORIES_TABLE,
  pagesSchema,
  storiesSchema,
  type Page,
  type Story,
  type StoryWithPages,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(STORIES_TABLE, storiesSchema);
      await db.create(PAGES_TABLE, pagesSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listStories(db: ShippieLocalDb): Promise<Story[]> {
  await ensureSchema(db);
  return db.query<RowOf<Story>>(STORIES_TABLE, { orderBy: { made_at: 'desc' } });
}

export async function getStory(db: ShippieLocalDb, id: string): Promise<StoryWithPages | null> {
  await ensureSchema(db);
  const stories = await db.query<RowOf<Story>>(STORIES_TABLE, { where: { id }, limit: 1 });
  const story = stories[0];
  if (!story) return null;
  const pages = await db.query<RowOf<Page>>(PAGES_TABLE, {
    where: { story_id: id },
    orderBy: { page_index: 'asc' },
  });
  return { ...story, pages };
}

export async function createStory(
  db: ShippieLocalDb,
  input: { madeBy: string; title?: string },
): Promise<Story> {
  await ensureSchema(db);
  const story: Story = {
    id: newId('story'),
    title: input.title?.trim() || 'Untitled story',
    made_by: input.madeBy,
    made_at: new Date().toISOString(),
    page_count: 0,
    has_audio: 0,
    shared_at: null,
  };
  await db.insert(STORIES_TABLE, asRow(story));
  return story;
}

export async function renameStory(db: ShippieLocalDb, id: string, title: string): Promise<void> {
  await ensureSchema(db);
  const trimmed = title.trim() || 'Untitled story';
  await db.update<RowOf<Story>>(STORIES_TABLE, id, { title: trimmed });
}

export async function markShared(db: ShippieLocalDb, id: string, at: Date = new Date()): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Story>>(STORIES_TABLE, id, { shared_at: at.toISOString() });
}

export async function deleteStory(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  // Cascade: pages first.
  const pages = await db.query<RowOf<Page>>(PAGES_TABLE, { where: { story_id: id } });
  for (const p of pages) await db.delete(PAGES_TABLE, p.id);
  await db.delete(STORIES_TABLE, id);
}

export async function addPage(
  db: ShippieLocalDb,
  storyId: string,
): Promise<Page> {
  await ensureSchema(db);
  const existing = await db.query<RowOf<Page>>(PAGES_TABLE, { where: { story_id: storyId } });
  const page: Page = {
    id: newId('page'),
    story_id: storyId,
    page_index: existing.length,
    svg_blob_id: null,
    audio_blob_id: null,
    kid_caption_text: null,
  };
  await db.insert(PAGES_TABLE, asRow(page));
  await refreshStoryStats(db, storyId);
  return page;
}

export async function updatePageAssets(
  db: ShippieLocalDb,
  pageId: string,
  patch: Partial<Pick<Page, 'svg_blob_id' | 'audio_blob_id' | 'kid_caption_text'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Page>>(PAGES_TABLE, pageId, patch);
  // Re-derive has_audio on the parent story if we touched audio.
  if ('audio_blob_id' in patch) {
    const pages = await db.query<RowOf<Page>>(PAGES_TABLE, { where: { id: pageId }, limit: 1 });
    const owner = pages[0]?.story_id;
    if (owner) await refreshStoryStats(db, owner);
  }
}

export async function deletePage(db: ShippieLocalDb, pageId: string): Promise<void> {
  await ensureSchema(db);
  const existing = await db.query<RowOf<Page>>(PAGES_TABLE, { where: { id: pageId }, limit: 1 });
  const page = existing[0];
  if (!page) return;
  await db.delete(PAGES_TABLE, pageId);
  // Re-index remaining pages so indices stay contiguous.
  const remaining = await db.query<RowOf<Page>>(PAGES_TABLE, {
    where: { story_id: page.story_id },
    orderBy: { page_index: 'asc' },
  });
  for (let i = 0; i < remaining.length; i++) {
    const p = remaining[i]!;
    if (p.page_index !== i) await db.update<RowOf<Page>>(PAGES_TABLE, p.id, { page_index: i });
  }
  await refreshStoryStats(db, page.story_id);
}

async function refreshStoryStats(db: ShippieLocalDb, storyId: string): Promise<void> {
  const pages = await db.query<RowOf<Page>>(PAGES_TABLE, { where: { story_id: storyId } });
  const has_audio = pages.some((p) => !!p.audio_blob_id) ? 1 : 0;
  await db.update<RowOf<Story>>(STORIES_TABLE, storyId, {
    page_count: pages.length,
    has_audio,
  });
}
