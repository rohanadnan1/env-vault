import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { PrivateSpaceInviteStatusCard } from '@/components/private-spaces/PrivateSpaceInviteStatusCard';

export default async function PrivateSpaceInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { token } = await params;
  const invitation = await db.spaceInvitation.findUnique({
    where: { inviteToken: token },
    include: {
      space: { select: { id: true, name: true, createdAt: true } },
      inviter: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!invitation) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Invitation not found.</div>;
  }

  return (
    <PrivateSpaceInviteStatusCard
      userId={session.user.id}
      initialInvitation={{
        id: invitation.id,
        inviteToken: invitation.inviteToken,
        status: invitation.status,
        recipientEmail: invitation.recipientEmail,
        hasEncryptedSpaceKey: !!invitation.encryptedSpaceKey,
        encryptedSpaceKeyAlgorithm: invitation.encryptedSpaceKeyAlgorithm,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
        space: {
          id: invitation.spaceId,
          name: invitation.space.name,
          createdAt: invitation.space.createdAt.toISOString(),
        },
        inviter: invitation.inviter.user,
      }}
    />
  );
}
