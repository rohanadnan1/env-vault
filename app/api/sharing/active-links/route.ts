import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [totalActive, expiringSoon, totalRecipients, pendingCount, recentViews, recentDownloads, recentEditRequests] = await Promise.all([
      db.shareInvitation.count({
        where: {
          ownerId: session.user.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      db.shareInvitation.count({
        where: {
          ownerId: session.user.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      db.shareInvitation.groupBy({
        by: ['recipientEmail'],
        where: {
          ownerId: session.user.id,
          status: { in: ['PENDING', 'ACCEPTED'] }
        }
      }).then(r => r.length),
      db.shareInvitation.count({
        where: { ownerId: session.user.id, status: 'PENDING' }
      }),
      db.shareAccessLog.findMany({
        where: {
          invitation: { ownerId: session.user.id }
        },
        include: {
          invitation: { select: { resourceType: true, resourceId: true } },
          user: { select: { name: true, email: true } }
        },
        orderBy: { accessedAt: 'desc' },
        take: 10
      }),
      db.shareDownloadLog.findMany({
        where: {
          invitation: { ownerId: session.user.id },
        },
        include: {
          invitation: { select: { resourceType: true, resourceId: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { downloadedAt: 'desc' },
        take: 10,
      }),
      db.shareEditRequest.findMany({
        where: {
          invitation: { ownerId: session.user.id },
        },
        include: {
          requester: { select: { name: true, email: true } },
          invitation: { select: { resourceType: true, resourceId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const activityFeed = [
      ...recentViews.map(log => ({
        id: `view:${log.id}`,
        action: log.action,
        resourceDetail: log.resourceDetail,
        accessedAt: log.accessedAt.toISOString(),
        user: log.user,
        resourceType: log.invitation.resourceType,
      })),
      ...recentDownloads.map(log => ({
        id: `download:${log.id}`,
        action: 'DOWNLOAD',
        resourceDetail: log.fileName || log.invitation.resourceId,
        accessedAt: log.downloadedAt.toISOString(),
        user: log.user,
        resourceType: log.invitation.resourceType,
      })),
      ...recentEditRequests.map(request => ({
        id: `edit:${request.id}`,
        action: 'EDIT_REQUEST',
        resourceDetail: request.title,
        accessedAt: request.createdAt.toISOString(),
        user: request.requester,
        resourceType: request.invitation.resourceType,
      })),
    ]
      .sort((a, b) => new Date(b.accessedAt).getTime() - new Date(a.accessedAt).getTime())
      .slice(0, 10);

    return NextResponse.json({
      totalActive,
      expiringSoon,
      totalRecipients,
      pendingCount,
      recentActivity: activityFeed,
    });
  } catch (e) {
    console.error('[SHARING_ACTIVE_LINKS]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
