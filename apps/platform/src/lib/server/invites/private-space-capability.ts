import { hmacSha256Hex, timingSafeEqualHex } from '$server/internal/hmac';
import {
  privateJoinJoinTokenFromUrl,
  privateJoinJoinTokenFromValue,
  privateJoinRoleFromUrl,
  privateJoinRoleFromValue,
  privateJoinSpaceIdFromUrl,
  privateJoinSpaceIdFromValue,
  privateJoinTransferIdFromUrl,
  transferIdFromValue,
} from './private-join';

export const PRIVATE_SPACE_SIGNATURE_PARAM = 'space_sig';

export interface PrivateSpaceCapability {
  appSlug: string;
  inviteToken: string;
  spaceId: string;
  role: string;
  joinToken: string;
  transferId?: string | null;
}

export function privateSpaceCapabilityFromValues(input: {
  appSlug: string;
  inviteToken: string;
  spaceId?: string | null;
  role?: string | null;
  joinToken?: string | null;
  transferId?: string | null;
}): PrivateSpaceCapability | null {
  const spaceId = privateJoinSpaceIdFromValue(input.spaceId);
  const role = privateJoinRoleFromValue(input.role);
  const joinToken = privateJoinJoinTokenFromValue(input.joinToken);
  if (!spaceId || !role || !joinToken) return null;
  return {
    appSlug: input.appSlug,
    inviteToken: input.inviteToken,
    spaceId,
    role,
    joinToken,
    transferId: transferIdFromValue(input.transferId),
  };
}

export function hasPrivateSpaceCapabilityParams(url: URL): boolean {
  return (
    url.searchParams.has('space') ||
    url.searchParams.has('room') ||
    url.searchParams.has('role') ||
    url.searchParams.has('space_role') ||
    url.searchParams.has('space_join') ||
    url.searchParams.has('join_token') ||
    url.searchParams.has(PRIVATE_SPACE_SIGNATURE_PARAM)
  );
}

export function privateSpaceCapabilityFromUrl(
  url: URL,
  input: { appSlug: string; inviteToken: string },
): PrivateSpaceCapability | null {
  return privateSpaceCapabilityFromValues({
    appSlug: input.appSlug,
    inviteToken: input.inviteToken,
    spaceId: privateJoinSpaceIdFromUrl(url),
    role: privateJoinRoleFromUrl(url),
    joinToken: privateJoinJoinTokenFromUrl(url),
    transferId: privateJoinTransferIdFromUrl(url),
  });
}

export async function signPrivateSpaceCapability(
  secret: string,
  capability: PrivateSpaceCapability,
): Promise<string> {
  return hmacSha256Hex(secret, canonicalCapability(capability));
}

export async function verifyPrivateSpaceCapability(
  secret: string,
  capability: PrivateSpaceCapability,
  signature: string | null,
): Promise<boolean> {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = await signPrivateSpaceCapability(secret, capability);
  return timingSafeEqualHex(expected, signature.toLowerCase());
}

export async function appendSignedPrivateSpaceCapability(
  rawUrl: string,
  secret: string,
  capability: PrivateSpaceCapability,
): Promise<string> {
  const url = new URL(rawUrl);
  url.searchParams.set('space', capability.spaceId);
  url.searchParams.set('role', capability.role);
  url.searchParams.set('space_join', capability.joinToken);
  if (capability.transferId) url.searchParams.set('transfer', capability.transferId);
  url.searchParams.set(PRIVATE_SPACE_SIGNATURE_PARAM, await signPrivateSpaceCapability(secret, capability));
  return url.toString();
}

function canonicalCapability(capability: PrivateSpaceCapability): string {
  return JSON.stringify({
    appSlug: capability.appSlug,
    inviteToken: capability.inviteToken,
    spaceId: capability.spaceId,
    role: capability.role,
    joinToken: capability.joinToken,
    transferId: capability.transferId ?? null,
  });
}
