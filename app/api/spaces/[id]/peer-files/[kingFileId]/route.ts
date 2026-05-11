import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; kingFileId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, kingFileId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const peerFiles = await db.userFile.findMany({
    where: {
      kingFileId,
      member: {
        spaceId,
        id: { not: membership.id },
      },
    },
    include: {
      member: {
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  return NextResponse.json(
    peerFiles.map((file) => ({
      id: file.id,
      kingFileId: file.kingFileId,
      name: file.name,
      contentEncrypted: file.contentEncrypted,
      iv: file.iv,
      folderPath: file.folderPath,
      updatedAt: file.updatedAt.toISOString(),
      member: {
        id: file.member.id,
        user: file.member.user,
      },
    }))
  );
}
