import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { isInvitationRecipientMatch } from '@/lib/sharing-access';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findUnique({
      where: { id },
    });
    if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isRecipient = isInvitationRecipientMatch(invitation, session);
    if (!isRecipient) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'Already removed' }, { status: 400 });
    }

    await db.shareInvitation.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[SHARING_LEAVE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
