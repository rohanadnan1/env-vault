import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UpdateSecretSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

async function checkSecretOwnership(id: string, userId: string) {
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

  if (!secret || secret.environment.project.userId !== userId) {
    return null;
  }
  return secret;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const secret = await checkSecretOwnership(id, session.user.id);
  if (!secret) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const data = UpdateSecretSchema.parse(body);

    // Transaction to rotate history and update
    const updated = await db.$transaction(async (tx) => {
      // 1. Save current state to history
      await tx.secretHistory.create({
        data: {
          secretId: id,
          valueEncrypted: secret.valueEncrypted,
          iv: secret.iv,
        }
      });

      // 2. Update the secret
      const res = await tx.secret.update({
        where: { id },
        data: {
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
        }
      });

      // 3. Prune history to latest 5 items
      const history = await tx.secretHistory.findMany({
        where: { secretId: id },
        orderBy: { createdAt: 'desc' },
      });

      if (history.length > 5) {
        const toDelete = history.slice(5);
        await tx.secretHistory.deleteMany({
          where: {
            id: { in: toDelete.map(h => h.id) }
          }
        });
      }

      return res;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const secret = await checkSecretOwnership(id, session.user.id);
  if (!secret) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  // Delete secret - cascade handles history
  await db.secret.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
