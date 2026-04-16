import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

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
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  return NextResponse.json(history);
}
