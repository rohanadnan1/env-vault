import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: spaceId, requestId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  let action: 'APPROVE' | 'REJECT';
  try {
    const body = await req.json();
    if (body.action !== 'APPROVE' && body.action !== 'REJECT') throw new Error();
    action = body.action;
  } catch {
    return NextResponse.json({ error: 'action must be APPROVE or REJECT' }, { status: 400 });
  }

  const request = await db.peerCloneRequest.findUnique({
    where: { id: requestId },
    include: {
      requester: { select: { id: true } },
    },
  });
  if (!request || request.spaceId !== spaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (request.sourceId !== membership.id) return NextResponse.json({ error: 'Only the source member can approve/reject' }, { status: 403 });
  if (request.status !== 'PENDING') return NextResponse.json({ error: 'Already resolved' }, { status: 409 });

  if (action === 'REJECT') {
    await db.peerCloneRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }

  await db.$transaction(async (tx) => {
    const sourceFiles = await tx.userFile.findMany({
      where: { memberId: membership.id },
      select: { name: true, folderPath: true, contentEncrypted: true, iv: true },
    });

    for (const file of sourceFiles) {
      const existing = await tx.userFile.findFirst({
        where: {
          memberId: request.requester.id,
          folderPath: file.folderPath,
          name: file.name,
        },
      });
      if (request.type === 'STRUCTURE') {
        if (existing) continue;
        await tx.userFile.create({
          data: {
            memberId: request.requester.id,
            name: file.name,
            folderPath: file.folderPath,
            contentEncrypted: '',
            iv: '',
            workspaceMode: 'DRAFT',
          },
        });
      } else {
        if (existing) {
          await tx.userFile.update({
            where: { id: existing.id },
            data: { contentEncrypted: file.contentEncrypted, iv: file.iv },
          });
        } else {
          await tx.userFile.create({
            data: {
              memberId: request.requester.id,
              name: file.name,
              folderPath: file.folderPath,
              contentEncrypted: file.contentEncrypted,
              iv: file.iv,
              workspaceMode: 'DRAFT',
            },
          });
        }
      }
    }

    const sourceSecrets = await tx.userSecret.findMany({
      where: { memberId: membership.id },
      select: { keyName: true, folderPath: true, valueEncrypted: true, iv: true },
    });

    for (const secret of sourceSecrets) {
      const existing = await tx.userSecret.findFirst({
        where: {
          memberId: request.requester.id,
          folderPath: secret.folderPath,
          keyName: secret.keyName,
        },
      });
      if (request.type === 'STRUCTURE') {
        if (existing) continue;
        await tx.userSecret.create({
          data: {
            memberId: request.requester.id,
            keyName: secret.keyName,
            folderPath: secret.folderPath,
            valueEncrypted: '',
            iv: '',
            workspaceMode: 'DRAFT',
          },
        });
      } else {
        if (existing) {
          await tx.userSecret.update({
            where: { id: existing.id },
            data: { valueEncrypted: secret.valueEncrypted, iv: secret.iv },
          });
        } else {
          await tx.userSecret.create({
            data: {
              memberId: request.requester.id,
              keyName: secret.keyName,
              folderPath: secret.folderPath,
              valueEncrypted: secret.valueEncrypted,
              iv: secret.iv,
              workspaceMode: 'DRAFT',
            },
          });
        }
      }
    }

    await tx.peerCloneRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' },
    });
  });

  await revalidatePrivateSpaceForMembers(spaceId);
  return NextResponse.json({ success: true, status: 'APPROVED' });
}
