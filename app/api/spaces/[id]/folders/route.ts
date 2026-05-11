import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildSpaceFolderPath, rejectKingFolderIfThresholdReached } from '@/lib/private-space-folders';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { requireSpaceMembership } from '@/lib/private-space';
import { CreatePrivateSpaceFolderSchema } from '@/lib/validations/schemas';
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
    const data = CreatePrivateSpaceFolderSchema.parse(await req.json());
    const path = buildSpaceFolderPath(data.parentPath, data.name);
    const memberId = data.visibility === 'PERSONAL' ? membership.id : null;

    const existing = await db.spaceFolder.findFirst({
      where: {
        spaceId,
        memberId,
        visibility: data.visibility,
        domain: data.domain,
        path,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'Folder already exists' }, { status: 409 });
    }

    const parent = path === '/'
      ? null
      : await db.spaceFolder.findFirst({
          where: {
            spaceId,
            memberId,
            visibility: data.visibility,
            domain: data.domain,
            path: data.parentPath,
          },
          select: { id: true },
        });

    const folder = await db.spaceFolder.create({
      data: {
        spaceId,
        memberId,
        visibility: data.visibility,
        domain: data.domain,
        name: data.name.trim(),
        path,
        parentId: parent?.id ?? null,
      },
    });

    await revalidatePrivateSpaceForMembers(spaceId);
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error('[PRIVATE_SPACE_FOLDER_CREATE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const folderId = z.string().cuid().parse(body.folderId);

    const folder = await db.spaceFolder.findFirst({
      where: { id: folderId, spaceId, visibility: 'KING' },
      select: { id: true },
    });
    if (!folder) {
      return NextResponse.json({ error: 'King folder not found' }, { status: 404 });
    }

    await db.spaceFolderVote.upsert({
      where: {
        folderId_memberId: {
          folderId,
          memberId: membership.id,
        },
      },
      update: {},
      create: {
        folderId,
        memberId: membership.id,
      },
    });

    const result = await db.$transaction(async (tx) => rejectKingFolderIfThresholdReached(tx, folderId, spaceId));
    await revalidatePrivateSpaceForMembers(spaceId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error('[PRIVATE_SPACE_FOLDER_VOTE_AGAINST]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
