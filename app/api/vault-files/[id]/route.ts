import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const UpdateVaultFileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  contentEncrypted: z.string().min(1).optional(),
  iv: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  pinnedAt: z.string().datetime().nullable().optional(),
});

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

  return NextResponse.json(file);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const data = UpdateVaultFileSchema.parse(body);

    // ── Pin-only update ────────────────────────────────────────────────────
    // Use raw SQL so Prisma's @updatedAt is NOT triggered.
    // A pin action is metadata, not a content edit — it must not affect
    // the recency badges or create a history revision.
    const keys = Object.keys(data);
    if (keys.length === 1 && keys[0] === 'pinnedAt') {
      if (data.pinnedAt === null || data.pinnedAt === undefined) {
        await db.$executeRaw`UPDATE "VaultFile" SET "pinnedAt" = NULL WHERE "id" = ${id}`;
      } else {
        const pinnedAt = new Date(data.pinnedAt);
        await db.$executeRaw`UPDATE "VaultFile" SET "pinnedAt" = ${pinnedAt} WHERE "id" = ${id}`;
      }
      const updated = await db.vaultFile.findUnique({ where: { id } });
      return NextResponse.json(updated);
    }

    // ── Content / name edit ────────────────────────────────────────────────
    const updated = await db.$transaction(async (tx) => {
      const latestHistory = await tx.fileHistory.findFirst({
        where: { fileId: id },
        orderBy: { revisionNumber: 'desc' },
      });

      const res = await tx.vaultFile.update({
        where: { id },
        data,
      });

      await tx.fileHistory.create({
        data: {
          fileId: id,
          name: res.name,
          contentEncrypted: res.contentEncrypted,
          iv: res.iv,
          revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
          previousHistoryId: latestHistory?.id ?? null,
        },
      });

      const allRevisions = await tx.fileHistory.findMany({
        where: { fileId: id },
        orderBy: { revisionNumber: 'desc' },
        select: { id: true },
      });

      if (allRevisions.length > 10) {
        await tx.fileHistory.deleteMany({
          where: {
            id: { in: allRevisions.slice(10).map((rev) => rev.id) },
          },
        });
      }

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

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  await db.vaultFile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
