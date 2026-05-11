import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { PRIVATE_SPACE_COUNCIL_THRESHOLD, PrivateSpaceLockdownError, getGovernanceState, triggerElection } from '@/lib/private-space-governance';
import { requireSpaceMembership } from '@/lib/private-space';

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const governance = await db.$transaction(async (tx) => {
      return getGovernanceState(tx, spaceId);
    });

    if (governance.activeElection) {
      return NextResponse.json({ error: 'An election is already in progress' }, { status: 403 });
    }
    if (!governance.isCouncilMode) {
      return NextResponse.json(
        { error: `Re-election petitions are only available in council mode (${PRIVATE_SPACE_COUNCIL_THRESHOLD}+ members).` },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      await tx.reelectionPetition.upsert({
        where: {
          spaceId_memberId: {
            spaceId,
            memberId: membership.id,
          },
        },
        update: {},
        create: {
          spaceId,
          memberId: membership.id,
        },
      });

      const petitionCount = await tx.reelectionPetition.count({ where: { spaceId } });
      const shouldTrigger = petitionCount > governance.memberCount / 2;

      if (shouldTrigger) {
        await tx.spaceMember.updateMany({
          where: { spaceId },
          data: { isCouncilMember: false },
        });
        await tx.reelectionPetition.deleteMany({ where: { spaceId } });
        await triggerElection(tx, spaceId);
      }

      return { petitionCount, shouldTrigger };
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json({
      success: true,
      petitionCount: result.petitionCount,
      electionTriggered: result.shouldTrigger,
    });
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('[PRIVATE_SPACE_REELECTION_PETITION]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
