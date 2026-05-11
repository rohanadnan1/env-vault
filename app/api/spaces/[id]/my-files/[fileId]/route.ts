import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { publishSpaceEvent } from '@/lib/redis';
import { assertForkWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { UpdatePrivateSpaceUserFileSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

async function getOwnedUserFile(spaceId: string, memberId: string, fileId: string) {
  const file = await db.userFile.findFirst({
    where: {
      id: fileId,
      memberId,
      member: { spaceId },
    },
    include: {
      member: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  return file;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, fileId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const file = await getOwnedUserFile(spaceId, membership.id, fileId);
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = UpdatePrivateSpaceUserFileSchema.parse(body);
    const nextFolderPath = data.folderPath ? normalizeSpacePath(data.folderPath) : undefined;

    const updated = await db.$transaction(async (tx) => {
      await assertForkWriteAllowed(tx, spaceId);
      if (nextFolderPath) {
        await ensureSpaceFolderPath(tx, {
          spaceId,
          memberId: membership.id,
          visibility: 'PERSONAL',
          domain: 'FILE',
          folderPath: nextFolderPath,
        });
      }
      return tx.userFile.update({
        where: { id: file.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.contentEncrypted ? { contentEncrypted: data.contentEncrypted } : {}),
          ...(data.iv ? { iv: data.iv } : {}),
          ...(nextFolderPath ? { folderPath: nextFolderPath } : {}),
        },
      });
    });

    if (nextFolderPath && nextFolderPath !== file.folderPath) {
      publishSpaceEvent(spaceId, 'file-moved', {
        spaceId,
        actorMemberId: membership.id,
        actorUserId: session.user.id,
        actorName: file.member.user.name || file.member.user.id,
        userFileId: updated.id,
        kingFileId: updated.kingFileId,
        fileName: updated.name,
        oldFolderPath: file.folderPath,
        newFolderPath: nextFolderPath,
        timestamp: new Date().toISOString(),
      });
    }

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_UPDATE_MY_FILE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: spaceId, fileId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Private space not found' }, { status: 404 });

  const file = await getOwnedUserFile(spaceId, membership.id, fileId);
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  try {
    await db.userFile.delete({ where: { id: file.id } });
    await revalidatePrivateSpaceForMembers(spaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PRIVATE_SPACE_DELETE_MY_FILE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
