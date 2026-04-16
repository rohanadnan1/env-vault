import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { headers } from 'next/headers';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = headerList.get('user-agent');

  try {
    const share = await db.share.findUnique({
      where: { accessToken: token },
      include: {
        sharedBy: {
          select: { name: true }
        }
      }
    });

    if (!share) {
      return NextResponse.json({ error: 'Link not found or invalid' }, { status: 404 });
    }

    // 1. Check revocation
    if (share.isRevoked) {
      return NextResponse.json({ error: 'This share link has been revoked' }, { status: 410 });
    }

    // 2. Check expiry
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired' }, { status: 410 });
    }

    // Return the bundle and salt (recipient needs salt to derive the share key)
    const response = {
      sharedBy: share.sharedBy.name || 'A user',
      scopeType: share.scopeType,
      scopeId: share.scopeId,
      bundleEncrypted: share.bundleEncrypted,
      bundleIv: share.bundleIv,
      shareSalt: share.shareSalt,
      createdAt: share.createdAt,
      note: share.note,
    };

    // 3. Log access and Handle single-use revocation
    await db.$transaction(async (tx) => {
      await tx.shareAccess.create({
        data: {
          shareId: share.id,
          ipAddress: ip,
          userAgent: userAgent || 'Unknown',
        }
      });

      if (share.singleUse) {
        await tx.share.update({
          where: { id: share.id },
          data: { isRevoked: true }
        });
      }
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
