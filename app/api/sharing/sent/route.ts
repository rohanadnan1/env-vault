import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitations = await db.shareInvitation.findMany({
      where: { ownerId: session.user.id },
      include: {
        recipient: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, emoji: true, color: true } },
        _count: { select: { accessLogs: true, comments: true, editRequests: true, downloadLogs: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(invitations.map(inv => ({
      ...inv,
      expiresAt: inv.expiresAt?.toISOString() || null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
      acceptedAt: inv.acceptedAt?.toISOString() || null,
      revokedAt: inv.revokedAt?.toISOString() || null,
      firstAccessedAt: inv.firstAccessedAt?.toISOString() || null,
      shareEncryptionSalt: undefined,
      encryptedShareKey: undefined,
      shareKeyIv: undefined,
      bundleEncrypted: undefined,
      bundleIv: undefined,
    })));
  } catch (e) {
    console.error('[SHARING_SENT]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
