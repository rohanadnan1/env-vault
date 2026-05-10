import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitations = await db.shareInvitation.findMany({
      where: { ownerId: session.user.id, status: { not: 'REVOKED' } },
      select: { recipientEmail: true },
      distinct: ['recipientEmail'],
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      emails: invitations.map(inv => inv.recipientEmail),
    });
  } catch (e) {
    console.error('[SHARING_PREVIOUS_RECIPIENTS]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
