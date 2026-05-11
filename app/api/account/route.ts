import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { handlePrivateSpaceMemberExit } from '@/lib/private-space-governance';

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  try {
    const impactedSpaces = await db.spaceMember.findMany({
      where: { userId },
      select: {
        id: true,
        spaceId: true,
        isCouncilMember: true,
      },
    });

    await db.$transaction(async (tx) => {
      await tx.user.delete({
        where: { id: userId },
      });

      for (const membership of impactedSpaces) {
        await handlePrivateSpaceMemberExit(tx, membership.spaceId, membership.id, membership.isCouncilMember);
      }
    });

    for (const membership of impactedSpaces) {
      await revalidatePrivateSpaceForMembers(membership.spaceId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Account Deletion Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
