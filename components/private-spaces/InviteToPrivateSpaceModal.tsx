"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { encryptSpaceKeyForMember } from '@/lib/crypto/private-space';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceKey: CryptoKey | null;
  onInvited?: (payload: {
    id: string;
    status: string;
    inviteToken: string;
    recipient: {
      email: string;
      hasAccount: boolean;
      hasVaultKey: boolean;
      needsVaultKey: boolean;
    };
  }) => void;
};

export function InviteToPrivateSpaceModal({ open, onOpenChange, spaceId, spaceKey, onInvited }: Props) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      const lookupRes = await fetch(`/api/users/vault-key?email=${encodeURIComponent(email.trim())}`);
      const lookup = await lookupRes.json();
      if (!lookupRes.ok) throw new Error(lookup.error || 'Could not look up recipient');

      let encryptedSpaceKey: string | undefined;
      let encryptedSpaceKeyAlgorithm: string | undefined;

      if (lookup.hasVaultKey) {
        if (!spaceKey) throw new Error('Space key is not available on this device');
        encryptedSpaceKey = await encryptSpaceKeyForMember(spaceKey, lookup.vaultPublicKey);
        encryptedSpaceKeyAlgorithm = lookup.vaultPublicKeyAlgorithm;
      }

      const res = await fetch(`/api/spaces/${spaceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          encryptedSpaceKey,
          encryptedSpaceKeyAlgorithm,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not send invite');

      toast.success(
        payload.needsApproval
          ? 'Invite sent for creator approval'
          : payload.needsRepair
            ? 'Invite saved. Complete it once the recipient sets up their vault.'
            : 'Invite sent — ready to accept'
      );
      setEmail('');
      onOpenChange(false);
      onInvited?.(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite member');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Invite a teammate by email. Their personal fork will be created when they join.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Input
            type="text"
            placeholder="@username or email@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <p className="text-[10px] text-slate-400">Use @username to invite an existing user, or enter their email address.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !email.trim()}>
            {isSubmitting ? 'Inviting...' : 'Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
