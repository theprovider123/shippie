export const PRIVATE_SPACE_JOIN_VALUE = 'private-space';

export function privateJoinUrlForApp(
  appSlug: string,
  opts: { transferId?: string | null } = {},
): string {
  const params = new URLSearchParams([
    ['app', appSlug],
    ['focused', '1'],
    ['join', PRIVATE_SPACE_JOIN_VALUE],
  ]);
  const transferId = transferIdFromValue(opts.transferId);
  if (transferId) params.set('transfer', transferId);
  return `/container?${params.toString()}`;
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
