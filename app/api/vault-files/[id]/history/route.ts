import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

async function checkFileOwnership(id: string, userId: string) {
  const file = await db.vaultFile.findUnique({
    where: { id },
    include: {
      environment: {
        include: {
          project: {
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!file || file.environment.project.userId !== userId) {
    return null;
  }
  return file;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const history = await db.fileHistory.findMany({
      where: { fileId: id },
      orderBy: { revisionNumber: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        contentEncrypted: true,
        iv: true,
        revisionNumber: true,
        previousHistoryId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ history });
  } catch (err) {
    console.error('[FileHistory] Failed to read history:', err);
    return NextResponse.json({ history: [], warning: 'File history unavailable' });
  }
}
