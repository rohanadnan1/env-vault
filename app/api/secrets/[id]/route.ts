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

    // Transaction to append a linked revision after each edit.
    const updated = await db.$transaction(async (tx) => {
      const latestHistory = await tx.secretHistory.findFirst({
        where: { secretId: id },
        orderBy: { revisionNumber: 'desc' },
      });

      // 1. Update the secret to the new encrypted value.
      const res = await tx.secret.update({
        where: { id },
        data: {
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
        }
      });

      // 2. Add a new revision node linked to the previous revision.
      await tx.secretHistory.create({
        data: {
          secretId: id,
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
          revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
          previousHistoryId: latestHistory?.id ?? null,
        }
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
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
