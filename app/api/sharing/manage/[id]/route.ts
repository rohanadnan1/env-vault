import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { UpdateShareInvitationSchema } from '@/lib/validations/schemas';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findFirst({
      where: { id, ownerId: session.user.id },
      include: {
        recipient: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, emoji: true, color: true } },
        comments: {
          include: {
            author: { select: { id: true, name: true, email: true } },
            replies: {
              include: {
                author: { select: { id: true, name: true, email: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        editRequests: {
          include: {
            requester: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { accessLogs: true, downloadLogs: true } },
      },
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    const { shareEncryptionSalt, encryptedShareKey, shareKeyIv, bundleEncrypted, bundleIv, ...safeInv } = invitation;
    const effectiveStatus =
      invitation.status !== 'EXPIRED' && invitation.expiresAt && invitation.expiresAt < new Date()
        ? 'EXPIRED'
        : invitation.status;

    return NextResponse.json({
      ...safeInv,
      status: effectiveStatus,
      expiresAt: (invitation.expiresAt as Date | null)?.toISOString() || null,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
      acceptedAt: (invitation.acceptedAt as Date | null)?.toISOString() || null,
      revokedAt: (invitation.revokedAt as Date | null)?.toISOString() || null,
      firstAccessedAt: (invitation.firstAccessedAt as Date | null)?.toISOString() || null,
      comments: invitation.comments.map(c => ({
        id: c.id,
        content: c.content,
        iv: c.iv,
        isEncrypted: c.isEncrypted,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
        author: c.author,
        replies: c.replies.map(r => ({
          id: r.id,
          content: r.content,
          iv: r.iv,
          isEncrypted: r.isEncrypted,
          parentId: r.parentId,
          createdAt: r.createdAt.toISOString(),
          author: r.author,
        })),
      })),
      editRequests: invitation.editRequests.map(er => ({
        id: er.id,
        resourceType: er.resourceType,
        resourceId: er.resourceId,
        title: er.title,
        description: er.description,
        status: er.status,
        reviewNote: er.reviewNote,
        createdAt: er.createdAt.toISOString(),
        updatedAt: er.updatedAt.toISOString(),
        reviewedAt: (er.reviewedAt as Date | null)?.toISOString() || null,
        requester: er.requester,
      })),
      accessCount: invitation._count.accessLogs,
      downloadCount: invitation._count.downloadLogs,
    });
  } catch (e) {
    console.error('[SHARING_MANAGE_GET]', e);
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
    const invitation = await db.shareInvitation.findFirst({
      where: { id, ownerId: session.user.id }
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invitation.status === 'REVOKED' || invitation.status === 'LEFT' || invitation.status === 'EXPIRED') {
      return NextResponse.json({ error: 'Only active invitations can be updated' }, { status: 409 });
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await db.shareInvitation.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json({ error: 'This invitation has already expired' }, { status: 410 });
    }

    const body = await req.json();
    const data = UpdateShareInvitationSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (data.permission !== undefined) updates.permission = data.permission;
    if (data.expiresAt !== undefined) {
      updates.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }
    if (data.ttlDays !== undefined) updates.ttlDays = data.ttlDays;

    const updated = await db.shareInvitation.update({
      where: { id },
      data: updates
    });

    return NextResponse.json({
      id: updated.id,
      permission: updated.permission,
      expiresAt: updated.expiresAt?.toISOString() || null,
      ttlDays: updated.ttlDays,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_MANAGE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
