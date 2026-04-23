import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const REGEN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [user, codes] = await Promise.all([
      db.user.findUnique({
        where: { id: session.user.id },
        select: { codesGeneratedAt: true },
      }),
      db.recoveryCode.findMany({
        where: { userId: session.user.id },
        select: { usedAt: true },
        orderBy: { index: 'asc' },
      }),
    ]);

    const total = codes.length;
    const used = codes.filter((c) => c.usedAt !== null).length;
    const remaining = total - used;
    const generatedAt = user?.codesGeneratedAt ?? null;
    const nextAllowedAt = generatedAt
      ? new Date(generatedAt.getTime() + REGEN_INTERVAL_MS).toISOString()
      : null;
    const canRegenerate = !generatedAt || Date.now() - generatedAt.getTime() >= REGEN_INTERVAL_MS;

    return NextResponse.json({
      hasCodesGenerated: total > 0,
      generatedAt: generatedAt?.toISOString() ?? null,
      nextAllowedAt,
      canRegenerate,
      total,
      used,
      remaining,
    });
  } catch (error) {
    console.error('Recovery codes status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
