import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharingTokenLimiter } from '@/lib/ratelimit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { success: rateOk } = await sharingTokenLimiter.limit(ip);
  if (!rateOk) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const invitation = await db.shareInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        owner: { select: { id: true, username: true, name: true, email: true } },
        recipient: { select: { id: true, username: true, name: true, email: true } },
      }
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found', status: 'NOT_FOUND' }, { status: 404 });
    }

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'This share has been revoked by the owner', status: 'REVOKED' }, { status: 410 });
    }

    if (invitation.status === 'LEFT') {
      return NextResponse.json({ error: 'This share was left and must be shared again by the owner', status: 'LEFT' }, { status: 410 });
    }

    if (invitation.status === 'EXPIRED' || (invitation.expiresAt && new Date(invitation.expiresAt) < new Date())) {
      if (invitation.status !== 'EXPIRED') {
        await db.shareInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' }
        });
      }
      return NextResponse.json({ error: 'This share link has expired', status: 'EXPIRED' }, { status: 410 });
    }

    if (!invitation.shareEncryptionSalt || !invitation.encryptedShareKey) {
      return NextResponse.json({ error: 'Invalid invitation: missing encryption data' }, { status: 500 });
    }

    const recipientAccount = await db.user.findUnique({
      where: { email: invitation.recipientEmail },
      select: { id: true },
    });

    return NextResponse.json({
      id: invitation.id,
      token: invitation.inviteToken,
      resourceType: invitation.resourceType,
      resourceId: invitation.resourceId,
      permission: invitation.permission,
      versionMode: invitation.versionMode,
      recipientEmail: invitation.recipientEmail,
      accountExists: !!recipientAccount,
      recipientId: invitation.recipientId,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString() || null,
      acceptedAt: invitation.acceptedAt?.toISOString() || null,
      note: invitation.note,
      createdAt: invitation.createdAt.toISOString(),
      owner: {
        id: invitation.owner.id,
        username: invitation.owner.username,
        name: invitation.owner.name,
      },
      shareEncryptionSalt: invitation.shareEncryptionSalt,
      encryptedShareKey: invitation.encryptedShareKey,
      shareKeyIv: invitation.shareKeyIv,
      bundleEncrypted: invitation.bundleEncrypted,
      bundleIv: invitation.bundleIv,
    });
  } catch (e) {
    console.error('[SHARING_INVITE_GET]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
