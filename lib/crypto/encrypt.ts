import { toBase64 } from './utils';

export async function encryptSecret(
  plaintext: string,
  key: CryptoKey,
  aad?: string
): Promise<{ valueEncrypted: string; iv: string }> {
  // Generate fresh 12-byte IV with crypto.getRandomValues every call — never reuse IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as any,
    tagLength: 128,
  };
  
  if (aad) {
    params.additionalData = new TextEncoder().encode(aad) as any;
  }
  
  const ciphertext = await crypto.subtle.encrypt(params, key, encoded);
  return { valueEncrypted: toBase64(ciphertext), iv: toBase64(iv) };
}
