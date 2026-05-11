import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canRecipientUseAcceptedShare,
  isInvitationRecipientMatch,
  isShareInvitationEnded,
  isShareInvitationExpired,
} from '@/lib/sharing-access';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const { invitationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findUnique({
      where: { id: invitationId }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    const isOwner = invitation.ownerId === session.user.id;
    const isRecipient = isInvitationRecipientMatch(invitation, session);
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (isShareInvitationEnded(invitation.status) || isShareInvitationExpired(invitation)) {
      return NextResponse.json({ error: 'Invitation is not active' }, { status: 410 });
    }

    if (!isOwner && !canRecipientUseAcceptedShare(invitation, session)) {
      return NextResponse.json({ error: 'Accept the invitation before viewing comments' }, { status: 409 });
    }

    const comments = await db.shareComment.findMany({
      where: { invitationId, parentId: null },
      include: {
        author: { select: { id: true, name: true, email: true } },
        replies: {
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(comments.map(c => ({
      id: c.id,
      content: c.content,
      iv: c.iv,
      isEncrypted: c.isEncrypted,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      author: c.author,
      replies: c.replies.map(r => ({
        id: r.id,
        content: r.content,
        iv: r.iv,
        isEncrypted: r.isEncrypted,
        parentId: r.parentId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        author: r.author,
      })),
    })));
  } catch (e) {
    console.error('[SHARING_COMMENTS_GET]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
