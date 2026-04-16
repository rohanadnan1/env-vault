import { fromBase64 } from './utils';

export async function deriveVaultKey(
  masterPassword: string,
  saltBase64: string,
  iterations = 600_000
): Promise<CryptoKey> {
  const salt = fromBase64(saltBase64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false — key must never be extractable from memory as raw bytes
    ['encrypt', 'decrypt']
  );
}
