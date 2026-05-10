import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface Notification {
  id: string;
  type: 'NEW_SHARE' | 'REVIEW_REQUESTED' | 'REVIEW_UPDATED' | 'NEW_COMMENT';
  message: string;
  actionUrl: string;
  createdAt: string;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessionEmail = session.user.email?.toLowerCase();

  try {
    const notifications: Notification[] = [];

    try {
      const newShares = await db.shareInvitation.findMany({
        where: {
          createdAt: { gt: sinceDate },
          OR: [
            { recipientId: session.user.id },
            ...(sessionEmail ? [{ recipientEmail: { equals: sessionEmail, mode: 'insensitive' as const } }] : []),
          ],
        },
        include: {
          owner: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      for (const inv of newShares) {
        notifications.push({
          id: `share-${inv.id}`,
          type: 'NEW_SHARE',
          message: `${inv.owner.name || inv.owner.email} shared a ${inv.resourceType.toLowerCase()} with you`,
          actionUrl: `/shared/${inv.id}`,
          createdAt: inv.createdAt.toISOString(),
        });
      }
    } catch { /* skip share queries on connection issues */ }

    try {
      const reviewRequests = await db.shareEditRequest.findMany({
        where: {
          createdAt: { gt: sinceDate },
          invitation: { ownerId: session.user.id },
        },
        include: {
          requester: { select: { name: true, email: true } },
          invitation: { select: { resourceType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      for (const er of reviewRequests) {
        if (er.status === 'PENDING') {
          notifications.push({
            id: `review-req-${er.id}`,
            type: 'REVIEW_REQUESTED',
            message: `${er.requester.name || er.requester.email} submitted a review on ${er.invitation.resourceType.toLowerCase()}: ${er.title}`,
            actionUrl: `/sharing/reviews/${er.id}`,
            createdAt: er.createdAt.toISOString(),
          });
        }
      }
    } catch { /* skip */ }

    try {
      const reviewOutcomes = await db.shareEditRequest.findMany({
        where: {
          requesterId: session.user.id,
          status: { not: 'PENDING' },
          updatedAt: { gt: sinceDate },
        },
        include: {
          invitation: {
            select: {
              resourceType: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const er of reviewOutcomes) {
        const statusLabel = er.status === 'MERGED' ? 'merged' : er.status === 'APPROVED' ? 'approved' : 'rejected';
        notifications.push({
          id: `review-out-${er.id}`,
          type: 'REVIEW_UPDATED',
          message: `${er.invitation.owner.name || er.invitation.owner.email} ${statusLabel} your edit: ${er.title}`,
          actionUrl: `/shared/${er.invitationId}`,
          createdAt: er.updatedAt.toISOString(),
        });
      }
    } catch { /* skip */ }

    try {
      const recentComments = await db.shareComment.findMany({
        where: {
          createdAt: { gt: sinceDate },
          authorId: { not: session.user.id },
          invitation: {
            OR: [
              { ownerId: session.user.id },
              { recipientId: session.user.id },
              ...(sessionEmail ? [{ recipientEmail: { equals: sessionEmail, mode: 'insensitive' as const } }] : []),
            ],
          },
        },
        include: {
          author: { select: { name: true, email: true } },
          invitation: { select: { resourceType: true, ownerId: true, recipientId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      for (const c of recentComments) {
        const isOwner = c.invitation.ownerId === session.user.id;
        notifications.push({
          id: `comment-${c.id}`,
          type: 'NEW_COMMENT',
          message: `${c.author.name || c.author.email} commented on a shared ${c.invitation.resourceType.toLowerCase()}`,
          actionUrl: isOwner ? `/sharing/sent/${c.invitationId}` : `/shared/${c.invitationId}`,
          createdAt: c.createdAt.toISOString(),
        });
      }
    } catch { /* skip */ }

    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ notifications });
  } catch (e) {
    console.error('[NOTIFICATIONS]', e);
    return NextResponse.json({ notifications: [] });
  }
}
