import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { ReviewShareEditRequestSchema } from '@/lib/validations/schemas';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const editRequest = await db.shareEditRequest.findUnique({
      where: { id },
      include: {
        invitation: {
          include: {
            owner: { select: { id: true, name: true } },
          },
        },
        requester: { select: { id: true, name: true, email: true } },
      }
    });
    if (!editRequest) return NextResponse.json({ error: 'Edit request not found' }, { status: 404 });

    const isOwner = editRequest.invitation.ownerId === session.user.id;
    const isRequester = editRequest.requesterId === session.user.id;
    if (!isOwner && !isRequester) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      id: editRequest.id,
      invitationId: editRequest.invitationId,
      resourceType: editRequest.resourceType,
      resourceId: editRequest.resourceId,
      title: editRequest.title,
      description: editRequest.description,
      proposedEncrypted: isOwner || isRequester ? editRequest.proposedEncrypted : undefined,
      proposedIv: isOwner || isRequester ? editRequest.proposedIv : undefined,
      previousVersionId: editRequest.previousVersionId,
      status: editRequest.status,
      reviewNote: editRequest.reviewNote,
      createdAt: editRequest.createdAt.toISOString(),
      updatedAt: editRequest.updatedAt.toISOString(),
      reviewedAt: editRequest.reviewedAt?.toISOString() || null,
      requester: editRequest.requester,
      owner: editRequest.invitation.owner,
      invitation: {
        id: editRequest.invitation.id,
        permission: editRequest.invitation.permission,
        encryptedShareKey: editRequest.invitation.encryptedShareKey,
        shareKeyIv: editRequest.invitation.shareKeyIv,
        shareEncryptionSalt: editRequest.invitation.shareEncryptionSalt,
      },
    });
  } catch (e) {
    console.error('[SHARING_EDIT_REQUEST_GET]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = ReviewShareEditRequestSchema.parse(body);

    const editRequest = await db.shareEditRequest.findUnique({
      where: { id },
      include: { invitation: true }
    });
    if (!editRequest) return NextResponse.json({ error: 'Edit request not found' }, { status: 404 });
    if (editRequest.invitation.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Only the owner can review edit requests' }, { status: 403 });
    }

    if (data.action === 'MERGE') {
      if (!data.mergedEncrypted || !data.mergedIv) {
        return NextResponse.json({ error: 'Merged content is required to merge this review' }, { status: 400 });
      }
      const mergedEncrypted = data.mergedEncrypted;
      const mergedIv = data.mergedIv;

      await db.$transaction(async (tx) => {
        if (editRequest.resourceType === 'SECRET') {
          const latestHistory = await tx.secretHistory.findFirst({
            where: { secretId: editRequest.resourceId },
            orderBy: { revisionNumber: 'desc' },
          });

          await tx.secret.update({
            where: { id: editRequest.resourceId },
            data: {
              valueEncrypted: mergedEncrypted,
              iv: mergedIv,
            },
          });

          await tx.secretHistory.create({
            data: {
              secretId: editRequest.resourceId,
              valueEncrypted: mergedEncrypted,
              iv: mergedIv,
              revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
              previousHistoryId: latestHistory?.id ?? null,
            },
          });
        } else if (editRequest.resourceType === 'FILE') {
          const latestHistory = await tx.fileHistory.findFirst({
            where: { fileId: editRequest.resourceId },
            orderBy: { revisionNumber: 'desc' },
          });

          await tx.vaultFile.update({
            where: { id: editRequest.resourceId },
            data: {
              contentEncrypted: mergedEncrypted,
              iv: mergedIv,
            },
          });

          const file = await tx.vaultFile.findUniqueOrThrow({
            where: { id: editRequest.resourceId },
            select: { name: true },
          });

          const fileName = (await tx.vaultFile.findUniqueOrThrow({
            where: { id: editRequest.resourceId },
            select: { name: true },
          })).name;

          await tx.fileHistory.create({
            data: {
              fileId: editRequest.resourceId,
              name: fileName,
              contentEncrypted: mergedEncrypted,
              iv: mergedIv,
            },
          });

          await tx.fileHistory.create({
            data: {
              fileId: editRequest.resourceId,
              name: file.name,
              contentEncrypted: mergedEncrypted,
              iv: mergedIv,
              revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
              previousHistoryId: latestHistory?.id ?? null,
            },
          });
        } else {
          throw new Error('Only file and secret edit requests can be merged right now');
        }

        await tx.shareEditRequest.update({
          where: { id },
          data: {
            status: 'MERGED',
            reviewedAt: new Date(),
            reviewNote: data.reviewNote || null,
          },
        });
      });
    } else {
      const newStatus: 'APPROVED' | 'REJECTED' = data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await db.shareEditRequest.update({
        where: { id },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewNote: data.reviewNote || null,
        }
      });
    }

    const updated = await db.shareEditRequest.findUniqueOrThrow({ where: { id } });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt?.toISOString() || null,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_EDIT_REQUEST_REVIEW]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
