import { createClient, type DeployVisibility } from '@shippie/core';

export async function visibilityCommand(
  slug: string,
  visibility: string,
  opts: { api?: string; org?: string },
) {
  const scope = parseVisibility(visibility);
  if (!scope) {
    console.error('Invalid visibility. Use one of: public, unlisted, private, team.');
    process.exit(1);
  }
  if (scope === 'team' && !opts.org) {
    console.error('Team visibility requires --org <org-id-or-slug>.');
    process.exit(1);
  }

  const client = createClient({ apiUrl: opts.api ?? 'https://shippie.app' });
  const result = await client.visibility({
    slug,
    visibility: scope,
    organization: opts.org,
  });
  if (!result.ok) {
    console.error('Visibility update failed:', result.error ?? 'unknown_error');
    process.exit(1);
  }
  console.log(`${slug} visibility is now ${scope}.`);
}

export async function promoteCommand(
  slug: string,
  opts: { to?: string; api?: string; org?: string },
) {
  const target = opts.to ?? 'public';
  return visibilityCommand(slug, target, opts);
}

function parseVisibility(input: string): DeployVisibility | null {
  return input === 'public' || input === 'unlisted' || input === 'private' || input === 'team'
    ? input
    : null;
}
