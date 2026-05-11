import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { ShareDownloadNotifySchema } from '@/lib/validations/schemas';
import {
  canRecipientUseAcceptedShare,
  isShareInvitationEnded,
  isShareInvitationExpired,
} from '@/lib/sharing-access';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = ShareDownloadNotifySchema.parse(body);

    const invitation = await db.shareInvitation.findUnique({
      where: { id: data.invitationId }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    if (isShareInvitationEnded(invitation.status) || isShareInvitationExpired(invitation)) {
      return NextResponse.json({ error: 'Invitation is not active' }, { status: 410 });
    }

    if (!canRecipientUseAcceptedShare(invitation, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.shareDownloadLog.create({
      data: {
        invitationId: data.invitationId,
        userId: session.user.id,
        fileName: data.fileName,
        fileType: data.fileType,
      }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_DOWNLOAD_NOTIFY]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
