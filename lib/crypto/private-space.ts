import { fromBase64, toBase64 } from './utils';

const SPACE_KEY_ALGORITHM = { name: 'AES-GCM', length: 256 } as const;
const MEMBER_KEY_ALGORITHM = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
} as const;

type MemberKeyLike = CryptoKey | string;
type RawMemberKey = string;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generateSpaceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(SPACE_KEY_ALGORITHM, true, ['encrypt', 'decrypt']);
}

export async function importMemberPublicKey(publicKeyBase64: RawMemberKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    toArrayBuffer(fromBase64(publicKeyBase64)),
    MEMBER_KEY_ALGORITHM,
    false,
    ['encrypt']
  );
}

export async function importMemberPrivateKey(privateKeyBase64: RawMemberKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(fromBase64(privateKeyBase64)),
    MEMBER_KEY_ALGORITHM,
    false,
    ['decrypt']
  );
}

export async function exportSpaceKey(spaceKey: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', spaceKey);
  return toBase64(rawKey);
}

export async function encryptSpaceKeyForMember(
  spaceKey: CryptoKey,
  memberPublicKey: MemberKeyLike
): Promise<string> {
  const publicKey = typeof memberPublicKey === 'string'
    ? await importMemberPublicKey(memberPublicKey)
    : memberPublicKey;

  const rawKey = await crypto.subtle.exportKey('raw', spaceKey);
  const encrypted = await crypto.subtle.encrypt(MEMBER_KEY_ALGORITHM, publicKey, rawKey);
  return toBase64(encrypted);
}

export async function decryptSpaceKey(
  encryptedSpaceKey: string,
  memberPrivateKey: MemberKeyLike
): Promise<CryptoKey> {
  const privateKey = typeof memberPrivateKey === 'string'
    ? await importMemberPrivateKey(memberPrivateKey)
    : memberPrivateKey;

  const decrypted = await crypto.subtle.decrypt(
    MEMBER_KEY_ALGORITHM,
    privateKey,
    toArrayBuffer(fromBase64(encryptedSpaceKey))
  );

  // The unwrapped space key must remain exportable so an existing member can
  // re-wrap it for newly invited members from their current device.
  return crypto.subtle.importKey('raw', decrypted, SPACE_KEY_ALGORITHM, true, ['encrypt', 'decrypt']);
}
