import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createHash } from 'crypto';
import { verifyTotp } from '@/lib/totp';
import { z } from 'zod';

const COOLDOWN_DAYS = 10;

const Schema = z.object({
  code: z.string().min(1),
  codeType: z.enum(['totp', 'recovery']),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { code, codeType } = Schema.parse(body);
    const userId = session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, masterPasswordChangedAt: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Enforce 10-day cooldown
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (user.masterPasswordChangedAt && Date.now() - user.masterPasswordChangedAt.getTime() < cooldownMs) {
      const nextAt = new Date(user.masterPasswordChangedAt.getTime() + cooldownMs).toISOString();
      return NextResponse.json({ error: `Master password cannot be changed again until ${nextAt}` }, { status: 429 });
    }

    if (codeType === 'totp') {
      if (!user.totpSecret) return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
      if (!verifyTotp(code, user.totpSecret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 400 });
      }
    } else {
      const normalized = code.toLowerCase().replace(/-/g, '').trim();
      if (normalized.length !== 16 || !/^[0-9a-f]+$/.test(normalized)) {
        return NextResponse.json({ error: 'Invalid recovery code format' }, { status: 400 });
      }
      const codeHash = createHash('sha256').update(normalized).digest('hex');
      const record = await db.recoveryCode.findFirst({ where: { userId, codeHash, usedAt: null } });
      if (!record) return NextResponse.json({ error: 'Invalid or already used recovery code' }, { status: 400 });
      await db.recoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    }

    const challenge = await db.loginChallenge.create({
      data: { userId, deviceId: 'rekey', expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });

    return NextResponse.json({ verifyId: challenge.id });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    console.error('master-password/prepare error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
