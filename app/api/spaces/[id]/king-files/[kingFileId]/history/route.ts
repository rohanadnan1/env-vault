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

  const kingFile = await db.kingFile.findFirst({
    where: {
      id: kingFileId,
      spaceId,
    },
    select: { id: true },
  });

  if (!kingFile) {
    return NextResponse.json({ error: 'Official file not found' }, { status: 404 });
  }

  const history = await db.kingFileHistory.findMany({
    where: { kingFileId },
    orderBy: { revisionNumber: 'desc' },
    take: 20,
    select: {
      id: true,
      name: true,
      contentEncrypted: true,
      iv: true,
      folderPath: true,
      revisionNumber: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    history: history.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}
