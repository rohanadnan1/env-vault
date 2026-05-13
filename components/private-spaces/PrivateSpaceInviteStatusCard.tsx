"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ArrowRight, ShieldAlert, KeyRound, Download } from 'lucide-react';
import { ensurePrivateSpaceKeyPair, readPrivateSpaceKeyPair } from '@/lib/crypto/private-space-client';
import { KeypairManager } from '@/components/private-spaces/KeypairManager';

type InvitationPayload = {
  id: string;
  inviteToken: string;
  status: string;
  recipientEmail: string;
  hasEncryptedSpaceKey: boolean;
  encryptedSpaceKeyAlgorithm?: string | null;
  expiresAt: string | null;
  createdAt: string;
  space: {
    id: string;
    name: string;
    createdAt: string;
  };
  inviter: {
    id: string;
    email: string;
    username?: string | null;
    name: string | null;
  };
};

function personLabel(person: { username?: string | null; name?: string | null; email?: string | null }) {
  return person.username ? `@${person.username}` : person.name || person.email || "Unknown";
}

type Props = {
  userId: string;
  initialInvitation: InvitationPayload;
};

export function PrivateSpaceInviteStatusCard({ userId, initialInvitation }: Props) {
  const router = useRouter();
  const [invitation, setInvitation] = useState(initialInvitation);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [keypairReady, setKeypairReady] = useState(false);
  const [keypairWasMissing, setKeypairWasMissing] = useState(false);
  const [isEnsuringKeypair, setIsEnsuringKeypair] = useState(true);

  const isReady = invitation.status === 'PENDING' && invitation.hasEncryptedSpaceKey;
  const isPending = invitation.status === 'PENDING' && !invitation.hasEncryptedSpaceKey;
  const isAccepted = invitation.status === 'ACCEPTED';

  useEffect(() => {
    let cancelled = false;
    setIsEnsuringKeypair(true);
    ensurePrivateSpaceKeyPair(userId)
      .then((_record) => {
        if (cancelled) return;
        const existed = !!readPrivateSpaceKeyPair(userId);
        setKeypairReady(true);
        setKeypairWasMissing(!existed);
      })
      .catch(() => {
        if (cancelled) return;
        setKeypairReady(false);
      })
      .finally(() => {
        if (!cancelled) setIsEnsuringKeypair(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!isPending) return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        setIsChecking(true);
        const res = await fetch(`/api/spaces/invite/${invitation.inviteToken}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok || cancelled) return;

        setInvitation((current) => {
          const becameReady = !current.hasEncryptedSpaceKey && !!payload.hasEncryptedSpaceKey;
          if (becameReady) {
            toast.success('This invite is now ready. You can accept it below.');
          }
          return payload;
        });
      } catch { /* ignore */ } finally {
        if (!cancelled) setIsChecking(false);
      }
    }, 5000);

    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [invitation.inviteToken, isPending]);

  async function handleAccept() {
    setIsAccepting(true);
    setAcceptError(null);
    try {
      await ensurePrivateSpaceKeyPair(userId);
      const res = await fetch(`/api/spaces/invite/${invitation.inviteToken}/accept`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not accept invitation');
      toast.success('You joined the space');
      router.push(`/spaces/${payload.spaceId || invitation.space.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not accept invitation';
      setAcceptError(message);
      toast.error(message);
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Private Space Invite</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold text-slate-900">{invitation.space.name}</h1>
          {isReady && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Ready
            </Badge>
          )}
          {isPending && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              <AlertTriangle className="mr-1 h-3 w-3" /> Waiting for key
            </Badge>
          )}
          {isAccepted && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Accepted
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {personLabel(invitation.inviter)} invited you to join this private space.
        </p>

        {keypairWasMissing && isReady && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">New encryption keys generated</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  This device created fresh encryption keys. If you previously set up keys on another device, 
                  import them below or the inviter will need to re-complete the invite.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <KeypairManager userId={userId} />
            </div>
          </div>
        )}

        {isAccepted && (
          <div className="mt-6">
            <Link href={`/spaces/${invitation.space.id}`}>
              <Button className="w-full">
                Open Workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {isPending && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <RefreshCw className={`mt-0.5 h-4 w-4 shrink-0 ${isChecking ? 'animate-spin' : ''}`} />
                <div>
                  <p className="font-medium mb-1">Waiting for the inviter to complete your invite</p>
                  <p className="text-amber-700 text-xs">
                    The space key needs to be encrypted for your vault. 
                    Ask the inviter to open the space workspace — pending invites are repaired automatically.
                  </p>
                  <p className="text-amber-600 text-xs mt-2">
                    If the repair fails, the inviter can revoke and re-invite you from the space workspace.
                  </p>
                </div>
              </div>
            </div>
            <Link href="/spaces">
              <Button variant="outline" className="w-full">Go to Private Spaces</Button>
            </Link>
          </div>
        )}

        {isReady && (
          <div className="mt-6 space-y-4">
            {acceptError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                <div>
                  <p className="font-medium text-rose-700">Could not accept</p>
                  <p className="text-rose-600 text-xs mt-0.5">{acceptError}</p>
                  {acceptError.includes('freshly encrypted') && (
                    <p className="text-rose-500 text-xs mt-1">
                      Your encryption keys may have changed since the invite was created. 
                      Ask the inviter to click &quot;Complete Invite&quot; from the space workspace.
                    </p>
                  )}
                </div>
              </div>
            )}
            {isEnsuringKeypair ? (
              <Button className="w-full" disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing encryption keys...
              </Button>
            ) : !keypairReady ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <ShieldAlert className="h-4 w-4 mr-2 inline" />
                Could not set up encryption keys on this device. Try refreshing the page.
              </div>
            ) : (
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleAccept} disabled={isAccepting}>
                {isAccepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {isAccepting ? 'Accepting...' : 'Accept Invitation'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
