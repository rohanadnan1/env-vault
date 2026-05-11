import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { mergePrivateSpaceRequest } from '@/lib/private-space';
import { getGovernanceSnapshot, getMergeApprovalPolicy, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { ReviewPrivateSpaceMergeRequestSchema } from '@/lib/validations/schemas';
import { z } from 'zod';
import { publishSpaceEvent } from '@/lib/redis';

const PRIVATE_SPACE_REVIEW_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { requestId } = await params;

  try {
    const body = await req.json();
    const data = ReviewPrivateSpaceMergeRequestSchema.parse(body);

    const request = await db.mergeRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: true,
        approvals: true,
      },
    });

    if (!request) {
      return NextResponse.json({ error: 'Merge request not found' }, { status: 404 });
    }

    const membership = await db.spaceMember.findFirst({
      where: {
        spaceId: request.spaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (request.requesterId === membership.id) {
      return NextResponse.json({ error: 'You cannot review your own merge request' }, { status: 403 });
    }

    if (request.status !== 'PENDING') {
      return NextResponse.json({ error: 'This merge request is no longer pending' }, { status: 409 });
    }

    if (data.action === 'REJECT') {
      const governance = await getGovernanceSnapshot(db, request.spaceId);
      if (governance.isLockedDown) {
        throw new PrivateSpaceLockdownError();
      }

      const rejected = await db.mergeRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });

    await revalidatePrivateSpaceForMembers(request.spaceId);
    publishSpaceEvent(request.spaceId, 'MERGE_REQUEST_REJECTED', {
      requestId: request.id,
      actorName: session.user.name || session.user.email,
      actorUserId: session.user.id,
    });

      return NextResponse.json({
        id: rejected.id,
        status: rejected.status,
        updatedAt: rejected.updatedAt.toISOString(),
      });
    }

    const alreadyApproved = request.approvals.some((approval) => approval.memberId === membership.id);
    if (alreadyApproved) {
      return NextResponse.json({ error: 'You already approved this merge request' }, { status: 409 });
    }

    const result = await db.$transaction(async (tx) => {
      const policy = await getMergeApprovalPolicy(tx, request.spaceId);
      if (policy.mode === 'COUNCIL' && !policy.councilMemberIds.includes(membership.id)) {
        throw new Error('Only council members can approve merge requests in council mode');
      }

      await tx.mergeApproval.create({
        data: {
          requestId: request.id,
          memberId: membership.id,
          preserveFolderStructure: data.preserveFolderStructure ?? false,
        },
      });

      const merged = await mergePrivateSpaceRequest(tx, request.id);
      if (merged) return merged;

      return tx.mergeRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
    }, PRIVATE_SPACE_REVIEW_TX_OPTIONS);

    await revalidatePrivateSpaceForMembers(request.spaceId);
    publishSpaceEvent(
      request.spaceId,
      result.status === 'MERGED' ? 'MERGE_REQUEST_MERGED' : 'MERGE_REQUEST_APPROVED',
      {
        requestId: result.id,
        actorName: session.user.name || session.user.email,
        actorUserId: session.user.id,
      }
    );

    return NextResponse.json({
      id: result.id,
      status: result.status,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Only council members can approve merge requests in council mode') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_MERGE_REQUEST_REVIEW]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
