import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const code = await db.vaultStoredRecoveryCode.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, codeEncrypted: true, iv: true, codeOrder: true, isUsed: true },
  });

  if (!code) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: code.id,
    codeOrder: code.codeOrder,
    codeEncrypted: code.codeEncrypted,
    iv: code.iv,
    isUsed: code.isUsed,
  });
}
