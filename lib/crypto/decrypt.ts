import { fromBase64 } from './utils';

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export async function decryptSecret(
  valueEncrypted: string,
  ivBase64: string,
  key: CryptoKey,
  aad?: string
): Promise<string> {
  try {
    const iv = fromBase64(ivBase64);
    const ciphertext = fromBase64(valueEncrypted);
    const params: AesGcmParams = {
      name: 'AES-GCM',
      iv: iv as any,
      tagLength: 128,
    };
    
    if (aad) {
      params.additionalData = new TextEncoder().encode(aad) as any;
    }
    
    const decrypted = await crypto.subtle.decrypt(params, key, ciphertext as any);
    return new TextDecoder().decode(decrypted);
  } catch (_err) {
    // Never log plaintext / inner errors to avoid leaking key info
    throw new DecryptionError('Failed to decrypt');
  }
}
