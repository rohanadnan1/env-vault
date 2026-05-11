import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { finalizeElection, getGovernanceState } from '@/lib/private-space-governance';
import { requireSpaceMembership } from '@/lib/private-space';
import { VotePrivateSpaceElectionSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; electionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: spaceId, electionId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = VotePrivateSpaceElectionSchema.parse(body);

    const distinctCandidateIds = new Set([data.candidate1Id, data.candidate2Id, data.candidate3Id]);
    if (distinctCandidateIds.size !== 3) {
      return NextResponse.json({ error: 'You must vote for three different members.' }, { status: 400 });
    }
    if (distinctCandidateIds.has(membership.id)) {
      return NextResponse.json({ error: 'You cannot vote for yourself.' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const governance = await getGovernanceState(tx, spaceId);
      if (!governance.activeElection || governance.activeElection.id !== electionId) {
        throw new Error('Election not found or already completed');
      }

      const validCandidates = await tx.spaceMember.findMany({
        where: {
          spaceId,
          id: { in: [...distinctCandidateIds] },
        },
        select: { id: true },
      });
      if (validCandidates.length !== 3) {
        throw new Error('All selected candidates must belong to this space');
      }

      const vote = await tx.electionVote.upsert({
        where: {
          electionId_voterId: {
            electionId,
            voterId: membership.id,
          },
        },
        update: {
          candidate1Id: data.candidate1Id,
          candidate2Id: data.candidate2Id,
          candidate3Id: data.candidate3Id,
        },
        create: {
          electionId,
          voterId: membership.id,
          candidate1Id: data.candidate1Id,
          candidate2Id: data.candidate2Id,
          candidate3Id: data.candidate3Id,
        },
      });

      const totalVotes = await tx.electionVote.count({ where: { electionId } });
      const memberCount = governance.memberCount;

      if (totalVotes >= memberCount) {
        await finalizeElection(tx, electionId);
      }

      return vote;
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json({
      success: true,
      voteId: result.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error';
    if (message === 'Election not found or already completed' || message === 'All selected candidates must belong to this space') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('[PRIVATE_SPACE_ELECTION_VOTE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
