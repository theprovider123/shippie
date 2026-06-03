export const PRIVATE_SPACE_JOIN_VALUE = 'private-space';

export function privateJoinUrlForApp(
  appSlug: string,
  opts: { transferId?: string | null; spaceId?: string | null; role?: string | null; joinToken?: string | null } = {},
): string {
  const params = new URLSearchParams([
    ['app', appSlug],
    ['focused', '1'],
    ['join', PRIVATE_SPACE_JOIN_VALUE],
  ]);
  const transferId = transferIdFromValue(opts.transferId);
  if (transferId) params.set('transfer', transferId);
  const spaceId = spaceIdFromValue(opts.spaceId);
  if (spaceId) params.set('space', spaceId);
  const role = roleFromValue(opts.role);
  if (role) params.set('role', role);
  const joinToken = joinTokenFromValue(opts.joinToken);
  if (joinToken) params.set('space_join', joinToken);
  return `/dock?${params.toString()}`;
}

export function isPrivateJoinRequest(url: URL): boolean {
  const value = url.searchParams.get('join');
  return value === PRIVATE_SPACE_JOIN_VALUE || value === 'invite';
}

export function privateJoinTransferIdFromUrl(url: URL): string | null {
  return transferIdFromValue(
    url.searchParams.get('shippie-restore') ??
      url.searchParams.get('transfer') ??
      url.searchParams.get('code'),
  );
}

export function privateJoinSpaceIdFromUrl(url: URL): string | null {
  return spaceIdFromValue(url.searchParams.get('space') ?? url.searchParams.get('room'));
}

export function privateJoinRoleFromUrl(url: URL): string | null {
  return roleFromValue(url.searchParams.get('role') ?? url.searchParams.get('space_role'));
}

export function privateJoinJoinTokenFromUrl(url: URL): string | null {
  return joinTokenFromValue(url.searchParams.get('space_join') ?? url.searchParams.get('join_token'));
}

export function privateJoinSpaceIdFromValue(value: string | null | undefined): string | null {
  return spaceIdFromValue(value);
}

export function privateJoinRoleFromValue(value: string | null | undefined): string | null {
  return roleFromValue(value);
}

export function privateJoinJoinTokenFromValue(value: string | null | undefined): string | null {
  return joinTokenFromValue(value);
}

export function transferIdFromValue(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hash = url.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const fromUrl =
      hashParams.get('shippie-restore') ??
      url.searchParams.get('shippie-restore') ??
      url.searchParams.get('transfer') ??
      url.searchParams.get('code');
    if (fromUrl) return transferIdFromValue(fromUrl);
  } catch {
    // Raw transfer codes are expected.
  }
  const match = raw.match(/\btransfer_[A-Za-z0-9_-]{8,}\b/);
  if (match) return match[0] ?? null;
  return null;
}

function spaceIdFromValue(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^[A-Za-z0-9_-]{3,80}$/.test(raw)) return null;
  return raw;
}

function roleFromValue(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^[a-z][a-z0-9_-]{0,63}$/.test(raw)) return null;
  return raw;
}

function joinTokenFromValue(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^[A-Za-z0-9_-]{3,120}$/.test(raw)) return null;
  return raw;
}
