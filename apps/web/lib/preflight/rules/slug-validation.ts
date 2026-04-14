/**
 * slug-validation
 *
 * Ensures:
 *   - slug is present (auto-drafted from name if missing)
 *   - slug matches [a-z0-9][a-z0-9-]{0,50}[a-z0-9]? (DNS-safe)
 *   - slug is not in reserved_slugs
 *
 * Spec v6 §18.2, §10.4.
 */
import type { PreflightRule } from '../types.ts';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const slugValidationRule: PreflightRule = {
  id: 'slug-validation',
  title: 'Slug validation',
  async run(ctx) {
    const { manifest, reservedSlugs } = ctx.input;

    if (!manifest.slug) {
      // Auto-draft: generate from the name
      const draft = slugify(manifest.name);
      const applied = await ctx.remediate(
        'derive-slug-from-name',
        `Generated slug '${draft}' from app name '${manifest.name}'`,
        () => {
          (manifest as { slug?: string }).slug = draft;
        },
      );
      if (!applied) {
        return [
          {
            rule: this.id,
            severity: 'block',
            title: 'Missing slug',
            detail: 'shippie.json.slug is required and could not be auto-derived.',
          },
        ];
      }
    }

    const slug = manifest.slug!;

    if (!SLUG_RE.test(slug)) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: 'Invalid slug format',
          detail:
            'Slug must be 1-63 chars, lowercase letters/digits/hyphens, starting and ending with a letter or digit.',
          metadata: { slug },
        },
      ];
    }

    if (reservedSlugs.has(slug)) {
      return [
        {
          rule: this.id,
          severity: 'block',
          title: `Slug '${slug}' is reserved`,
          detail: 'System reserved names and known brand names cannot be claimed.',
          metadata: { slug },
        },
      ];
    }

    return [{ rule: this.id, severity: 'pass', title: `Slug '${slug}' is valid` }];
  },
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}
