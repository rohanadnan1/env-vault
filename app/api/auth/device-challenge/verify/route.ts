import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHash } from 'crypto';
import { verifyTotp } from '@/lib/totp';
import { z } from 'zod';

const Schema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1),
  codeType: z.enum(['totp', 'recovery']),
  trustDevice: z.boolean().default(false),
  deviceId: z.string().min(1),
  userAgent: z.string().optional(),
});

function getDeviceLabel(ua: string): string {
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';

  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { challengeId, code, codeType, trustDevice, deviceId, userAgent } = Schema.parse(body);

    const challenge = await db.loginChallenge.findUnique({
      where: { id: challengeId },
      include: { user: { select: { id: true, totpSecret: true } } },
    });

    if (!challenge || challenge.verified || challenge.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Challenge expired or invalid' }, { status: 400 });
    }

    if (challenge.deviceId !== deviceId) {
      return NextResponse.json({ error: 'Device mismatch' }, { status: 400 });
    }

    const user = challenge.user;

    if (codeType === 'totp') {
      if (!user.totpSecret) {
        return NextResponse.json({ error: '2FA is not enabled on this account' }, { status: 400 });
      }
      if (!verifyTotp(code, user.totpSecret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
      }
    } else {
      // Recovery code
      const normalized = code.toLowerCase().replace(/-/g, '').trim();
      if (normalized.length !== 16 || !/^[0-9a-f]+$/.test(normalized)) {
        return NextResponse.json({ error: 'Invalid recovery code format' }, { status: 400 });
      }
      const codeHash = createHash('sha256').update(normalized).digest('hex');
      const record = await db.recoveryCode.findFirst({
        where: { userId: user.id, codeHash, usedAt: null },
      });
      if (!record) {
        return NextResponse.json({ error: 'Invalid or already used recovery code' }, { status: 400 });
      }
      await db.recoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    }

    // Mark challenge verified
    await db.loginChallenge.update({ where: { id: challengeId }, data: { verified: true } });

    // Trust device if requested
    if (trustDevice) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
                 req.headers.get('x-real-ip') ?? null;
      await db.trustedDevice.upsert({
        where: { userId_deviceId: { userId: user.id, deviceId } },
        create: {
          userId: user.id,
          deviceId,
          label: getDeviceLabel(userAgent ?? ''),
          ipAddress: ip,
        },
        update: { lastSeenAt: new Date(), ipAddress: ip },
      });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('device-challenge/verify error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
