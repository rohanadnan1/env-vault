import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { CreateShareCommentSchema } from '@/lib/validations/schemas';
import { isInvitationRecipientMatch } from '@/lib/sharing-access';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateShareCommentSchema.parse(body);

    const invitation = await db.shareInvitation.findUnique({
      where: { id: data.invitationId }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    const isOwner = invitation.ownerId === session.user.id;
    const isRecipient = isInvitationRecipientMatch(invitation, session);
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (invitation.permission === 'READ_ONLY' && !isOwner) {
      return NextResponse.json({ error: 'Read-only access cannot leave comments' }, { status: 403 });
    }
    if (invitation.status === 'REVOKED' || invitation.status === 'EXPIRED') {
      return NextResponse.json({ error: 'Invitation is not active' }, { status: 410 });
    }

    const comment = await db.shareComment.create({
      data: {
        invitationId: data.invitationId,
        authorId: session.user.id,
        content: data.content,
        iv: data.iv || null,
        isEncrypted: data.isEncrypted ?? true,
        parentId: data.parentId || null,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      }
    });

    return NextResponse.json({
      id: comment.id,
      content: comment.content,
      iv: comment.iv,
      isEncrypted: comment.isEncrypted,
      parentId: comment.parentId,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_COMMENT]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
