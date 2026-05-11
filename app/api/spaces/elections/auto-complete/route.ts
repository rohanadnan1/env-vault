import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { finalizeElection, PRIVATE_SPACE_ELECTION_DURATION_MS } from '@/lib/private-space-governance';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';

export async function POST() {
  const staleElections = await db.election.findMany({
    where: {
      status: 'ACTIVE',
      createdAt: {
        lte: new Date(Date.now() - PRIVATE_SPACE_ELECTION_DURATION_MS),
      },
    },
    select: {
      id: true,
      spaceId: true,
    },
  });

  const completedSpaceIds = new Set<string>();
  for (const election of staleElections) {
    await db.$transaction(async (tx) => {
      await finalizeElection(tx, election.id);
    });
    completedSpaceIds.add(election.spaceId);
  }

  for (const spaceId of completedSpaceIds) {
    await revalidatePrivateSpaceForMembers(spaceId);
  }

  return NextResponse.json({
    completed: staleElections.length,
  });
}
