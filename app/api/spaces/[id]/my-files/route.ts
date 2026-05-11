import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertForkWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { CreatePrivateSpaceUserFileSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = CreatePrivateSpaceUserFileSchema.parse(body);
    const kingFile = data.kingFileId
      ? await db.kingFile.findFirst({
          where: { id: data.kingFileId, spaceId },
          select: {
            id: true,
            name: true,
            contentEncrypted: true,
            iv: true,
            folderPath: true,
          },
        })
      : null;
    const folderPath = normalizeSpacePath(kingFile?.folderPath ?? data.folderPath);

    if (data.kingFileId && !kingFile) {
        return NextResponse.json({ error: 'Official file not found' }, { status: 404 });
    }

    const created = await db.$transaction(async (tx) => {
      await assertForkWriteAllowed(tx, spaceId);
      if (kingFile?.id) {
        const existingFork = await tx.userFile.findFirst({
          where: {
            memberId: membership.id,
            kingFileId: kingFile.id,
          },
        });
        if (existingFork) {
          return tx.userFile.update({
            where: { id: existingFork.id },
            data: {
              workspaceMode: 'FORK',
              name: kingFile.name,
              contentEncrypted: kingFile.contentEncrypted,
              iv: kingFile.iv,
              folderPath: kingFile.folderPath,
            },
          });
        }
      }

      await ensureSpaceFolderPath(tx, {
        spaceId,
        memberId: membership.id,
        visibility: 'PERSONAL',
        domain: 'FILE',
        folderPath,
      });
      return tx.userFile.create({
        data: {
          kingFileId: kingFile?.id ?? null,
          memberId: membership.id,
          workspaceMode: kingFile ? 'FORK' : 'DRAFT',
          name: kingFile?.name ?? data.name!,
          contentEncrypted: kingFile?.contentEncrypted ?? data.contentEncrypted!,
          iv: kingFile?.iv ?? data.iv!,
          folderPath,
        },
      });
    });

    await revalidatePrivateSpaceForMembers(spaceId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A draft file with this name already exists in this folder.' },
        { status: 409 }
      );
    }

    console.error('[PRIVATE_SPACE_CREATE_MY_FILE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
