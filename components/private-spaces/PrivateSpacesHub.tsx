"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatePrivateSpaceModal } from '@/components/private-spaces/CreatePrivateSpaceModal';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Boxes, ArrowRight, MailCheck, AlertTriangle, RefreshCw, Crown, FileText, Key, Sparkles, Globe, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensurePrivateSpaceKeyPair, readPrivateSpaceKeyPair } from '@/lib/crypto/private-space-client';
import { KeypairManager } from '@/components/private-spaces/KeypairManager';

const RECENT_PRIVATE_SPACES_STORAGE_KEY = 'envvault.recent-private-spaces';

type SpaceItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
    kingFiles: number;
    kingSecrets: number;
    invitations: number;
  };
};

type InvitationItem = {
  id: string;
  inviteToken: string;
  status: string;
  recipientEmail: string;
  hasEncryptedSpaceKey: boolean;
  createdAt: string;
  expiresAt: string | null;
  space: { id: string; name: string; createdAt: string };
  inviter: { id: string; email: string; name: string | null };
};

type Props = {
  userId: string;
  spaces: SpaceItem[];
  invitations: InvitationItem[];
};

export function PrivateSpacesHub({ userId, spaces, invitations }: Props) {
  const router = useRouter();
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [localSpaces, setLocalSpaces] = useState(spaces);
  const [localInvitations, setLocalInvitations] = useState(invitations);
  const [isRefreshingInvites, setIsRefreshingInvites] = useState(false);
  const [vaultKeyStatus, setVaultKeyStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [vaultKeyError, setVaultKeyError] = useState<string | null>(null);
  const [isRetryingKey, setIsRetryingKey] = useState(false);

  const pendingInvites = useMemo(
    () => localInvitations.filter((invitation) => invitation.status === 'PENDING'),
    [localInvitations]
  );

  async function refreshSpacesFromServer() {
    try {
      const res = await fetch('/api/spaces', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !Array.isArray(payload)) return;
      const nextSpaces = payload.map((space: {
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        _count?: SpaceItem['_count'];
      }) => ({
        id: space.id,
        name: space.name,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
        _count: space._count,
      })) satisfies SpaceItem[];

      setLocalSpaces((current) => {
        const currentOnly = current.filter((item) => !nextSpaces.some((next) => next.id === item.id));
        return [...nextSpaces, ...currentOnly];
      });

      try {
        window.localStorage.setItem(RECENT_PRIVATE_SPACES_STORAGE_KEY, JSON.stringify(nextSpaces));
      } catch {
        // ignore storage failures
      }
    } catch {
      // keep current optimistic state
    }
  }

  async function bootstrapVaultKey() {
    setVaultKeyStatus('loading');
    setVaultKeyError(null);
    try {
      const existing = readPrivateSpaceKeyPair(userId);
      if (existing) {
        const lookup = await fetch(`/api/users/vault-key?email=${encodeURIComponent('self')}`);
        const lookupData = await lookup.json();
        if (lookupData.hasVaultKey && lookupData.vaultPublicKey !== existing.publicKey) {
          await fetch('/api/account/vault-key', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vaultPublicKey: existing.publicKey,
              vaultPublicKeyAlgorithm: existing.algorithm,
            }),
          });
        }
        setVaultKeyStatus('ready');
        return;
      }

      const setup = await ensurePrivateSpaceKeyPair(userId);
      const res = await fetch('/api/account/vault-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultPublicKey: setup.publicKey,
          vaultPublicKeyAlgorithm: setup.algorithm,
        }),
      });
      if (!res.ok) throw new Error('Could not save encryption keys to server');
      setVaultKeyStatus('ready');
    } catch (error) {
      console.error('Failed to initialize vault key:', error);
      setVaultKeyStatus('error');
      setVaultKeyError(error instanceof Error ? error.message : 'Encryption setup failed');
    }
  }

  useEffect(() => {
    void bootstrapVaultKey();
  }, [userId]);

  useEffect(() => {
    setLocalSpaces(spaces);
  }, [spaces]);

  useEffect(() => {
    setLocalInvitations(invitations);
  }, [invitations]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_PRIVATE_SPACES_STORAGE_KEY);
      if (!raw) return;
      const recentSpaces = JSON.parse(raw) as SpaceItem[];
      if (!Array.isArray(recentSpaces) || recentSpaces.length === 0) return;
      setLocalSpaces((current) => {
        const seen = new Set(current.map((space) => space.id));
        const merged = [...recentSpaces.filter((space) => !seen.has(space.id)), ...current];
        return merged;
      });
    } catch {
      // ignore malformed client cache
    }
  }, []);

  useEffect(() => {
    void refreshSpacesFromServer();

    const handleFocus = () => {
      void refreshSpacesFromServer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSpacesFromServer();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const hasPendingKeyRepair = pendingInvites.some((invitation) => !invitation.hasEncryptedSpaceKey);
    if (!hasPendingKeyRepair) return;

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        setIsRefreshingInvites(true);
        const res = await fetch('/api/spaces/received', { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok || cancelled || !Array.isArray(payload)) return;
        setLocalInvitations((current) => {
          const previousPendingWithoutKey = new Set(
            current.filter((invitation) => invitation.status === 'PENDING' && !invitation.hasEncryptedSpaceKey).map((invitation) => invitation.id)
          );
          const nextInvitations = payload as InvitationItem[];
          const repaired = nextInvitations.some(
            (invitation) => previousPendingWithoutKey.has(invitation.id) && invitation.hasEncryptedSpaceKey
          );
          if (repaired) toast.success('A private space invitation is now ready to accept.');
          return nextInvitations;
        });
      } catch { /* ignore */ } finally {
        if (!cancelled) setIsRefreshingInvites(false);
      }
    }, 5000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [pendingInvites]);

  async function acceptInvite(token: string) {
    setPendingToken(token);
    try {
      const acceptedInvitation = localInvitations.find((invitation) => invitation.inviteToken === token) ?? null;
      const res = await fetch(`/api/spaces/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not accept invitation');
      if (acceptedInvitation) {
        const optimisticSpace: SpaceItem = {
          id: payload.spaceId,
          name: acceptedInvitation.space.name,
          createdAt: acceptedInvitation.space.createdAt,
          updatedAt: new Date().toISOString(),
          _count: {
            members: payload.memberCount ?? 1,
            kingFiles: payload.kingFileCount ?? 0,
            kingSecrets: payload.kingSecretCount ?? 0,
            invitations: 0,
          },
        };
        setLocalSpaces((current) => {
          const next = current.some((space) => space.id === optimisticSpace.id)
            ? current
            : [optimisticSpace, ...current];
          try {
            window.localStorage.setItem(RECENT_PRIVATE_SPACES_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore storage failures
          }
          return next;
        });
      }
      setLocalInvitations((current) => current.filter((invitation) => invitation.inviteToken !== token));
      toast.success('Invitation accepted');
      router.push(`/spaces/${payload.spaceId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept invitation');
    } finally {
      setPendingToken(null);
    }
  }

  const totalMembers = localSpaces.reduce((sum, s) => sum + (s._count?.members ?? 0), 0);
  const totalResources = localSpaces.reduce((sum, s) => sum + (s._count?.kingFiles ?? 0) + (s._count?.kingSecrets ?? 0), 0);

  return (
    <div className="space-y-8">
      {vaultKeyStatus === 'error' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-800">Encryption setup failed</p>
            <p className="text-xs text-rose-600 mt-1">{vaultKeyError || 'Could not initialize encryption keys on this device.'}</p>
            <p className="text-xs text-rose-500 mt-1">Private spaces require local encryption keys. Try refreshing the page or using a supported browser.</p>
            <Button variant="outline" size="sm" className="mt-3 border-rose-200 text-rose-700 hover:bg-rose-100"
              onClick={() => bootstrapVaultKey()} disabled={isRetryingKey}>
              {isRetryingKey ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
              Retry
            </Button>
          </div>
        </div>
      )}

      {vaultKeyStatus === 'loading' && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          Setting up encryption keys...
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 shadow-lg shadow-indigo-500/10"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-200">Command Center</p>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Private Spaces</h1>
          <p className="text-indigo-100 max-w-xl text-sm leading-relaxed">
            Work on your own fork of every file and secret. Pull changes from peers. Promote official resources when you choose.
          </p>
          <div className="flex items-center gap-6 mt-5">
            <div className="flex items-center gap-2 text-indigo-200">
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">{localSpaces.length} space{localSpaces.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-indigo-200">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">{totalMembers} member{totalMembers !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-indigo-200">
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">{totalResources} resource{totalResources !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <KeypairManager userId={userId} />
        </div>
        <div className="absolute top-6 right-6 z-20">
          <CreatePrivateSpaceModal
            userId={userId}
            disabled={vaultKeyStatus !== 'ready'}
            onCreated={(space) => {
              setLocalSpaces((current) => [
                space,
                ...current.filter((item) => item.id !== space.id),
              ]);
            }}
          />
        </div>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {pendingInvites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-emerald-200 bg-emerald-50/70 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <MailCheck className="h-5 w-5" />
                  Pending Invitations ({pendingInvites.length})
                  {isRefreshingInvites && <RefreshCw className="h-4 w-4 animate-spin text-emerald-700 ml-2" />}
                </CardTitle>
                <CardDescription className="text-emerald-800">
                  {pendingInvites.some(i => i.hasEncryptedSpaceKey)
                    ? 'Accept ready invites to create your local fork.'
                    : 'These invites need the inviter to complete your encryption setup first.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvites.map((invitation) => (
                  <motion.div
                    key={invitation.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-white/80 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{invitation.space.name}</p>
                        {!invitation.hasEncryptedSpaceKey && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                            Needs re-encryption
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        Invited by {invitation.inviter.name || invitation.inviter.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {invitation.hasEncryptedSpaceKey ? (
                        <Button
                          onClick={() => acceptInvite(invitation.inviteToken)}
                          disabled={pendingToken === invitation.inviteToken}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {pendingToken === invitation.inviteToken ? 'Accepting...' : 'Accept'}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                          Waiting for inviter to complete
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {localSpaces.map((space, i) => (
          <motion.div
            key={space.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={`/spaces/${space.id}`}>
              <Card className={cn(
                'h-full border-slate-200 transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5 group',
              )}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                        <Crown className="w-4 h-4 text-white" />
                      </div>
                      <span className="truncate text-lg">{space.name}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                  </CardTitle>
                  <CardDescription>
                    Updated {new Date(space.updatedAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {space._count?.members ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" />
                    {space._count?.kingSecrets ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {space._count?.kingFiles ?? 0}
                  </span>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {localSpaces.length === 0 && pendingInvites.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-dashed border-slate-300 bg-slate-50/60">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                  <Boxes className="h-7 w-7 text-indigo-500" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-800">No private spaces yet</p>
                  <p className="mt-1 text-sm text-slate-500 max-w-xs">
                    Create one to start a shared workspace with personal forks for every member.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
