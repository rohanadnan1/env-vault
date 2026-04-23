import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, commentId } = await params;

  // Verify file ownership
  const file = await db.vaultFile.findUnique({
    where: { id },
    include: { environment: { include: { project: { select: { userId: true } } } } },
  });
  if (!file || file.environment.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });
  }

  // Verify comment belongs to this file
  const comment = await db.fileComment.findFirst({ where: { id: commentId, fileId: id } });
  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

  await db.fileComment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
