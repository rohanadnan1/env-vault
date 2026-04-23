/**
 * Client-side crypto for recovery codes and 2FA vault unlock.
 * All encryption/decryption happens in the browser — the server never sees plaintext.
 */

// ── Recovery codes ────────────────────────────────────────────────────────────

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 16)}`;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.toLowerCase().replace(/-/g, '');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveKeyFromCode(normalizedHex: string, saltBase64: string): Promise<CryptoKey> {
  const codeBytes = Uint8Array.from(
    normalizedHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
  );
  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
  const ikm = await crypto.subtle.importKey('raw', codeBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      hash: 'SHA-256',
      info: new TextEncoder().encode('envault-recovery-v1'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMasterWithCode(
  code: string,
  masterPassword: string
): Promise<{ encryptedMaster: string; masterIv: string; codeSalt: string; codeHash: string }> {
  const normalized = code.toLowerCase().replace(/-/g, '');
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const codeSalt = btoa(String.fromCharCode(...salt));

  const key = await deriveKeyFromCode(normalized, codeSalt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(masterPassword)
  );

  return {
    encryptedMaster: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    masterIv: btoa(String.fromCharCode(...iv)),
    codeSalt,
    codeHash: await hashRecoveryCode(code),
  };
}

export async function decryptMasterWithCode(
  code: string,
  encryptedMaster: string,
  masterIv: string,
  codeSalt: string
): Promise<string> {
  const normalized = code.toLowerCase().replace(/-/g, '');
  const key = await deriveKeyFromCode(normalized, codeSalt);
  const ciphertext = Uint8Array.from(atob(encryptedMaster), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(masterIv), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── 2FA vault unlock ──────────────────────────────────────────────────────────

async function deriveKeyFromToken(unlockTokenBase64: string): Promise<CryptoKey> {
  const tokenBytes = Uint8Array.from(atob(unlockTokenBase64), (c) => c.charCodeAt(0));
  const ikm = await crypto.subtle.importKey('raw', tokenBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(32),
      hash: 'SHA-256',
      info: new TextEncoder().encode('envault-2fa-unlock-v1'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function generateUnlockToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

export async function encryptMasterWith2FA(
  masterPassword: string,
  unlockToken: string
): Promise<{ encryptedMaster: string; masterIv: string }> {
  const key = await deriveKeyFromToken(unlockToken);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(masterPassword)
  );
  return {
    encryptedMaster: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    masterIv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptMasterWith2FA(
  unlockToken: string,
  encryptedMaster: string,
  masterIv: string
): Promise<string> {
  const key = await deriveKeyFromToken(unlockToken);
  const ciphertext = Uint8Array.from(atob(encryptedMaster), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(masterIv), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
