import { fromBase64, toBase64 } from './utils';

/**
 * Derives a key from a passphrase and salt using PBKDF2.
 * Used for both Master Key and Share Key.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltBase64: string,
  iterations = 600_000
): Promise<CryptoKey> {
  const salt = fromBase64(saltBase64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a bundle of secrets for sharing.
 * The bundle is a JSON string of re-encrypted secrets.
 * AAD is tied to the token to prevent cut-and-paste attacks between shares.
 */
export async function encryptShareBundle(
  plaintextBundle: string,
  shareKey: CryptoKey,
  token: string
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
      additionalData: encoder.encode(token) as any
    },
    shareKey,
    encoder.encode(plaintextBundle) as any
  );

  return {
    bundleEncrypted: toBase64(new Uint8Array(encrypted)),
    bundleIv: toBase64(iv)
  };
}

/**
 * Decrypts a shared bundle using the provided share key and token.
 */
export async function decryptShareBundle(
  bundleEncrypted: string,
  bundleIv: string,
  shareKey: CryptoKey,
  token: string
) {
  const encrypted = fromBase64(bundleEncrypted);
  const iv = fromBase64(bundleIv);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
      additionalData: encoder.encode(token) as any
    },
    shareKey,
    encrypted as any
  );

  return decoder.decode(decrypted);
}
