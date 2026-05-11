import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { CreateShareEditRequestSchema } from '@/lib/validations/schemas';
import {
  canRecipientUseAcceptedShare,
  isInvitationRecipientMatch,
  isShareInvitationEnded,
  isShareInvitationExpired,
} from '@/lib/sharing-access';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get('invitationId');

    const baseWhere = invitationId ? { invitationId } : {};

    const requests = await db.shareEditRequest.findMany({
      where: {
        ...baseWhere,
        OR: [
          { invitation: { ownerId: session.user.id } },
          { requesterId: session.user.id },
        ],
      },
      include: {
        invitation: {
          select: {
            id: true,
            resourceType: true,
            resourceId: true,
            permission: true,
            recipientEmail: true,
          },
        },
        requester: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(requests.map((request) => ({
      id: request.id,
      invitationId: request.invitationId,
      title: request.title,
      description: request.description,
      status: request.status,
      reviewNote: request.reviewNote,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      proposedEncrypted: request.proposedEncrypted,
      proposedIv: request.proposedIv,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() || null,
      requester: request.requester,
      invitation: request.invitation,
    })));
  } catch (e) {
    console.error('[SHARING_EDIT_REQUEST_LIST]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateShareEditRequestSchema.parse(body);

    const invitation = await db.shareInvitation.findUnique({
      where: { id: data.invitationId }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (!isInvitationRecipientMatch(invitation, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isShareInvitationEnded(invitation.status) || isShareInvitationExpired(invitation)) {
      return NextResponse.json({ error: 'Invitation is not active' }, { status: 410 });
    }
    if (!canRecipientUseAcceptedShare(invitation, session)) {
      return NextResponse.json({ error: 'Accept the invitation before submitting proposals' }, { status: 409 });
    }
    if (invitation.permission !== 'EDIT') {
      return NextResponse.json({ error: 'Edit permission required to submit proposals' }, { status: 403 });
    }

    const editRequest = await db.shareEditRequest.create({
      data: {
        invitationId: data.invitationId,
        requesterId: session.user.id,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        title: data.title,
        description: data.description || null,
        proposedEncrypted: data.proposedEncrypted,
        proposedIv: data.proposedIv,
        previousVersionId: data.previousVersionId || null,
      }
    });

    await db.shareAccessLog.create({
      data: {
        invitationId: data.invitationId,
        userId: session.user.id,
        action: 'EDIT_REQUEST',
        resourceDetail: `${data.resourceType}:${data.resourceId}`,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      id: editRequest.id,
      status: editRequest.status,
      createdAt: editRequest.createdAt.toISOString(),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_EDIT_REQUEST]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
