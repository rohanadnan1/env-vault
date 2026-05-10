import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { AcceptShareInvitationSchema } from '@/lib/validations/schemas';
import { sharingAcceptLimiter } from '@/lib/ratelimit';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { success: rateOk } = await sharingAcceptLimiter.limit(session.user.id);
    if (!rateOk) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    AcceptShareInvitationSchema.parse(body);

    const invitation = await db.shareInvitation.findUnique({
      where: { inviteToken: token },
      include: { recipient: { select: { email: true } } }
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'This share has been revoked' }, { status: 410 });
    }

    if (invitation.status === 'EXPIRED' || (invitation.expiresAt && new Date(invitation.expiresAt) < new Date())) {
      return NextResponse.json({ error: 'This share link has expired' }, { status: 410 });
    }

    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true }
    });

    if (!currentUser || currentUser.email?.toLowerCase() !== invitation.recipientEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Your account email does not match the invitation recipient' }, { status: 403 });
    }

    if (invitation.status === 'ACCEPTED') {
      if (invitation.recipientId === session.user.id) {
        return NextResponse.json({ success: true, message: 'Already accepted', invitationId: invitation.id });
      }

      if (!invitation.recipientId) {
        await db.shareInvitation.update({
          where: { id: invitation.id },
          data: {
            recipientId: session.user.id,
            acceptedAt: invitation.acceptedAt ?? new Date(),
            firstAccessedAt: invitation.firstAccessedAt ?? new Date(),
          },
        });
        return NextResponse.json({ success: true, message: 'Already accepted', invitationId: invitation.id });
      }

      return NextResponse.json({ error: 'This invitation has already been accepted by another user' }, { status: 409 });
    }

    await db.shareInvitation.update({
      where: { id: invitation.id },
      data: {
        recipientId: session.user.id,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        firstAccessedAt: new Date(),
      }
    });

    return NextResponse.json({
      success: true,
      invitationId: invitation.id,
      message: 'Invitation accepted',
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_ACCEPT]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
