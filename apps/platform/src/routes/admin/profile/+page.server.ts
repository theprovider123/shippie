import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';
import { getDrizzleClient, schema } from '$server/db/client';

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export const load: PageServerLoad = async (event) => {
  const admin = requireAdmin(event);
  const dbBinding = event.platform?.env.DB;
  if (!dbBinding) {
    return {
      status: 'unavailable' as const,
      profile: {
        id: admin.id,
        email: admin.email,
        username: admin.username,
        displayName: admin.displayName,
        avatarUrl: null,
        headline: null,
        bio: null,
        location: null,
        websiteUrl: null,
        githubUrl: null,
        xUrl: null,
        blueskyUrl: null,
        mastodonUrl: null,
        linkedinUrl: null,
        youtubeUrl: null,
        sponsorUrl: null,
      },
    };
  }

  const db = getDrizzleClient(dbBinding);
  const [profile] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      headline: schema.users.headline,
      bio: schema.users.bio,
      location: schema.users.location,
      websiteUrl: schema.users.websiteUrl,
      githubUrl: schema.users.githubUrl,
      xUrl: schema.users.xUrl,
      blueskyUrl: schema.users.blueskyUrl,
      mastodonUrl: schema.users.mastodonUrl,
      linkedinUrl: schema.users.linkedinUrl,
      youtubeUrl: schema.users.youtubeUrl,
      sponsorUrl: schema.users.sponsorUrl,
    })
    .from(schema.users)
    .where(eq(schema.users.id, admin.id))
    .limit(1);

  return {
    status: 'ready' as const,
    profile: profile ?? {
      id: admin.id,
      email: admin.email,
      username: admin.username,
      displayName: admin.displayName,
      avatarUrl: null,
      headline: null,
      bio: null,
      location: null,
      websiteUrl: null,
      githubUrl: null,
      xUrl: null,
      blueskyUrl: null,
      mastodonUrl: null,
      linkedinUrl: null,
      youtubeUrl: null,
      sponsorUrl: null,
    },
  };
};

export const actions: Actions = {
  save: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });

    const form = await event.request.formData();
    const username = clean(form.get('username'), 32)?.toLowerCase() ?? '';
    const displayName = clean(form.get('displayName'), 80);
    const headline = clean(form.get('headline'), 140);
    const bio = clean(form.get('bio'), 1200);
    const location = clean(form.get('location'), 80);
    const avatarUrl = cleanUrl(form.get('avatarUrl'));

    if (!USERNAME_RE.test(username)) {
      return fail(400, {
        error: 'Username must be 2-32 characters: lowercase letters, numbers, dash, underscore.',
      });
    }
    if (!displayName) return fail(400, { error: 'Display name is required.' });

    const db = getDrizzleClient(event.platform.env.DB);
    try {
      await db
        .update(schema.users)
        .set({
          username,
          displayName,
          avatarUrl,
          headline,
          bio,
          location,
          websiteUrl: cleanUrl(form.get('websiteUrl')),
          githubUrl: profileUrl(form.get('github'), 'https://github.com/'),
          xUrl: profileUrl(form.get('x'), 'https://x.com/'),
          blueskyUrl: blueskyUrl(form.get('bluesky')),
          mastodonUrl: mastodonUrl(form.get('mastodon')),
          linkedinUrl: profileUrl(form.get('linkedin'), 'https://www.linkedin.com/in/'),
          youtubeUrl: youtubeUrl(form.get('youtube')),
          sponsorUrl: cleanUrl(form.get('sponsorUrl')),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.users.id, admin.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('unique')) {
        return fail(409, { error: 'That username is already taken.' });
      }
      console.error('[admin:profile] save failed', err);
      return fail(500, { error: 'Could not save profile.' });
    }

    return { ok: true };
  },
};

function clean(value: FormDataEntryValue | null, max: number): string | null {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || null;
}

function cleanHandle(value: FormDataEntryValue | null, max = 80): string | null {
  const text = clean(value, max);
  if (!text) return null;
  return text.replace(/^@/, '').trim();
}

function cleanUrl(value: FormDataEntryValue | null): string | null {
  const text = clean(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function profileUrl(value: FormDataEntryValue | null, base: string): string | null {
  const direct = cleanUrl(value);
  if (direct) return direct;
  const handle = cleanHandle(value);
  if (!handle) return null;
  return `${base}${encodeURIComponent(handle)}`;
}

function blueskyUrl(value: FormDataEntryValue | null): string | null {
  const direct = cleanUrl(value);
  if (direct) return direct;
  const handle = cleanHandle(value, 120);
  if (!handle) return null;
  return `https://bsky.app/profile/${encodeURIComponent(handle)}`;
}

function mastodonUrl(value: FormDataEntryValue | null): string | null {
  const direct = cleanUrl(value);
  if (direct) return direct;
  const handle = clean(value, 160);
  if (!handle) return null;
  const match = /^@?([^@\s]+)@([^@\s]+)$/.exec(handle);
  if (!match) return null;
  return `https://${match[2]}/@${encodeURIComponent(match[1])}`;
}

function youtubeUrl(value: FormDataEntryValue | null): string | null {
  const direct = cleanUrl(value);
  if (direct) return direct;
  const handle = cleanHandle(value, 120);
  if (!handle) return null;
  return `https://www.youtube.com/@${encodeURIComponent(handle)}`;
}
