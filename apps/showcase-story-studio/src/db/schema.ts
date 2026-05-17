/**
 * Story Studio — local-DB schema.
 *
 * Two tables: stories + pages (one-to-many). All metadata lives in
 * @shippie/local-db (wa-sqlite + OPFS in production, an in-memory
 * fallback for tests + standalone dev). Page assets — the SVG of the
 * drawing and the audio recording — are stored in OPFS via
 * @shippie/local-files. Each page row carries the OPFS path id.
 *
 * Why this split: the drawing + audio blobs can run into hundreds of
 * KB each. Keeping them out of SQL keeps queries snappy and lets the
 * soft 100 MB OPFS budget govern disk pressure on its own.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const STORIES_TABLE = 'stories';
export const PAGES_TABLE = 'pages';

export const storiesSchema: LocalDbSchema = {
  id: 'text primary key',
  title: 'text not null',
  made_by: 'text not null',
  made_at: 'datetime',
  page_count: 'integer',
  has_audio: 'integer',
  shared_at: 'datetime',
};

export const pagesSchema: LocalDbSchema = {
  id: 'text primary key',
  story_id: 'text not null',
  page_index: 'integer not null',
  svg_blob_id: 'text',
  audio_blob_id: 'text',
  kid_caption_text: 'text',
};

export interface Story {
  id: string;
  /** Parent-controlled title. Defaults to "Untitled story" until the parent edits it. */
  title: string;
  /**
   * Display-name of the kid who made the story. Set by the parent on
   * pairing ("Lily"). Stored per-story so renaming the kid in settings
   * doesn't rewrite history.
   */
  made_by: string;
  made_at: string;
  page_count: number;
  /** 0 or 1 — wa-sqlite has no native bool. */
  has_audio: number;
  /** ISO timestamp of last successful share, or null. */
  shared_at: string | null;
}

export interface Page {
  id: string;
  story_id: string;
  /** Zero-indexed position within the story. */
  page_index: number;
  /** OPFS path of the page's SVG (e.g. "stories/abc/0.svg"), or null on a fresh page. */
  svg_blob_id: string | null;
  /** OPFS path of the page's audio recording, or null. */
  audio_blob_id: string | null;
  /** Optional caption the parent or older kid typed. The squiggle stays a squiggle — no AI fill. */
  kid_caption_text: string | null;
}

export interface StoryWithPages extends Story {
  pages: Page[];
}
