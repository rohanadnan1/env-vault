export function isInvitationRecipientMatch(
  invitation: { recipientId: string | null; recipientEmail: string },
  session: { user?: { id?: string | null; email?: string | null } | null } | null
) {
  const sessionUserId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;

  if (invitation.recipientId && sessionUserId && invitation.recipientId === sessionUserId) {
    return true;
  }

  if (sessionEmail && invitation.recipientEmail.toLowerCase() === sessionEmail) {
    return true;
  }

  return false;
}
