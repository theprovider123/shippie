import { eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';

export type TrialClaimResult =
  | { claimed: true; slug: string }
  | {
      claimed: false;
      reason:
        | 'missing'
        | 'already_claimed'
        | 'expired'
        | 'not_trial'
        | 'missing_receipt'
        | 'invalid_receipt';
    };

export interface TrialClaimReceiptInput {
  slug: string;
  appId: string;
  deployId: string;
  zipSha256: string;
  expiresAt: string;
  now?: Date;
}

export interface TrialClaimReceiptPayload {
  typ: 'shippie_trial_claim';
  v: 1;
  slug: string;
  app_id: string;
  deploy_id: string;
  zip_sha256: string;
  iat: number;
  exp: number;
}

export async function claimTrialAppForMaker(input: {
  db: ShippieDb;
  slug: string;
  makerId: string;
  receipt?: string | null;
  receiptSecret?: string | null;
  now?: Date;
}): Promise<TrialClaimResult> {
  const claimTrialSlug = input.slug.trim();
  if (!claimTrialSlug) return { claimed: false, reason: 'missing' };

  const [trialApp] = await input.db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      isTrial: schema.apps.isTrial,
      trialUntil: schema.apps.trialUntil,
      trialClaimedBy: schema.apps.trialClaimedBy,
    })
    .from(schema.apps)
    .where(eq(schema.apps.slug, claimTrialSlug))
    .limit(1);

  if (!trialApp) return { claimed: false, reason: 'missing' };
  if (!trialApp.isTrial) return { claimed: false, reason: 'not_trial' };
  if (trialApp.trialClaimedBy) return { claimed: false, reason: 'already_claimed' };
  if (trialApp.trialUntil && trialApp.trialUntil <= (input.now ?? new Date()).toISOString()) {
    return { claimed: false, reason: 'expired' };
  }
  if (input.receiptSecret) {
    if (!input.receipt) return { claimed: false, reason: 'missing_receipt' };
    const receipt = await verifyTrialClaimReceipt(input.receipt, input.receiptSecret, {
      slug: trialApp.slug,
      appId: trialApp.id,
      now: input.now,
    });
    if (!receipt) return { claimed: false, reason: 'invalid_receipt' };
  }

  await input.db
    .update(schema.apps)
    .set({
      makerId: input.makerId,
      isTrial: false,
      trialClaimedBy: input.makerId,
      trialIpHash: null,
      updatedAt: (input.now ?? new Date()).toISOString(),
    })
    .where(eq(schema.apps.id, trialApp.id));

  return { claimed: true, slug: trialApp.slug };
}

export async function createTrialClaimReceipt(
  input: TrialClaimReceiptInput,
  secret: string,
): Promise<string> {
  const now = input.now ?? new Date();
  const payload: TrialClaimReceiptPayload = {
    typ: 'shippie_trial_claim',
    v: 1,
    slug: input.slug,
    app_id: input.appId,
    deploy_id: input.deployId,
    zip_sha256: input.zipSha256,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(Date.parse(input.expiresAt) / 1000),
  };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyTrialClaimReceipt(
  token: string,
  secret: string,
  opts: { slug: string; appId: string; now?: Date },
): Promise<TrialClaimReceiptPayload | null> {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;
  const expected = await sign(encodedPayload, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  let payload: TrialClaimReceiptPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch {
    return null;
  }

  if (payload.typ !== 'shippie_trial_claim') return null;
  if (payload.v !== 1) return null;
  if (payload.slug !== opts.slug) return null;
  if (payload.app_id !== opts.appId) return null;
  if (!payload.deploy_id || !payload.zip_sha256) return null;
  const nowSeconds = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (payload.exp <= nowSeconds) return null;
  return payload;
}

async function sign(encodedPayload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/').padEnd(
    Math.ceil(input.length / 4) * 4,
    '=',
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
