import { postJson, getJson, delJson } from '../api.js';

export interface InviteCreateInput {
  slug: string;
  apiUrl: string;
  maxUses?: number;
  expiresDays?: number;
  spaceInvite?: boolean;
  spaceId?: string;
  role?: string;
  joinToken?: string;
  log?: (s: string) => void;
}

export async function inviteCreate(opts: InviteCreateInput): Promise<void> {
  const log = opts.log ?? console.log;
  const body: Record<string, unknown> = { kind: 'link' };
  if (opts.maxUses) body.max_uses = opts.maxUses;
  if (opts.expiresDays) {
    const d = new Date();
    d.setDate(d.getDate() + opts.expiresDays);
    body.expires_at = d.toISOString();
  }
  const spaceId = opts.spaceId ?? (opts.spaceInvite || opts.role ? randomId(opts.slug) : undefined);
  const role = opts.role ?? (opts.spaceInvite ? 'member' : undefined);
  const joinToken = opts.joinToken ?? (spaceId ? randomId('join') : undefined);
  if (spaceId && role && joinToken) {
    body.space_id = spaceId;
    body.space_role = role;
    body.space_join = joinToken;
  }
  const res = await postJson<{ invite: { id: string; token: string }; url: string; short_url?: string | null }>(
    { apiUrl: opts.apiUrl },
    `/api/apps/${opts.slug}/invites`,
    body,
  );
  const url = res.short_url ?? res.url;
  log('invite created');
  log(`  url: ${url}`);
  if (spaceId && role) log(`  space: ${spaceId} (${role})`);
  log(`  token: ${res.invite.token}`);
}

function randomId(prefix: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`;
}

export interface InviteListInput {
  slug: string;
  apiUrl: string;
  log?: (s: string) => void;
}

export async function inviteList(opts: InviteListInput): Promise<void> {
  const log = opts.log ?? console.log;
  const res = await getJson<{
    invites: Array<{
      id: string;
      token: string;
      kind: string;
      usedCount: number;
      maxUses: number | null;
    }>;
  }>({ apiUrl: opts.apiUrl }, `/api/apps/${opts.slug}/invites`);
  if (res.invites.length === 0) {
    log('(no active invites)');
    return;
  }
  for (const inv of res.invites) {
    const uses = inv.maxUses == null ? 'unlimited' : `${inv.maxUses - inv.usedCount} left`;
    log(`  ${inv.token}  ${inv.kind}  ${uses}`);
  }
}

export interface InviteRevokeInput {
  slug: string;
  id: string;
  apiUrl: string;
  log?: (s: string) => void;
}

export async function inviteRevoke(opts: InviteRevokeInput): Promise<void> {
  const log = opts.log ?? console.log;
  await delJson({ apiUrl: opts.apiUrl }, `/api/apps/${opts.slug}/invites/${opts.id}`);
  log('revoked');
}
