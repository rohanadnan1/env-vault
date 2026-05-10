import { fromBase64, toBase64, generateRandomBytes } from './utils';
import { deriveKeyFromPassphrase, encryptShareBundle, decryptShareBundle } from './share';

export interface ShareKeyBundle {
  shareEncryptionSalt: string;
  encryptedShareKey: string;
  shareKeyIv: string;
}

export interface ReEncryptedContent {
  bundleEncrypted: string;
  bundleIv: string;
}

/**
 * Generate a random share encryption salt (32 bytes, base64).
 */
export function generateShareEncryptionSalt(): string {
  const bytes = generateRandomBytes(32);
  return toBase64(bytes);
}

/**
 * Generate a fresh share key (AES-GCM-256) and salt.
 * Returns the key + salt for re-encrypting content.
 */
export async function generateShareKey(existingSalt?: string): Promise<{
  shareKey: CryptoKey;
  shareEncryptionSalt: string;
}> {
  const salt = existingSalt || generateShareEncryptionSalt();
  const saltBytes = fromBase64(salt);

  const baseKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  return { shareKey: baseKey, shareEncryptionSalt: salt };
}

/**
 * Wrap a share key with a passphrase-derived transport key (PBKDF2).
 * The transport key protects the share key so only the recipient
 * who knows the passphrase can unwrap it.
 */
export async function wrapShareKey(
  shareKey: CryptoKey,
  passphrase: string,
  salt: string
): Promise<{ encryptedShareKey: string; shareKeyIv: string }> {
  const transportKey = await deriveKeyFromPassphrase(passphrase, salt);
  const rawShareKey = await crypto.subtle.exportKey('raw', shareKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    transportKey,
    rawShareKey
  );

  return {
    encryptedShareKey: toBase64(new Uint8Array(encrypted)),
    shareKeyIv: toBase64(iv)
  };
}

/**
 * Unwrap a share key using the passphrase-derived transport key.
 */
export async function unwrapShareKey(
  encryptedShareKey: string,
  shareKeyIv: string,
  passphrase: string,
  salt: string
): Promise<CryptoKey> {
  const transportKey = await deriveKeyFromPassphrase(passphrase, salt);
  const encrypted = fromBase64(encryptedShareKey);
  const iv = fromBase64(shareKeyIv);

  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    transportKey,
    encrypted as any
  );

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Re-encrypt a plaintext resource with a share key for collaborative sharing.
 * Returns ciphertext + IV for storage in the invitation.
 */
export async function reEncryptContent(
  plaintext: string,
  shareKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    shareKey,
    encoder.encode(plaintext)
  );

  return {
    encrypted: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv)
  };
}

/**
 * Decrypt content that was re-encrypted with a share key.
 */
export async function decryptContent(
  encrypted: string,
  iv: string,
  shareKey: CryptoKey
): Promise<string> {
  const ciphertext = fromBase64(encrypted);
  const ivBytes = fromBase64(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as any },
    shareKey,
    ciphertext as any
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Test block: verify that a provided passphrase can correctly unwrap
 * and decrypt content. Used during accept flow to validate.
 */
export async function verifyPassphraseForInvitation(
  encryptedShareKey: string,
  shareKeyIv: string,
  salt: string,
  testEncrypted: string,
  testIv: string,
  passphrase: string
): Promise<boolean> {
  try {
    const shareKey = await unwrapShareKey(encryptedShareKey, shareKeyIv, passphrase, salt);
    await decryptContent(testEncrypted, testIv, shareKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Package a list of secrets into a share bundle string.
 */
export function packageSecretsBundle(secrets: { keyName: string; value: string }[]): string {
  return JSON.stringify(secrets);
}

/**
 * Package a file's content into a share bundle string.
 */
export function packageFileBundle(name: string, content: string, mimeType?: string): string {
  return JSON.stringify({ name, content, mimeType: mimeType || 'text/plain', type: 'FILE' });
}

/**
 * Unpack a secrets bundle string back to key-value pairs.
 */
export function unpackSecretsBundle(bundle: string): { keyName: string; value: string }[] {
  return JSON.parse(bundle);
}

/**
 * Unpack a file bundle string back to the file object.
 */
export function unpackFileBundle(bundle: string): { name: string; content: string; mimeType: string; type: string } {
  return JSON.parse(bundle);
}

/**
 * Legacy compat: re-encrypt content using the share key + a token AAD.
 * Used when sharing content with the same encryption pattern as existing shares.
 */
export async function reEncryptContentWithAad(
  plaintext: string,
  shareKey: CryptoKey,
  token: string
): Promise<{ bundleEncrypted: string; bundleIv: string }> {
  return encryptShareBundle(plaintext, shareKey, token);
}
