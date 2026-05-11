export function isInvitationRecipientMatch(
  invitation: { recipientId: string | null; recipientEmail: string },
  session: { user?: { id?: string | null; email?: string | null } | null } | null
) {
  const sessionUserId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;

  if (invitation.recipientId) {
    return !!sessionUserId && invitation.recipientId === sessionUserId;
  }

  if (sessionEmail && invitation.recipientEmail.toLowerCase() === sessionEmail) {
    return true;
  }

  return false;
}

export function isShareInvitationExpired(invitation: {
  status: string;
  expiresAt: Date | null;
}) {
  return invitation.status === 'EXPIRED' || !!(invitation.expiresAt && invitation.expiresAt < new Date());
}

export function isShareInvitationEnded(status: string) {
  return status === 'REVOKED' || status === 'EXPIRED' || status === 'LEFT';
}

export function canRecipientUseAcceptedShare(
  invitation: { recipientId: string | null; recipientEmail: string; status: string },
  session: { user?: { id?: string | null; email?: string | null } | null } | null
) {
  return invitation.status === 'ACCEPTED' && isInvitationRecipientMatch(invitation, session);
}
