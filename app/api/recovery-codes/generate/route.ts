import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const CODES_COUNT = 30;
const REGEN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { codesGeneratedAt: true },
    });

    if (user?.codesGeneratedAt) {
      const elapsed = Date.now() - user.codesGeneratedAt.getTime();
      if (elapsed < REGEN_INTERVAL_MS) {
        const nextAllowed = new Date(user.codesGeneratedAt.getTime() + REGEN_INTERVAL_MS);
        return NextResponse.json(
          { error: 'Too soon', nextAllowedAt: nextAllowed.toISOString() },
          { status: 429 }
        );
      }
    }

    const body = await req.json();
    const { codes } = body as {
      codes: Array<{
        index: number;
        codeHash: string;
        encryptedMaster: string;
        masterIv: string;
        codeSalt: string;
      }>;
    };

    if (!Array.isArray(codes) || codes.length !== CODES_COUNT) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Invalidate old codes and create new ones atomically
    await db.$transaction([
      db.recoveryCode.deleteMany({ where: { userId } }),
      db.recoveryCode.createMany({
        data: codes.map((c) => ({
          userId,
          index: c.index,
          codeHash: c.codeHash,
          encryptedMaster: c.encryptedMaster,
          masterIv: c.masterIv,
          codeSalt: c.codeSalt,
        })),
      }),
      db.user.update({
        where: { id: userId },
        data: { codesGeneratedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Recovery codes generate error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
