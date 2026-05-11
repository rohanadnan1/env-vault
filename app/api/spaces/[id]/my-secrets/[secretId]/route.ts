import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertForkWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { UpdatePrivateSpaceUserSecretSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; secretId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, secretId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const secret = await db.userSecret.findFirst({
    where: {
      id: secretId,
      memberId: membership.id,
      member: { spaceId },
    },
  });

  if (!secret) {
    return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = UpdatePrivateSpaceUserSecretSchema.parse(body);
    const nextFolderPath = data.folderPath ? normalizeSpacePath(data.folderPath) : undefined;

    const updated = await db.$transaction(async (tx) => {
      await assertForkWriteAllowed(tx, spaceId);
      if (nextFolderPath) {
        await ensureSpaceFolderPath(tx, {
          spaceId,
          memberId: membership.id,
          visibility: 'PERSONAL',
          domain: 'SECRET',
          folderPath: nextFolderPath,
        });
      }
      return tx.userSecret.update({
        where: { id: secret.id },
        data: {
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
          ...(nextFolderPath ? { folderPath: nextFolderPath } : {}),
        },
      });
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_UPDATE_MY_SECRET]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
