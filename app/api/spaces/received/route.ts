import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionEmail = session.user.email?.toLowerCase();
  if (!sessionEmail) {
    return NextResponse.json([]);
  }

  try {
    const invitations = await db.spaceInvitation.findMany({
      where: {
        OR: [
          { recipientId: session.user.id },
          { recipientEmail: { equals: sessionEmail, mode: 'insensitive' } },
        ],
      },
      include: {
        space: {
          select: { id: true, name: true, createdAt: true },
        },
        inviter: {
          include: {
            user: {
              select: { id: true, username: true, email: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      invitations.map((invitation) => ({
        id: invitation.id,
        inviteToken: invitation.inviteToken,
        status: invitation.status,
        recipientEmail: invitation.recipientEmail,
        encryptedSpaceKeyAlgorithm: invitation.encryptedSpaceKeyAlgorithm,
        hasEncryptedSpaceKey: !!invitation.encryptedSpaceKey,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        revokedAt: invitation.revokedAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
        updatedAt: invitation.updatedAt.toISOString(),
        space: {
          id: invitation.space.id,
          name: invitation.space.name,
          createdAt: invitation.space.createdAt.toISOString(),
        },
        inviter: invitation.inviter.user,
      }))
    );
  } catch (error) {
    console.error('[PRIVATE_SPACES_RECEIVED]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
