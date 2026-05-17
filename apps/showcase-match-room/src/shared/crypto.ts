import {
  decryptJson,
  deriveSpaceKey,
  encryptJson,
} from '@shippie/spaces';

export async function deriveRoomKey(secret: string): Promise<CryptoKey> {
  return deriveSpaceKey(secret, { salt: 'shippie-matchday:relay:v1' });
}

export { decryptJson, encryptJson };
