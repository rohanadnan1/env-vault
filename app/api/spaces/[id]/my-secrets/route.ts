import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertForkWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { CreatePrivateSpaceUserSecretSchema } from '@/lib/validations/schemas';
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
    const data = CreatePrivateSpaceUserSecretSchema.parse(body);
    const requestedFolderPath = normalizeSpacePath(data.folderPath);

    const kingSecret = data.kingSecretId
      ? await db.kingSecret.findFirst({
          where: { id: data.kingSecretId, spaceId },
          select: {
            id: true,
            keyName: true,
            valueEncrypted: true,
            iv: true,
            folderPath: true,
          },
        })
      : null;
    if (data.kingSecretId && !kingSecret) {
      return NextResponse.json({ error: 'Official secret not found' }, { status: 404 });
    }
    const folderPath = normalizeSpacePath(kingSecret?.folderPath ?? requestedFolderPath);

    const created = await db.$transaction(async (tx) => {
      await assertForkWriteAllowed(tx, spaceId);
      if (kingSecret?.id) {
        const existingFork = await tx.userSecret.findFirst({
          where: {
            memberId: membership.id,
            kingSecretId: kingSecret.id,
          },
        });
        if (existingFork) {
          return tx.userSecret.update({
            where: { id: existingFork.id },
            data: {
              workspaceMode: 'FORK',
              keyName: kingSecret.keyName,
              valueEncrypted: kingSecret.valueEncrypted,
              iv: kingSecret.iv,
              folderPath,
            },
          });
        }
      }

      await ensureSpaceFolderPath(tx, {
        spaceId,
        memberId: membership.id,
        visibility: 'PERSONAL',
        domain: 'SECRET',
        folderPath,
      });
      return tx.userSecret.create({
        data: {
          kingSecretId: kingSecret?.id ?? null,
          memberId: membership.id,
          workspaceMode: kingSecret ? 'FORK' : 'DRAFT',
          keyName: kingSecret?.keyName ?? data.keyName!,
          valueEncrypted: kingSecret?.valueEncrypted ?? data.valueEncrypted!,
          iv: kingSecret?.iv ?? data.iv!,
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
        { error: 'A draft secret with this key already exists in this folder.' },
        { status: 409 }
      );
    }

    console.error('[PRIVATE_SPACE_CREATE_MY_SECRET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
