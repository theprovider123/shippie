import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform?.env.DB) throw error(503, 'database unavailable');
  const username = params.atname.slice(1).toLowerCase();
  const db = getDrizzleClient(platform.env.DB);

  const [maker] = await db
    .select({
      id: schema.users.id,
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
      verifiedMaker: schema.users.verifiedMaker,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  if (!maker) throw error(404, 'builder not found');

  const apps = await db
    .select({
      slug: schema.apps.slug,
      name: schema.apps.name,
      tagline: schema.apps.tagline,
      description: schema.apps.description,
      category: schema.apps.category,
      iconUrl: schema.apps.iconUrl,
      themeColor: schema.apps.themeColor,
      upvoteCount: schema.apps.upvoteCount,
      installCount: schema.apps.installCount,
      currentDetectedKind: schema.apps.currentDetectedKind,
      lastDeployedAt: schema.apps.lastDeployedAt,
    })
    .from(schema.apps)
    .where(
      and(
        eq(schema.apps.makerId, maker.id),
        eq(schema.apps.visibilityScope, 'public'),
        eq(schema.apps.isArchived, false),
      ),
    )
    .orderBy(desc(schema.apps.lastDeployedAt), desc(schema.apps.createdAt))
    .limit(24);

  return {
    maker,
    links: socialLinks(maker),
    apps,
  };
};

function socialLinks(maker: {
  websiteUrl: string | null;
  githubUrl: string | null;
  xUrl: string | null;
  blueskyUrl: string | null;
  mastodonUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  sponsorUrl: string | null;
}) {
  return [
    ['Website', maker.websiteUrl],
    ['GitHub', maker.githubUrl],
    ['X', maker.xUrl],
    ['Bluesky', maker.blueskyUrl],
    ['Mastodon', maker.mastodonUrl],
    ['LinkedIn', maker.linkedinUrl],
    ['YouTube', maker.youtubeUrl],
    ['Support', maker.sponsorUrl],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, href]) => ({ label, href }));
}
