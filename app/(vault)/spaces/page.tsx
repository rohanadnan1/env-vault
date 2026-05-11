import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCachedPrivateSpacesForUser } from '@/lib/private-space-cache';
import { redirect } from 'next/navigation';
import { PrivateSpacesHub } from '@/components/private-spaces/PrivateSpacesHub';

function toIsoString(value: Date | string) {
  return typeof value === 'string' ? value : value.toISOString();
}

export default async function SpacesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const sessionEmail = session.user.email?.toLowerCase();
  const [memberships, invitations] = await Promise.all([
    getCachedPrivateSpacesForUser(session.user.id),
    sessionEmail
      ? db.spaceInvitation.findMany({
          where: {
            OR: [
              { recipientId: session.user.id },
              { recipientEmail: { equals: sessionEmail, mode: 'insensitive' } },
            ],
          },
          include: {
            space: { select: { id: true, name: true, createdAt: true } },
            inviter: {
              include: {
                user: { select: { id: true, email: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <PrivateSpacesHub
      userId={session.user.id}
      spaces={memberships.map(({ space }) => ({
        id: space.id,
        name: space.name,
        createdAt: toIsoString(space.createdAt),
        updatedAt: toIsoString(space.updatedAt),
        _count: space._count,
      }))}
      invitations={invitations.map((invitation) => ({
        id: invitation.id,
        inviteToken: invitation.inviteToken,
        status: invitation.status,
        recipientEmail: invitation.recipientEmail,
        hasEncryptedSpaceKey: !!invitation.encryptedSpaceKey,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
        space: {
          id: invitation.space.id,
          name: invitation.space.name,
          createdAt: invitation.space.createdAt.toISOString(),
        },
        inviter: invitation.inviter.user,
      }))}
    />
  );
}
