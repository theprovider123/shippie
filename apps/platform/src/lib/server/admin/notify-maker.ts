/**
 * Maker-facing notifications for admin moderation actions.
 *
 * The platform promise is "Shippie doesn't intervene; admin moderates after
 * the fact." For that to feel open rather than silent, every admin action
 * that affects a maker's app or feedback must produce a notification with
 * the reason and an appeal contact.
 *
 * This helper is best-effort: if the EMAIL binding is missing (dev) or
 * fetching the maker's email fails, we log + swallow so the audit action
 * itself never gets blocked by a side-channel failure. The audit_log row
 * is the source of truth; this is just the "tell the maker" follow-up.
 */
import { eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';

interface CloudflareEmailBinding {
  send(input: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

interface NotifyEnv {
  EMAIL?: CloudflareEmailBinding;
  AUTH_EMAIL_FROM?: string;
  PUBLIC_ORIGIN?: string;
  SHIPPIE_ENV?: string;
}

const DEFAULT_FROM = 'Shippie <login@shippie.app>';
const DEFAULT_ORIGIN = 'https://shippie.app';

export interface TakedownNotification {
  appId: string;
  slug: string;
  makerId: string;
  /** Free-text reason. May be null when admin didn't supply one. */
  reason: string | null;
  /** Enforcement category if this is a suspension. Null for cleanup archive. */
  suspensionReason: 'dmca' | 'policy_violation' | 'spam' | string | null;
}

export async function notifyMakerOfTakedown(
  env: NotifyEnv,
  db: ShippieDb,
  input: TakedownNotification,
): Promise<void> {
  try {
    const [maker] = await db
      .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, input.makerId))
      .limit(1);

    if (!maker?.email) {
      // No email on file — common for trial-only accounts. Skip silently.
      return;
    }

    const origin = env.PUBLIC_ORIGIN ?? DEFAULT_ORIGIN;
    const from = env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM;
    const isSuspension = Boolean(input.suspensionReason);
    const subject = isSuspension
      ? `[Shippie] Your app ${input.slug} has been suspended`
      : `[Shippie] Your app ${input.slug} was archived`;
    const text = renderText(input, origin, isSuspension);
    const html = renderHtml(input, origin, isSuspension);

    if (env.EMAIL) {
      await env.EMAIL.send({ to: maker.email, from, subject, text, html });
      return;
    }

    if (env.SHIPPIE_ENV === 'production') {
      // EMAIL binding missing in production — log so wrangler tail picks it up.
      // Don't throw: the moderation action already landed in D1 + audit_log.
      console.warn('[shippie:notify-maker] EMAIL binding missing in production', {
        appSlug: input.slug,
        makerId: input.makerId,
      });
      return;
    }

    // Dev/canary fallback — banner.
    const banner = '='.repeat(72);
    console.log(`\n${banner}`);
    console.log('[shippie:notify-maker] takedown notice');
    console.log(`  to:      ${maker.email}`);
    console.log(`  app:     ${input.slug}`);
    console.log(`  kind:    ${isSuspension ? 'SUSPENSION' : 'archive'}`);
    console.log(`  reason:  ${input.reason ?? '(none)'}`);
    if (isSuspension) console.log(`  category: ${input.suspensionReason}`);
    console.log(`${banner}\n`);
  } catch (err) {
    // Side-channel failure must not bubble up — the moderation action
    // already succeeded. Log and move on.
    console.warn('[shippie:notify-maker] failed to notify maker', {
      appSlug: input.slug,
      makerId: input.makerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function renderText(
  input: TakedownNotification,
  origin: string,
  isSuspension: boolean,
): string {
  const lines: string[] = [];
  lines.push(
    isSuspension
      ? `Your app "${input.slug}" has been suspended by a Shippie moderator.`
      : `Your app "${input.slug}" was archived by a Shippie moderator.`,
  );
  lines.push('');
  if (input.reason) {
    lines.push(`Reason: ${input.reason}`);
    lines.push('');
  }
  if (isSuspension && input.suspensionReason) {
    lines.push(`Category: ${input.suspensionReason}`);
    lines.push('');
  }
  lines.push(`You can review the app in your dashboard:`);
  lines.push(`  ${origin}/maker/apps/${input.slug}`);
  lines.push('');
  lines.push(
    `If you believe this was a mistake, reply to this email and we'll review the decision.`,
  );
  lines.push('');
  lines.push(`— Shippie`);
  return lines.join('\n');
}

function renderHtml(
  input: TakedownNotification,
  origin: string,
  isSuspension: boolean,
): string {
  const safeReason = input.reason ? escapeHtml(input.reason) : null;
  const safeSlug = escapeHtml(input.slug);
  const safeCategory = input.suspensionReason ? escapeHtml(input.suspensionReason) : null;
  const dashboardUrl = `${origin}/maker/apps/${encodeURIComponent(input.slug)}`;

  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 18px; margin: 0 0 16px;">
    ${isSuspension ? `Your app <code>${safeSlug}</code> has been suspended` : `Your app <code>${safeSlug}</code> was archived`}
  </h1>
  ${safeReason ? `<p><strong>Reason:</strong> ${safeReason}</p>` : ''}
  ${safeCategory && isSuspension ? `<p><strong>Category:</strong> ${safeCategory}</p>` : ''}
  <p>You can review the app in your dashboard:</p>
  <p><a href="${dashboardUrl}" style="color: #E8603C;">${dashboardUrl}</a></p>
  <p>If you believe this was a mistake, reply to this email and we'll review the decision.</p>
  <p style="color: #6b6b6b; margin-top: 24px;">— Shippie</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
