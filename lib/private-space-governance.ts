import type { Prisma, PrismaClient } from '@prisma/client';

export const PRIVATE_SPACE_ELECTION_DURATION_MS = 72 * 60 * 60 * 1000;
export const PRIVATE_SPACE_COUNCIL_THRESHOLD = 5;

export class PrivateSpaceLockdownError extends Error {
  constructor(message = 'Election Pending') {
    super(message);
    this.name = 'PrivateSpaceLockdownError';
  }
}

type SpaceMemberRecord = {
  id: string;
  joinedAt: Date;
  isCouncilMember: boolean;
};

function tallyElectionWinners(
  members: SpaceMemberRecord[],
  votes: Array<{
    candidate1Id: string;
    candidate2Id: string;
    candidate3Id: string;
  }>
) {
  const score = new Map<string, number>();
  for (const member of members) {
    score.set(member.id, 0);
  }

  for (const vote of votes) {
    for (const candidateId of [vote.candidate1Id, vote.candidate2Id, vote.candidate3Id]) {
      score.set(candidateId, (score.get(candidateId) ?? 0) + 1);
    }
  }

  return [...members]
    .sort((left, right) => {
      const scoreDiff = (score.get(right.id) ?? 0) - (score.get(left.id) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return left.joinedAt.getTime() - right.joinedAt.getTime();
    })
    .slice(0, Math.min(3, members.length))
    .map((member) => member.id);
}

export async function finalizeElection(tx: Prisma.TransactionClient, electionId: string) {
  const election = await tx.election.findUnique({
    where: { id: electionId },
    include: {
      space: {
        include: {
          members: {
            select: {
              id: true,
              joinedAt: true,
              isCouncilMember: true,
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
      votes: true,
    },
  });

  if (!election || election.status !== 'ACTIVE') {
    return election;
  }

  const winnerIds = tallyElectionWinners(election.space.members, election.votes);

  await tx.spaceMember.updateMany({
    where: { spaceId: election.spaceId },
    data: { isCouncilMember: false },
  });

  if (winnerIds.length > 0) {
    await tx.spaceMember.updateMany({
      where: { id: { in: winnerIds } },
      data: { isCouncilMember: true },
    });
  }

  return tx.election.update({
    where: { id: election.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

export async function maybeAutoCompleteElection(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  const activeElection = await tx.election.findFirst({
    where: { spaceId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!activeElection) return null;
  if (Date.now() - activeElection.createdAt.getTime() < PRIVATE_SPACE_ELECTION_DURATION_MS) {
    return activeElection;
  }

  return finalizeElection(tx, activeElection.id);
}

async function findStaleActiveElection(
  client: GovernanceReadClient,
  spaceId: string
) {
  return client.election.findFirst({
    where: {
      spaceId,
      status: 'ACTIVE',
      createdAt: {
        lte: new Date(Date.now() - PRIVATE_SPACE_ELECTION_DURATION_MS),
      },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
}

type GovernanceReadClient = Prisma.TransactionClient | PrismaClient;

async function readGovernanceState(
  client: GovernanceReadClient,
  spaceId: string
) {
  const [memberCount, activeElection, councilMembers, petitionCount] = await Promise.all([
    client.spaceMember.count({ where: { spaceId } }),
    client.election.findFirst({
      where: { spaceId, status: 'ACTIVE' },
      include: { votes: { select: { voterId: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    client.spaceMember.findMany({
      where: { spaceId, isCouncilMember: true },
      select: { id: true, userId: true },
    }),
    client.reelectionPetition.count({ where: { spaceId } }),
  ]);

  const isCouncilMode = memberCount >= PRIVATE_SPACE_COUNCIL_THRESHOLD;
  const isLockedDown = !!activeElection;

  return {
    memberCount,
    isCouncilMode,
    isLockedDown,
    activeElection,
    councilMembers,
    petitionCount,
  };
}

export async function getGovernanceSnapshot(
  client: GovernanceReadClient,
  spaceId: string
) {
  if ('$transaction' in client && typeof client.$transaction === 'function') {
    const staleElection = await findStaleActiveElection(client, spaceId);
    if (staleElection) {
      await (client as PrismaClient).$transaction(async (tx) => {
        await finalizeElection(tx, staleElection.id);
      });
    }
  }
  return readGovernanceState(client, spaceId);
}

export async function getGovernanceState(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  await maybeAutoCompleteElection(tx, spaceId);
  return readGovernanceState(tx, spaceId);
}

export async function assertPrivateSpaceWriteAllowed(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  const governance = await getGovernanceState(tx, spaceId);
  if (governance.isLockedDown) {
    throw new PrivateSpaceLockdownError();
  }
  return governance;
}

export async function assertForkWriteAllowed(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  const memberCount = await tx.spaceMember.count({ where: { spaceId } });
  if (memberCount === 0) {
    throw new PrivateSpaceLockdownError('Space no longer exists');
  }
  return { memberCount };
}

export async function getMergeApprovalPolicy(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  const governance = await getGovernanceState(tx, spaceId);
  if (governance.isLockedDown) {
    throw new PrivateSpaceLockdownError();
  }

  if (governance.isCouncilMode) {
    return {
      mode: 'COUNCIL' as const,
      memberCount: governance.memberCount,
      requiredApprovals: 2,
      councilMemberIds: governance.councilMembers.map((member) => member.id),
    };
  }

  return {
    mode: 'DEMOCRACY' as const,
    memberCount: governance.memberCount,
    requiredApprovals: Math.max(0, governance.memberCount - 1),
    councilMemberIds: [] as string[],
  };
}

export async function triggerElection(tx: Prisma.TransactionClient, spaceId: string) {
  const existing = await tx.election.findFirst({
    where: { spaceId, status: 'ACTIVE' },
  });
  if (existing) return existing;

  await tx.spaceMember.updateMany({
    where: { spaceId },
    data: { isCouncilMember: false },
  });

  return tx.election.create({
    data: {
      spaceId,
      status: 'ACTIVE',
    },
  });
}

export async function closePendingMergeRequestsForSpace(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  await tx.mergeRequest.updateMany({
    where: {
      spaceId,
      status: 'PENDING',
    },
    data: {
      status: 'REJECTED',
    },
  });
}

export async function handlePrivateSpaceMemberExit(
  tx: Prisma.TransactionClient,
  spaceId: string,
  removedMemberId: string,
  wasCouncilMember: boolean
) {
  // Membership removal is the closest current trigger to a future space-key
  // rotation flow. Pending merge requests are invalidated proactively so they
  // cannot outlive a security-sensitive membership change.
  await closePendingMergeRequestsForSpace(tx, spaceId);

  const remainingMemberCount = await tx.spaceMember.count({
    where: {
      spaceId,
      id: { not: removedMemberId },
    },
  });

  if (remainingMemberCount === 0) {
    await tx.privateSpace.delete({ where: { id: spaceId } });
    return;
  }

  if (!wasCouncilMember) {
    return;
  }

  if (remainingMemberCount >= PRIVATE_SPACE_COUNCIL_THRESHOLD) {
    await tx.reelectionPetition.deleteMany({ where: { spaceId } });
    await triggerElection(tx, spaceId);
    return;
  }

  if (remainingMemberCount < PRIVATE_SPACE_COUNCIL_THRESHOLD) {
    await tx.spaceMember.updateMany({
      where: { spaceId },
      data: { isCouncilMember: false },
    });
    await tx.election.updateMany({
      where: { spaceId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
