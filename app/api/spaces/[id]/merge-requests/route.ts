import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import {
  getCachedPrivateSpaceMergeRequests,
  getPrivateSpaceMergeRequestsUncached,
  revalidatePrivateSpaceForMembers,
} from '@/lib/private-space-cache';
import { mergePrivateSpaceRequest, normalizeSpacePath, requireSpaceMembership } from '@/lib/private-space';
import { assertPrivateSpaceWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { CreatePrivateSpaceMergeRequestSchema } from '@/lib/validations/schemas';
import { z } from 'zod';
import { publishSpaceEvent } from '@/lib/redis';

const PRIVATE_SPACE_MERGE_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function serializeDuplicateRequest(duplicate: {
  id: string;
  resourceType: 'FILE' | 'SECRET';
  proposedData: string;
  iv: string;
  proposedName: string | null;
  proposedFolderPath: string | null;
  status: 'PENDING' | 'MERGED' | 'REJECTED' | 'APPROVED';
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: duplicate.id,
    resourceType: duplicate.resourceType,
    proposedData: duplicate.proposedData,
    iv: duplicate.iv,
    proposedName: duplicate.proposedName,
    proposedFolderPath: duplicate.proposedFolderPath,
    status: duplicate.status,
    createdAt: duplicate.createdAt.toISOString(),
    updatedAt: duplicate.updatedAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const fresh = searchParams.get('fresh') === '1';
  const requests = fresh
    ? await getPrivateSpaceMergeRequestsUncached(spaceId, session.user.id)
    : await getCachedPrivateSpaceMergeRequests(spaceId, session.user.id);
  return NextResponse.json(requests ?? []);
}

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
    const data = CreatePrivateSpaceMergeRequestSchema.parse(body);

    if (data.resourceType === 'FILE') {
      const proposedName = data.proposedName?.trim();
      const proposedFolderPath = data.proposedFolderPath
        ? normalizeSpacePath(data.proposedFolderPath)
        : undefined;

      if (!data.kingResourceId && (!proposedName || !proposedFolderPath)) {
        return NextResponse.json(
          { error: 'proposedName and proposedFolderPath are required when promoting a personal file.' },
          { status: 400 }
        );
      }

      const kingFile = data.kingResourceId
        ? await db.kingFile.findFirst({
            where: { id: data.kingResourceId, spaceId },
          })
        : null;
      if (data.kingResourceId && !kingFile) {
        return NextResponse.json({ error: 'Official file not found' }, { status: 404 });
      }

      if (!data.kingResourceId) {
        const conflictingKingFile = await db.kingFile.findFirst({
          where: {
            spaceId,
            name: proposedName!,
            folderPath: proposedFolderPath!,
          },
          select: { id: true },
        });
        if (conflictingKingFile) {
          return NextResponse.json(
            { error: 'An official file already exists at that path with that name.' },
            { status: 409 }
          );
        }
      }

      const duplicate = await db.mergeRequest.findFirst({
        where: {
          spaceId,
          requesterId: membership.id,
          resourceType: 'FILE',
          ...(data.kingResourceId
            ? { kingFileId: data.kingResourceId }
            : {
                kingFileId: null,
                proposedName: proposedName!,
                proposedFolderPath: proposedFolderPath!,
              }),
          status: 'PENDING',
        },
      });
      if (duplicate) {
        if (!data.replacePending) {
          return NextResponse.json(
            {
              error: 'You already have a pending merge request for this file.',
              code: 'PENDING_REQUEST_EXISTS',
              duplicateRequest: serializeDuplicateRequest(duplicate),
            },
            { status: 409 }
          );
        }
      }

      const request = await db.$transaction(async (tx) => {
        await assertPrivateSpaceWriteAllowed(tx, spaceId);
        if (duplicate) {
          await tx.mergeRequest.update({
            where: { id: duplicate.id },
            data: { status: 'REJECTED' },
          });
        }
        const created = await tx.mergeRequest.create({
          data: {
            spaceId,
            requesterId: membership.id,
            resourceType: 'FILE',
            kingFileId: data.kingResourceId ?? null,
            proposedData: data.proposedData,
            iv: data.iv,
            proposedName: proposedName ?? kingFile?.name,
            proposedFolderPath: proposedFolderPath ?? kingFile?.folderPath,
          },
        });

        return (await mergePrivateSpaceRequest(tx, created.id)) ?? created;
      }, PRIVATE_SPACE_MERGE_TX_OPTIONS);

      await revalidatePrivateSpaceForMembers(spaceId);
      publishSpaceEvent(spaceId, 'MERGE_REQUEST_CREATED', {
        requestId: request.id,
        actorName: session.user.name || session.user.email,
        actorUserId: session.user.id,
      });

      return NextResponse.json({
        id: request.id,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      }, { status: 201 });
    }

    const proposedKeyName = data.proposedName?.trim();
    const proposedSecretFolderPath = data.proposedFolderPath
      ? normalizeSpacePath(data.proposedFolderPath)
      : undefined;
    if (!data.kingResourceId && (!proposedKeyName || !proposedSecretFolderPath)) {
      return NextResponse.json(
        { error: 'proposedName and proposedFolderPath are required when promoting a personal secret.' },
        { status: 400 }
      );
    }

    const kingSecret = data.kingResourceId
      ? await db.kingSecret.findFirst({
          where: { id: data.kingResourceId, spaceId },
        })
      : null;
    if (data.kingResourceId && !kingSecret) {
      return NextResponse.json({ error: 'Official secret not found' }, { status: 404 });
    }

    if (!data.kingResourceId) {
      const conflictingKingSecret = await db.kingSecret.findFirst({
        where: {
          spaceId,
          folderPath: proposedSecretFolderPath!,
          keyName: proposedKeyName!,
        },
        select: { id: true },
      });
      if (conflictingKingSecret) {
        return NextResponse.json(
          { error: 'An official secret with that key name already exists in this space.' },
          { status: 409 }
        );
      }
    }

    const duplicate = await db.mergeRequest.findFirst({
      where: {
        spaceId,
        requesterId: membership.id,
        resourceType: 'SECRET',
        ...(data.kingResourceId
          ? { kingSecretId: data.kingResourceId }
          : {
              kingSecretId: null,
              proposedName: proposedKeyName!,
              proposedFolderPath: proposedSecretFolderPath!,
            }),
        status: 'PENDING',
      },
    });
    if (duplicate) {
      if (!data.replacePending) {
        return NextResponse.json(
          {
            error: 'You already have a pending merge request for this secret.',
            code: 'PENDING_REQUEST_EXISTS',
            duplicateRequest: serializeDuplicateRequest(duplicate),
          },
          { status: 409 }
        );
      }
    }

    const request = await db.$transaction(async (tx) => {
      await assertPrivateSpaceWriteAllowed(tx, spaceId);
      if (duplicate) {
        await tx.mergeRequest.update({
          where: { id: duplicate.id },
          data: { status: 'REJECTED' },
        });
      }
      await ensureSpaceFolderPath(tx, {
        spaceId,
        visibility: 'KING',
        domain: 'SECRET',
        folderPath: proposedSecretFolderPath ?? kingSecret?.folderPath ?? '/',
      });
      const created = await tx.mergeRequest.create({
        data: {
          spaceId,
          requesterId: membership.id,
          resourceType: 'SECRET',
          kingSecretId: data.kingResourceId ?? null,
          proposedData: data.proposedData,
          iv: data.iv,
          proposedName: proposedKeyName ?? kingSecret?.keyName,
          proposedFolderPath: proposedSecretFolderPath ?? kingSecret?.folderPath ?? '/',
        },
      });

      return (await mergePrivateSpaceRequest(tx, created.id)) ?? created;
    }, PRIVATE_SPACE_MERGE_TX_OPTIONS);

    await revalidatePrivateSpaceForMembers(spaceId);
    publishSpaceEvent(spaceId, 'MERGE_REQUEST_CREATED', {
      requestId: request.id,
      actorName: session.user.name || session.user.email,
      actorUserId: session.user.id,
      resourceType: 'SECRET',
    });

    return NextResponse.json({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_MERGE_REQUEST_CREATE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
