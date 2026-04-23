import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createHash } from 'crypto';
import { verify as totpVerify } from 'otplib';
import { z } from 'zod';

const Schema = z.object({
  code: z.string().min(1),
  codeType: z.enum(['totp', 'recovery']),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, codeType } = Schema.parse(body);
    const userId = session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (codeType === 'totp') {
      if (!user.totpSecret) {
        return NextResponse.json({ error: '2FA is not enabled on this account' }, { status: 400 });
      }
      const valid = totpVerify({ token: code.replace(/\s/g, ''), secret: user.totpSecret });
      if (!valid) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
      }
    } else {
      const normalized = code.toLowerCase().replace(/-/g, '').trim();
      if (normalized.length !== 16 || !/^[0-9a-f]+$/.test(normalized)) {
        return NextResponse.json({ error: 'Invalid recovery code format' }, { status: 400 });
      }
      const codeHash = createHash('sha256').update(normalized).digest('hex');
      const record = await db.recoveryCode.findFirst({
        where: { userId, codeHash, usedAt: null },
      });
      if (!record) {
        return NextResponse.json({ error: 'Invalid or already used recovery code' }, { status: 400 });
      }
      await db.recoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    }

    // Increment sessionVersion — this invalidates all existing JWTs
    await db.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });

    // Clear all trusted devices so next login from any device gets challenged
    await db.trustedDevice.deleteMany({ where: { userId } });

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('sign-out-all error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
