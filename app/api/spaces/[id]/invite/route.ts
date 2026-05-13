import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { revalidatePrivateSpaceForMembers } from '@/lib/private-space-cache';
import { assertPrivateSpaceWriteAllowed, PrivateSpaceLockdownError } from '@/lib/private-space-governance';
import { sharingInviteLimiter } from '@/lib/ratelimit';
import { InviteToPrivateSpaceSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

type InviteRouteContext = {
  params: Promise<{ id: string }>;
};

async function resolveRecipientEmail(input: string): Promise<{ email: string; userId?: string } | null> {
  const trimmed = input.trim();
  if (trimmed.startsWith('@')) {
    const username = trimmed.slice(1).toLowerCase();
    const user = await db.user.findFirst({
      where: { name: { equals: username, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (!user) return null;
    return { email: user.email.toLowerCase(), userId: user.id };
  }
  const email = trimmed.toLowerCase();
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) return { email };
  return { email, userId: user.id };
}

export async function POST(req: Request, ctx: InviteRouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  try {
    const { success: rateOk } = await sharingInviteLimiter.limit(`space:${userId}`);
    if (!rateOk) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

    const { id: spaceId } = await ctx.params;
    const body = await req.json();
    const data = InviteToPrivateSpaceSchema.parse(body);
    const resolved = await resolveRecipientEmail(data.recipientEmail);
    if (!resolved) return NextResponse.json({ error: 'Recipient not found. Use @username or email.' }, { status: 404 });

    const normalizedEmail = resolved.email;

    const inviterMembership = await db.spaceMember.findFirst({
      where: { spaceId, userId },
      include: { space: { select: { id: true, name: true } } },
    });
    if (!inviterMembership) return NextResponse.json({ error: 'Private space not found' }, { status: 404 });

    if (resolved.userId === userId) return NextResponse.json({ error: 'You are already a member of this space.' }, { status: 409 });

    const recipient = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, vaultPublicKey: true, vaultPublicKeyAlgorithm: true },
    });

    if (recipient) {
      const existingMember = await db.spaceMember.findFirst({
        where: { spaceId, userId: recipient.id },
        select: { id: true },
      });
      if (existingMember) return NextResponse.json({ error: 'Recipient is already a member of this space.' }, { status: 409 });
    }

    const duplicateInvite = await db.spaceInvitation.findFirst({
      where: {
        spaceId,
        recipientEmail: normalizedEmail,
        status: { in: ['PENDING', 'PENDING_APPROVAL'] },
      },
      select: { id: true },
    });
    if (duplicateInvite) return NextResponse.json({ error: 'A pending invite already exists for this recipient.' }, { status: 409 });

    const earliestMember = await db.spaceMember.findFirst({
      where: { spaceId },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true, id: true },
    });
    const isCreator = earliestMember?.userId === userId;

    const recipientNeedsVaultKey = !!recipient && !recipient.vaultPublicKey;
    const recipientHasVaultKey = !!recipient?.vaultPublicKey;

    if (!isCreator && recipientHasVaultKey && !data.encryptedSpaceKey) {
      return NextResponse.json(
        { error: 'encryptedSpaceKey is required for recipients with a vault public key.' },
        { status: 400 }
      );
    }

    const status = isCreator ? 'PENDING' : 'PENDING_APPROVAL';

    const invitation = await db.$transaction(async (tx) => {
      await assertPrivateSpaceWriteAllowed(tx, spaceId);
      return tx.spaceInvitation.create({
        data: {
          spaceId,
          inviterId: inviterMembership.id,
          recipientEmail: normalizedEmail,
          recipientId: recipient?.id ?? null,
          inviteToken: crypto.randomBytes(32).toString('hex'),
          encryptedSpaceKey: data.encryptedSpaceKey ?? null,
          encryptedSpaceKeyAlgorithm: data.encryptedSpaceKeyAlgorithm ?? recipient?.vaultPublicKeyAlgorithm ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          status,
        },
      });
    });

    await revalidatePrivateSpaceForMembers(spaceId);

    return NextResponse.json(
      {
        id: invitation.id,
        status: invitation.status,
        inviteToken: invitation.inviteToken,
        needsApproval: !isCreator,
        recipient: {
          email: normalizedEmail,
          hasAccount: !!recipient,
          hasVaultKey: recipientHasVaultKey,
          needsVaultKey: recipientNeedsVaultKey,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PrivateSpaceLockdownError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    console.error('[PRIVATE_SPACE_INVITE]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
