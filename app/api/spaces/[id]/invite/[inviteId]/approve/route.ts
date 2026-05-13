import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: spaceId, inviteId } = await params;

  const membership = await db.spaceMember.findFirst({
    where: { spaceId, userId: session.user.id },
    select: { id: true, joinedAt: true },
  });
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  const earliestMember = await db.spaceMember.findFirst({
    where: { spaceId },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true },
  });
  const isCreator = earliestMember?.userId === session.user.id;
  if (!isCreator) return NextResponse.json({ error: 'Only the space creator can approve invites' }, { status: 403 });

  let action: 'APPROVE' | 'REJECT';
  try {
    const body = await req.json();
    if (body.action !== 'APPROVE' && body.action !== 'REJECT') throw new Error();
    action = body.action;
  } catch {
    return NextResponse.json({ error: 'action must be APPROVE or REJECT' }, { status: 400 });
  }

  const invite = await db.spaceInvitation.findUnique({
    where: { id: inviteId },
  });
  if (!invite || invite.spaceId !== spaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'Already resolved' }, { status: 409 });

  if (action === 'REJECT') {
    await db.spaceInvitation.update({ where: { id: inviteId }, data: { status: 'REVOKED' } });
    await revalidatePrivateSpaceForMembers(spaceId);
    return NextResponse.json({ success: true, status: 'REVOKED' });
  }

  await db.spaceInvitation.update({ where: { id: inviteId }, data: { status: 'PENDING' } });
  await revalidatePrivateSpaceForMembers(spaceId);

  return NextResponse.json({
    success: true,
    status: 'PENDING',
    inviteToken: invite.inviteToken,
    recipientEmail: invite.recipientEmail,
  });
}
