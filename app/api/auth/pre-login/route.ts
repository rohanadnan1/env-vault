import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

function getIp(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, deviceId, userAgent } = Schema.parse(body);
    const ip = getIp(req);

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, password: true, totpSecret: true },
    });

    // Always do bcrypt work to prevent timing-based user enumeration
    const dummyHash = '$2b$12$invalidhashpaddingtomakeitconsistentXXXXXXXXXXXXXXXXXXX';
    const passwordMatch = user?.password
      ? await bcrypt.compare(password, user.password)
      : (await bcrypt.compare(password, dummyHash), false);

    if (!user || !passwordMatch) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Check if user has any second factor set up
    const hasTotp = !!user.totpSecret;
    const recoveryCount = await db.recoveryCode.count({
      where: { userId: user.id, usedAt: null },
    });
    const hasSecurity = hasTotp || recoveryCount > 0;

    // If no second factor, let login proceed normally (nothing to challenge with)
    if (!hasSecurity) {
      return NextResponse.json({ status: 'ok' });
    }

    // Check if this device is already trusted
    const trusted = await db.trustedDevice.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId } },
    });

    if (trusted) {
      // Refresh lastSeenAt
      await db.trustedDevice.update({
        where: { id: trusted.id },
        data: { lastSeenAt: new Date(), ipAddress: ip },
      });
      return NextResponse.json({ status: 'ok' });
    }

    // New device — issue a challenge
    const challenge = await db.loginChallenge.create({
      data: {
        userId: user.id,
        deviceId,
        ipAddress: ip,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    return NextResponse.json({
      status: 'challenge',
      challengeId: challenge.id,
      hasTotp,
      hasRecoveryCodes: recoveryCount > 0,
      deviceLabel: getDeviceLabel(userAgent ?? ''),
      ip,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('pre-login error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
