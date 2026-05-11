import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { RefreshPrivateSpaceInvitationKeySchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { token } = await params;
  const invitation = await db.spaceInvitation.findUnique({
    where: { inviteToken: token },
    include: {
      space: {
        select: { id: true, name: true, createdAt: true },
      },
      inviter: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const isRecipient = session.user.email?.toLowerCase() === invitation.recipientEmail.toLowerCase();
  if (!isRecipient) {
    const isMember = await db.spaceMember.findFirst({
      where: { spaceId: invitation.spaceId, userId: session.user.id },
      select: { id: true },
    });
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json({
    id: invitation.id,
    inviteToken: invitation.inviteToken,
    status: invitation.status,
    recipientEmail: invitation.recipientEmail,
    hasEncryptedSpaceKey: !!invitation.encryptedSpaceKey,
    encryptedSpaceKeyAlgorithm: invitation.encryptedSpaceKeyAlgorithm,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    space: {
      id: invitation.space.id,
      name: invitation.space.name,
      createdAt: invitation.space.createdAt.toISOString(),
    },
    inviter: invitation.inviter.user,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { token } = await params;
    const body = await req.json();
    const data = RefreshPrivateSpaceInvitationKeySchema.parse(body);

    const invitation = await db.spaceInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        recipient: {
          select: {
            id: true,
            vaultPublicKey: true,
            vaultPublicKeyAlgorithm: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending invitations can be updated' }, { status: 409 });
    }

    const membership = await db.spaceMember.findFirst({
      where: {
        spaceId: invitation.spaceId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (invitation.recipient && !invitation.recipient.vaultPublicKey) {
      return NextResponse.json({ error: 'Recipient does not have a vault key yet' }, { status: 409 });
    }

    const updated = await db.spaceInvitation.update({
      where: { id: invitation.id },
      data: {
        encryptedSpaceKey: data.encryptedSpaceKey,
        encryptedSpaceKeyAlgorithm:
          data.encryptedSpaceKeyAlgorithm ??
          invitation.recipient?.vaultPublicKeyAlgorithm ??
          invitation.encryptedSpaceKeyAlgorithm ??
          'RSA-OAEP-256',
      },
    });

    await revalidatePrivateSpaceForMembers(invitation.spaceId);

    return NextResponse.json({
      id: updated.id,
      hasEncryptedSpaceKey: !!updated.encryptedSpaceKey,
      encryptedSpaceKeyAlgorithm: updated.encryptedSpaceKeyAlgorithm,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_INVITE_REFRESH_KEY]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
