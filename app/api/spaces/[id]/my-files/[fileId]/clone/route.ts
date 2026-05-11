import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: spaceId, fileId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  const sourceFile = await db.userFile.findFirst({
    where: { id: fileId, memberId: membership.id },
  });
  if (!sourceFile) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  let newName = `${sourceFile.name}-copy`;
  let suffix = 1;
  while (true) {
    const existing = await db.userFile.findFirst({
      where: {
        memberId: membership.id,
        folderPath: sourceFile.folderPath,
        name: newName,
      },
    });
    if (!existing) break;
    suffix++;
    newName = `${sourceFile.name}-copy-${suffix}`;
  }

  const cloned = await db.userFile.create({
    data: {
      memberId: membership.id,
      kingFileId: null,
      workspaceMode: 'DRAFT',
      name: newName,
      folderPath: sourceFile.folderPath,
      contentEncrypted: sourceFile.contentEncrypted,
      iv: sourceFile.iv,
    },
  });

  return NextResponse.json(cloned, { status: 201 });
}
