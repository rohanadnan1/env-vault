import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  // Verify ownership of the secret (history is tied to secret)
  const secret = await db.secret.findUnique({
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

  if (!secret || secret.environment.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });
  }

  const history = await db.secretHistory.findMany({
    where: { secretId: id },
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      valueEncrypted: true,
      iv: true,
      revisionNumber: true,
      previousHistoryId: true,
      createdAt: true,
    }
  });

  const graph = {
    nodes: history.map((h) => ({ id: h.id, revisionNumber: h.revisionNumber, createdAt: h.createdAt })),
    edges: history
      .filter((h) => Boolean(h.previousHistoryId))
      .map((h) => ({ from: h.previousHistoryId as string, to: h.id })),
  };

  return NextResponse.json({ history, graph });
}

const DeleteSchema = z.object({
  historyIds: z.array(z.string()).min(1),
});

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const secret = await db.secret.findUnique({
    where: { id },
    include: { environment: { include: { project: { select: { userId: true } } } } },
  });
  if (!secret || secret.environment.project.userId !== session.user.id)
    return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  const body = await req.json();
  const { historyIds } = DeleteSchema.parse(body);

  await db.secretHistory.deleteMany({
    where: { id: { in: historyIds }, secretId: id },
  });

  return NextResponse.json({ deleted: historyIds.length });
}
