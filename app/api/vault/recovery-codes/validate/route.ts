import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { codes } = await req.json() as { codes: string[] };
    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ error: 'codes array is required' }, { status: 400 });
    }

    const uniqueCodes = [...new Set(codes.map(c => c.trim().toLowerCase()))].filter(Boolean);
    const hashes = uniqueCodes.map(code =>
      crypto.createHash('sha256').update(code).digest('hex')
    );

    const existingCodes = await db.recoveryCode.findMany({
      where: { userId: session.user.id, codeHash: { in: hashes } },
      select: { codeHash: true, usedAt: true },
    });

    const hashToUsed = new Map(existingCodes.map(c => [c.codeHash, !!c.usedAt]));
    const validCodes: string[] = [];
    let used = 0;

    for (let i = 0; i < uniqueCodes.length; i++) {
      const hash = hashes[i];
      const state = hashToUsed.get(hash);
      if (state === undefined) continue; // not a valid code from this user's set
      if (state === true) { used++; continue; } // already used
      validCodes.push(uniqueCodes[i]);
    }

    return NextResponse.json({
      validCodes,
      results: {
        total: uniqueCodes.length,
        valid: validCodes.length,
        used,
        invalid: uniqueCodes.length - validCodes.length - used,
      },
    });
  } catch (e) {
    console.error('[RECOVERY_CODE_VALIDATE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
