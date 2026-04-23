import { postJson, getJson, delJson } from '../api.js';

export interface InviteCreateInput {
  slug: string;
  apiUrl: string;
  maxUses?: number;
  expiresDays?: number;
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
  const res = await postJson<{ invite: { id: string; token: string }; url: string }>(
    { apiUrl: opts.apiUrl },
    `/api/apps/${opts.slug}/invites`,
    body,
  );
  log('invite created');
  log(`  url: ${res.url}`);
  log(`  token: ${res.invite.token}`);
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
