import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { PRIVATE_SPACE_COUNCIL_THRESHOLD, triggerElection } from '@/lib/private-space-governance';
import { sharingAcceptLimiter } from '@/lib/ratelimit';
import { z } from 'zod';

const AcceptPrivateSpaceInvitationSchema = z.object({
  encryptedSpaceKey: z.string().min(1).optional(),
  encryptedSpaceKeyAlgorithm: z.string().min(1).max(100).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { token } = await params;

  try {
    const { success: rateOk } = await sharingAcceptLimiter.limit(`private-space:${userId}`);
    if (!rateOk) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const data = AcceptPrivateSpaceInvitationSchema.parse(body);
    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        vaultPublicKey: true,
        vaultPublicKeyAlgorithm: true,
      },
    });

    if (!currentUser?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const invitation = await db.spaceInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        space: {
          include: {
            kingFiles: true,
            kingSecrets: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'This invite has been revoked' }, { status: 410 });
    }

    if (invitation.status === 'EXPIRED' || (invitation.expiresAt && invitation.expiresAt < new Date())) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
    }

    if (currentUser.email.toLowerCase() !== invitation.recipientEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Your account email does not match the invitation recipient' }, { status: 403 });
    }

    const existingMember = await db.spaceMember.findFirst({
      where: { spaceId: invitation.spaceId, userId },
      select: { id: true },
    });
    if (existingMember) {
      await db.spaceInvitation.update({
        where: { id: invitation.id },
        data: {
          recipientId: userId,
          acceptedAt: invitation.acceptedAt ?? new Date(),
          status: 'ACCEPTED',
        },
      });
      return NextResponse.json({
        success: true,
        spaceId: invitation.spaceId,
        message: 'Already a member',
        memberCount: invitation.space._count.members,
        kingFileCount: invitation.space.kingFiles.length,
        kingSecretCount: invitation.space.kingSecrets.length,
      });
    }

    const effectiveEncryptedSpaceKey = invitation.encryptedSpaceKey ?? data.encryptedSpaceKey ?? null;
    const effectiveEncryptedSpaceKeyAlgorithm =
      invitation.encryptedSpaceKeyAlgorithm ??
      data.encryptedSpaceKeyAlgorithm ??
      currentUser.vaultPublicKeyAlgorithm ??
      'RSA-OAEP-256';

    if (!effectiveEncryptedSpaceKey) {
      return NextResponse.json(
        { error: 'This invitation needs a freshly encrypted space key before it can be accepted.' },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const membership = await tx.spaceMember.create({
        data: {
          spaceId: invitation.spaceId,
          userId,
          encryptedSpaceKey: effectiveEncryptedSpaceKey,
        },
      });

      await tx.spaceInvitation.update({
        where: { id: invitation.id },
        data: {
          recipientId: userId,
          encryptedSpaceKey: effectiveEncryptedSpaceKey,
          encryptedSpaceKeyAlgorithm: effectiveEncryptedSpaceKeyAlgorithm,
          acceptedAt: invitation.acceptedAt ?? new Date(),
          status: 'ACCEPTED',
        },
      });

      const totalMembers = await tx.spaceMember.count({
        where: { spaceId: invitation.spaceId },
      });
      if (totalMembers === PRIVATE_SPACE_COUNCIL_THRESHOLD) {
        await triggerElection(tx, invitation.spaceId);
      }

      return membership;
    });

    await revalidatePrivateSpaceForMembers(invitation.spaceId);

    return NextResponse.json({
      success: true,
      spaceId: invitation.spaceId,
      memberId: result.id,
      memberCount: invitation.space._count.members + 1,
      kingFileCount: invitation.space.kingFiles.length,
      kingSecretCount: invitation.space.kingSecrets.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_ACCEPT]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
