import { createHmac, timingSafeEqual } from 'crypto';

function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a base32 secret.
 * Accepts ±1 time-step window (30 s each) to account for clock drift.
 * Returns true only if the code is correct — never throws.
 */
export function verifyTotp(token: string, secretBase32: string): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    const step = Math.floor(Date.now() / 1000 / 30);
    const tokenBuf = Buffer.from(clean);
    for (const delta of [-1, 0, 1]) {
      const expected = hotp(secretBase32, step + delta);
      const expectedBuf = Buffer.from(expected);
      if (
        tokenBuf.length === expectedBuf.length &&
        timingSafeEqual(tokenBuf, expectedBuf)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
