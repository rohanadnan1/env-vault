import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { AcceptShareInvitationSchema } from '@/lib/validations/schemas';
import { sharingAcceptLimiter } from '@/lib/ratelimit';
import { isShareInvitationExpired } from '@/lib/sharing-access';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  try {
    const { success: rateOk } = await sharingAcceptLimiter.limit(userId);
    if (!rateOk) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    AcceptShareInvitationSchema.parse(body);

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedUserEmail = currentUser.email?.toLowerCase();
    if (!normalizedUserEmail) {
      return NextResponse.json({ error: 'Your account does not have a valid email address' }, { status: 403 });
    }

    const result = await db.$transaction(async (tx) => {
      const invitation = await tx.shareInvitation.findUnique({
        where: { inviteToken: token },
        select: {
          id: true,
          recipientEmail: true,
          recipientId: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          firstAccessedAt: true,
        },
      });

      if (!invitation) {
        return { kind: 'error' as const, status: 404, message: 'Invitation not found' };
      }

      if (normalizedUserEmail !== invitation.recipientEmail.toLowerCase()) {
        return { kind: 'error' as const, status: 403, message: 'Your account email does not match the invitation recipient' };
      }

      if (invitation.status === 'REVOKED') {
        return { kind: 'error' as const, status: 410, message: 'This share has been revoked' };
      }

      if (invitation.status === 'LEFT') {
        return { kind: 'error' as const, status: 410, message: 'This share was left and must be re-shared by the owner' };
      }

      if (isShareInvitationExpired(invitation)) {
        if (invitation.status === 'PENDING' || invitation.status === 'ACCEPTED') {
          await tx.shareInvitation.update({
            where: { id: invitation.id },
            data: { status: 'EXPIRED' },
          });
        }
        return { kind: 'error' as const, status: 410, message: 'This share link has expired' };
      }

      if (invitation.status === 'ACCEPTED') {
        if (invitation.recipientId === userId) {
          return {
            kind: 'success' as const,
            invitationId: invitation.id,
            message: 'Already accepted',
          };
        }

        return { kind: 'error' as const, status: 409, message: 'This invitation has already been accepted by another user' };
      }

      const acceptedAt = new Date();
      const claim = await tx.shareInvitation.updateMany({
        where: {
          id: invitation.id,
          status: 'PENDING',
          OR: [
            { recipientId: null },
            { recipientId: userId },
          ],
        },
        data: {
          recipientId: userId,
          status: 'ACCEPTED',
          acceptedAt,
          firstAccessedAt: acceptedAt,
        },
      });

      if (claim.count === 0) {
        const latest = await tx.shareInvitation.findUnique({
          where: { id: invitation.id },
          select: { recipientId: true, status: true },
        });

        if (latest?.status === 'ACCEPTED' && latest.recipientId === userId) {
          return {
            kind: 'success' as const,
            invitationId: invitation.id,
            message: 'Already accepted',
          };
        }

        if (latest?.status === 'ACCEPTED') {
          return { kind: 'error' as const, status: 409, message: 'This invitation has already been accepted by another user' };
        }

        return { kind: 'error' as const, status: 409, message: 'Could not claim this invitation. Please refresh and try again.' };
      }

      return {
        kind: 'success' as const,
        invitationId: invitation.id,
        message: 'Invitation accepted',
      };
    });

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      invitationId: result.invitationId,
      message: result.message,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_ACCEPT]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
