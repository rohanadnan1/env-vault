import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ReviewsContent, ReviewRequest } from './reviews-content';

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  let requests: ReviewRequest[] = [];
  let error: string | undefined;

  try {
    const editRequests = await db.shareEditRequest.findMany({
      where: {
        invitation: { ownerId: session.user.id },
        status: 'PENDING',
      },
      include: {
        invitation: {
          select: {
            resourceType: true,
            resourceId: true,
            permission: true,
            recipientEmail: true,
          }
        },
        requester: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    requests = editRequests.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      resourceType: r.invitation.resourceType,
      resourceId: r.invitation.resourceId,
      proposedEncrypted: r.proposedEncrypted,
      proposedIv: r.proposedIv,
      createdAt: r.createdAt.toISOString(),
      requester: r.requester,
      invitation: r.invitation,
    }));
  } catch (e) {
    error = 'Could not load reviews';
  }

  return <ReviewsContent requests={requests} error={error} />;
}
