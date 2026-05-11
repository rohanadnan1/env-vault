import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { privateSpacesHubTag, revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { handlePrivateSpaceMemberExit } from '@/lib/private-space-governance';
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

  await db.$transaction(async (tx) => {
    const memberCount = await tx.spaceMember.count({ where: { spaceId } });
    if (memberCount <= 1) {
      await tx.privateSpace.delete({ where: { id: spaceId } });
      return;
    }

    await tx.spaceMember.delete({ where: { id: membership.id } });
    await handlePrivateSpaceMemberExit(tx, spaceId, membership.id, membership.isCouncilMember);
  });

  await revalidatePrivateSpaceForMembers(spaceId);
  revalidateTag(privateSpacesHubTag(session.user.id), 'max');
  return NextResponse.json({ success: true });
}
