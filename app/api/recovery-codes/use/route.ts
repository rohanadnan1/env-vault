import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createHash } from 'crypto';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const normalized = code.toLowerCase().replace(/-/g, '').trim();
    if (normalized.length !== 16 || !/^[0-9a-f]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
    }

    const codeHash = createHash('sha256').update(normalized).digest('hex');

    const record = await db.recoveryCode.findFirst({
      where: {
        userId: session.user.id,
        codeHash,
        usedAt: null,
      },
    });

    if (!record) {
      return NextResponse.json({ error: 'Invalid or already used code' }, { status: 400 });
    }

    await db.recoveryCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({
      encryptedMaster: record.encryptedMaster,
      masterIv: record.masterIv,
      codeSalt: record.codeSalt,
    });
  } catch (error) {
    console.error('Recovery code use error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
