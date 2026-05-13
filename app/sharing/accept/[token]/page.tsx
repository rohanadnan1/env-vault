"use client";

import { useState, useEffect, use } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ArrowLeft,
  UserPlus,
  LogIn,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { unwrapShareKey, decryptContent } from '@/lib/crypto/collaborative-share';
import Link from 'next/link';

interface InviteData {
  id: string;
  token: string;
  resourceType: string;
  resourceId: string;
  permission: string;
  versionMode: string;
  recipientEmail: string;
  accountExists: boolean;
  recipientId: string | null;
  status: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  note: string | null;
  createdAt: string;
  owner: { id: string; username?: string | null; name: string | null };
  shareEncryptionSalt: string;
  encryptedShareKey: string;
  shareKeyIv: string | null;
  bundleEncrypted: string | null;
  bundleIv: string | null;
}

function personLabel(person: { username?: string | null; name?: string | null }) {
  return person.username ? `@${person.username}` : person.name || 'Someone';
}

function resourceLabel(type: string) {
  switch (type) {
    case 'PROJECT': return 'Project';
    case 'ENVIRONMENT': return 'Environment';
    case 'FOLDER': return 'Folder';
    case 'FILE': return 'File';
    case 'BUNDLE': return 'Bundle';
    case 'SECRET': return 'Secret';
    default: return type;
  }
}

function permissionLabel(permission: string) {
  switch (permission) {
    case 'READ_ONLY': return 'Read only';
    case 'COMMENT': return 'Comment';
    case 'EDIT': return 'Edit';
    default: return permission;
  }
}

