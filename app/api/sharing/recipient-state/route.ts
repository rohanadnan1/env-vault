import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  try {
    const existing = await db.shareInvitation.findFirst({
      where: {
        ownerId: session.user.id,
        recipientEmail: email,
        status: { not: 'REVOKED' },
      },
      select: {
        shareEncryptionSalt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      hasSharedBefore: !!existing,
      existingSalt: existing?.shareEncryptionSalt || null,
    });
  } catch (e) {
    console.error('[SHARING_RECIPIENT_STATE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
