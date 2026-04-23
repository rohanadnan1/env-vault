import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const COOLDOWN_DAYS = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { totpSecret: true, masterPasswordChangedAt: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const hasTotp = !!user.totpSecret;
    const recoveryCount = await db.recoveryCode.count({
      where: { userId: session.user.id, usedAt: null },
    });
    const hasSecurity = hasTotp || recoveryCount > 0;

    const changedAt = user.masterPasswordChangedAt;
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const onCooldown = changedAt ? Date.now() - changedAt.getTime() < cooldownMs : false;
    const nextChangeAt = onCooldown && changedAt
      ? new Date(changedAt.getTime() + cooldownMs).toISOString()
      : null;

    return NextResponse.json({ hasSecurity, hasTotp, hasRecoveryCodes: recoveryCount > 0, onCooldown, nextChangeAt });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
