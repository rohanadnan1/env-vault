import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findFirst({
      where: { id, ownerId: session.user.id }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    await db.shareInvitation.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      }
    });

    return NextResponse.json({ success: true, message: 'Access revoked' });
  } catch (e) {
    console.error('[SHARING_REVOKE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