function permissionBadgeClass(permission: string) {
  switch (permission) {
    case 'READ_ONLY': return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'COMMENT': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'EDIT': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export default function SharingAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [error, setError] = useState<{ message: string; status?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/sharing/invite/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setError({ message: json.error || 'Invitation unavailable', status: json.status });
        } else {
          setInviteData(json);
        }
      } catch {
        setError({ message: 'Failed to connect to server' });
      } finally {
        setIsLoading(false);
      }
    }
    fetchInvite();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData || !passphrase) return;

    setIsAccepting(true);
    setAcceptError(null);

    try {
      const shareKey = await unwrapShareKey(
        inviteData.encryptedShareKey,
        inviteData.shareKeyIv || '',
        passphrase,
        inviteData.shareEncryptionSalt
      );

      if (inviteData.bundleEncrypted && inviteData.bundleIv) {
        try {
          await decryptContent(inviteData.bundleEncrypted, inviteData.bundleIv, shareKey);
        } catch {
          setAcceptError('Passphrase validation failed. Please verify and try again.');
          setIsAccepting(false);
          return;
        }
      }

      const res = await fetch(`/api/sharing/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.error) setAcceptError(json.error);
        else setAcceptError('Could not accept invitation');
        setIsAccepting(false);
        return;
      }

      toast.success('Invitation accepted');
      router.push(`/shared/${json.invitationId || inviteData.id}`);
    } catch {
      setAcceptError('Invalid passphrase. Please try again.');
      setIsAccepting(false);
    }
  };

  const userEmail = session?.user?.email?.toLowerCase();
  const inviteEmail = inviteData?.recipientEmail?.toLowerCase();
  const isCorrectEmail = userEmail && inviteEmail && userEmail === inviteEmail;
  const isAccepted = inviteData?.status === 'ACCEPTED';

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error || !inviteData) {
    const isExpired = error?.status === 'EXPIRED';
    const isRevoked = error?.status === 'REVOKED';
    const isLeft = error?.status === 'LEFT';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-none shadow-xl text-center p-8 rounded-3xl">
          <div className="h-2 w-full bg-rose-500 absolute top-0 left-0 rounded-t-3xl" />
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6 mt-2">
            {isExpired ? <Clock className="w-10 h-10 text-rose-500" /> : isRevoked || isLeft ? <ShieldAlert className="w-10 h-10 text-rose-500" /> : <ShieldAlert className="w-10 h-10 text-rose-500" />}
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 mb-2">
            {isExpired ? 'Link Expired' : isRevoked ? 'Access Revoked' : isLeft ? 'Share Ended' : 'Invitation Unavailable'}
          </CardTitle>
          <CardDescription className="text-slate-500 mb-8">{error?.message}</CardDescription>
          <Link href="/">
            <Button className="w-full bg-slate-900 hover:bg-slate-800 rounded-xl">Go to EnVault</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // ── Main Accept UI ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">E</div>
          <span className="text-2xl font-black tracking-tighter text-slate-900">ENVAULT</span>
        </div>
        <p className="text-slate-400 text-sm font-medium tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> COLLABORATIVE SHARING
        </p>
      </div>

      <Card className="max-w-[480px] w-full border-none shadow-2xl overflow-hidden rounded-3xl">
        <div className="h-2 w-full bg-indigo-600" />

        <CardHeader className="pt-8 text-center pb-2">
          <CardTitle className="text-2xl font-bold text-slate-900">
            {isAccepted ? 'Already Accepted' : 'Shared Resource'}
          </CardTitle>
          <CardDescription>
            {personLabel(inviteData.owner)} shared a {resourceLabel(inviteData.resourceType).toLowerCase()} with you
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 px-8">
          {/* Summary badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <Badge variant="outline" className="text-xs bg-slate-100 border-slate-200 text-slate-700">
              {resourceLabel(inviteData.resourceType)}
            </Badge>
            <Badge variant="outline" className={`text-xs ${permissionBadgeClass(inviteData.permission)}`}>
              {permissionLabel(inviteData.permission)}
            </Badge>
            {inviteData.expiresAt && (
              <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700">
                <Clock className="w-3 h-3 mr-1" />
                Expires {new Date(inviteData.expiresAt).toLocaleDateString()}
              </Badge>
            )}
            {!inviteData.expiresAt && (
              <Badge variant="outline" className="text-xs bg-slate-100 border-slate-200 text-slate-600">
                No expiry
              </Badge>
            )}
          </div>

          {inviteData.note && (
            <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm text-slate-700 italic">
              &ldquo;{inviteData.note}&rdquo;
            </div>
          )}

          {/* ── Logged out ────────────────────────────────────── */}
          {sessionStatus === 'unauthenticated' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 text-center mb-2">
                {inviteData.accountExists ? (
                  <>
                    Sign in with <strong className="text-slate-900">{inviteData.recipientEmail}</strong> to accept this invitation.
                  </>
                ) : (
                  <>
                    Create an account with <strong className="text-slate-900">{inviteData.recipientEmail}</strong> to accept this invitation.
                  </>
                )}
              </p>
              {inviteData.accountExists ? (
                <Button
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 rounded-xl font-bold"
                  onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign in to Continue
                </Button>
              ) : (
                <Button
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 rounded-xl font-bold"
                  onClick={() => router.push(`/register?email=${encodeURIComponent(inviteData.recipientEmail)}&callbackUrl=${encodeURIComponent(window.location.href)}`)}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create Account to Continue
                </Button>
              )}
            </div>
          )}

          {/* ── Logged in, wrong account ────────────────────────── */}
          {sessionStatus === 'authenticated' && !isCorrectEmail && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-center">
                <UserX className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-rose-800 mb-1">Wrong Account</p>
                <p className="text-xs text-rose-600">
                  You are signed in as <strong>{session?.user?.email}</strong>.
                  <br />
                  This invitation is for <strong>{inviteData.recipientEmail}</strong>.
                </p>
              </div>
              <Button
                variant="ghost"
                className="w-full text-slate-500 border border-slate-200 rounded-xl"
                onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Switch Account
              </Button>
            </div>
          )}

          {/* ── Logged in, correct account, already accepted ─────── */}
          {sessionStatus === 'authenticated' && isCorrectEmail && isAccepted && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-emerald-800">Invitation Accepted</p>
                <p className="text-xs text-emerald-600 mt-1">This invitation has already been accepted.</p>
              </div>
              <Button
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 rounded-xl font-bold"
                onClick={() => router.push(`/shared/${inviteData.id}`)}
              >
                <Unlock className="w-4 h-4 mr-2" />
                View Shared Resource
              </Button>
            </div>
          )}

          {/* ── Logged in, correct account, not yet accepted ──────── */}
          {sessionStatus === 'authenticated' && isCorrectEmail && !isAccepted && (
            <form onSubmit={handleAccept} className="space-y-4">
              {acceptError && (
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {acceptError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="passphrase">Enter Passphrase</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <PasswordInput
                    id="passphrase"
                    placeholder="Provided by sender..."
                    className="pl-10 h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all rounded-xl"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 group rounded-xl"
                disabled={isAccepting || !passphrase}
              >
                {isAccepting ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                ) : (
                  <Unlock className="w-5 h-5 mr-2 transition-transform group-hover:scale-110" />
                )}
                {isAccepting ? 'Accepting...' : 'Accept & Unlock'}
              </Button>

              <p className="text-[10px] text-slate-400 text-center mt-2">
                The passphrase is provided separately by the owner for security.
              </p>
            </form>
          )}
        </CardContent>

        <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-center py-4">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Created {new Date(inviteData.createdAt).toLocaleDateString()}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
