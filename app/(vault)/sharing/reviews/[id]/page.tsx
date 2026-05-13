'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  FolderKanban,
  FolderOpen,
  Key,
  Loader2,
  Lock,
  MessageSquare,
  Package,
  ShieldAlert,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SharePermissionBadge } from '@/components/sharing/SharePermissionBadge';
import { decryptContent, unwrapShareKey } from '@/lib/crypto/collaborative-share';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EditRequestDetail {
  id: string;
  invitationId: string;
  resourceType: 'SECRET' | 'FILE' | string;
  resourceId: string;
  title: string;
  description: string | null;
  proposedEncrypted?: string;
  proposedIv?: string;
  previousVersionId: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  requester: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null };
  invitation: {
    id: string;
    permission: string;
    encryptedShareKey: string;
    shareKeyIv: string | null;
    shareEncryptionSalt: string;
  };
}

interface SecretResourcePayload {
  keyName: string;
  valueEncrypted: string;
  iv: string;
  environmentId: string;
}

interface FileResourcePayload {
  name: string;
  contentEncrypted: string;
  iv: string;
  environmentId: string;
  folderId: string | null;
}

interface CurrentResourceState {
  plaintext: string;
  aad?: string;
}

function resourceIcon(type: string) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (type) {
    case 'PROJECT': return <FolderKanban className={cls} />;
    case 'ENVIRONMENT': return <Package className={cls} />;
    case 'FOLDER': return <FolderOpen className={cls} />;
    case 'FILE': return <FileText className={cls} />;
    case 'BUNDLE': return <Package className={cls} />;
    case 'SECRET': return <Key className={cls} />;
    default: return <FileText className={cls} />;
  }
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

function statusConfig(status: string) {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending review', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock };
    case 'APPROVED':
      return { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 };
    case 'REJECTED':
      return { label: 'Rejected', className: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle };
    case 'MERGED':
      return { label: 'Merged', className: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: CheckCircle2 };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-500 border-slate-200', icon: FileCheck };
  }
}

async function decryptOwnerFilePayload(file: FileResourcePayload, derivedKey: CryptoKey): Promise<CurrentResourceState> {
  const aadCandidates = [
    file.folderId ? `${file.name}:${file.folderId}` : `${file.name}:${file.environmentId}`,
    `${file.name}:${file.environmentId}`,
    undefined,
  ];

  for (const aad of aadCandidates) {
    try {
      const plaintext = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, aad);
      return { plaintext, aad };
    } catch {
      continue;
    }
  }

  throw new Error('Failed to decrypt current file');
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<EditRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentResource, setCurrentResource] = useState<CurrentResourceState | null>(null);
  const [decryptedProposed, setDecryptedProposed] = useState<string | null>(null);
  const [isDecryptingCurrent, setIsDecryptingCurrent] = useState(false);
  const [isUnlockingProposal, setIsUnlockingProposal] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [sharePassphrase, setSharePassphrase] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'MERGE' | 'REJECT' | null>(null);

  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`/api/sharing/edit-request/${id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Edit request not found' : 'Failed to load');
        }
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        setReviewNote(payload.reviewNote || '');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchCurrentResource = useCallback(async () => {
    if (!data || !derivedKey) {
      setCurrentResource(null);
      return;
    }

    setIsDecryptingCurrent(true);
    try {
      if (data.resourceType === 'SECRET') {
        const res = await fetch(`/api/secrets/${data.resourceId}`);
        if (!res.ok) throw new Error('Failed to fetch current secret');
        const secret = await res.json() as SecretResourcePayload;
        const aad = `${secret.keyName}:${secret.environmentId}`;
        const plaintext = await decryptSecret(secret.valueEncrypted, secret.iv, derivedKey, aad);
        setCurrentResource({ plaintext, aad });
        return;
      }

      if (data.resourceType === 'FILE') {
        const res = await fetch(`/api/vault-files/${data.resourceId}`);
        if (!res.ok) throw new Error('Failed to fetch current file');
        const file = await res.json() as FileResourcePayload;
        const decrypted = await decryptOwnerFilePayload(file, derivedKey);
        setCurrentResource(decrypted);
        return;
      }

      setCurrentResource(null);
    } catch {
      setCurrentResource(null);
    } finally {
      setIsDecryptingCurrent(false);
    }
  }, [data, derivedKey]);

  useEffect(() => {
    fetchCurrentResource();
  }, [fetchCurrentResource]);

  const unlockProposal = useCallback(async () => {
    if (!data?.proposedEncrypted || !data?.proposedIv) return;
    if (!sharePassphrase.trim()) {
      setDecryptError('Enter the shared passphrase to inspect the proposed edit.');
      return;
    }

    setIsUnlockingProposal(true);
    setDecryptError(null);
    touchActivity();

    try {
      let proposalText: string | null = null;

      if (data.invitation.shareKeyIv) {
        const shareKey = await unwrapShareKey(
          data.invitation.encryptedShareKey,
          data.invitation.shareKeyIv,
          sharePassphrase.trim(),
          data.invitation.shareEncryptionSalt
        );
        proposalText = await decryptContent(data.proposedEncrypted, data.proposedIv, shareKey);
      } else if (data.invitation.encryptedShareKey.length <= 48) {
        const rawBytes = Uint8Array.from(atob(data.invitation.encryptedShareKey), (char) => char.charCodeAt(0));
        const importedRawKey = await crypto.subtle.importKey(
          'raw',
          rawBytes,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        proposalText = await decryptContent(data.proposedEncrypted, data.proposedIv, importedRawKey);
      }

      if (!proposalText) {
        throw new Error('invalid_passphrase');
      }

      setDecryptedProposed(proposalText);
      toast.success('Proposed changes unlocked');
    } catch {
      setDecryptedProposed(null);
      setDecryptError('Could not decrypt the proposal. Verify the shared passphrase and try again.');
    } finally {
      setIsUnlockingProposal(false);
    }
  }, [data, sharePassphrase, touchActivity]);

  const handleMerge = async () => {
    if (!id || !data || !derivedKey || !currentResource || decryptedProposed == null) return;

    setIsMerging(true);
    try {
      const merged = await encryptSecret(decryptedProposed, derivedKey, currentResource.aad);
      const res = await fetch(`/api/sharing/edit-request/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MERGE',
          reviewNote: reviewNote.trim() || undefined,
          mergedEncrypted: merged.valueEncrypted,
          mergedIv: merged.iv,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to merge edit request');

      setData((prev) => prev ? {
        ...prev,
        status: payload.status,
        reviewNote: payload.reviewNote,
        reviewedAt: payload.reviewedAt,
      } : null);
      setCurrentResource((prev) => prev ? { ...prev, plaintext: decryptedProposed } : prev);
      setConfirmAction(null);
      toast.success('Changes merged into the original resource');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not merge edit request');
    } finally {
      setIsMerging(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`/api/sharing/edit-request/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', reviewNote: reviewNote.trim() || undefined }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to reject edit request');

      setData((prev) => prev ? {
        ...prev,
        status: payload.status,
        reviewNote: payload.reviewNote,
        reviewedAt: payload.reviewedAt,
      } : null);
      setConfirmAction(null);
      toast.success('Edit request rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject edit request');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-500">Loading edit request...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <Button variant="ghost" onClick={() => router.push('/sharing/reviews')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Reviews
        </Button>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-amber-800 font-medium">{error || 'Edit request not found'}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-amber-700 hover:bg-amber-100"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const status = statusConfig(data.status);
  const StatusIcon = status.icon;
  const isPending = data.status === 'PENDING';
  const mergeReady = Boolean(derivedKey && currentResource && decryptedProposed != null);
  const unsupportedResource = data.resourceType !== 'SECRET' && data.resourceType !== 'FILE';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sharing/reviews')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      {!isPending && (
        <div
          className={cn(
            'rounded-xl border p-4 flex items-center gap-3',
            data.status === 'APPROVED' || data.status === 'MERGED'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-rose-50 border-rose-200'
          )}
        >
          <StatusIcon
            className={cn(
              'w-5 h-5 shrink-0',
              data.status === 'APPROVED' || data.status === 'MERGED' ? 'text-emerald-600' : 'text-rose-600'
            )}
          />
          <div>
            <p
              className={cn(
                'text-sm font-semibold',
                data.status === 'APPROVED' || data.status === 'MERGED' ? 'text-emerald-800' : 'text-rose-800'
              )}
            >
              {status.label}
            </p>
            {data.reviewNote && <p className="text-xs text-slate-600 mt-0.5">{data.reviewNote}</p>}
            {data.reviewedAt && (
              <p className="text-xs text-slate-500 mt-0.5">
                Reviewed {new Date(data.reviewedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
              {resourceIcon(data.resourceType)}
              {resourceLabel(data.resourceType)}
            </Badge>
            <Badge variant="outline" className={cn('text-xs', status.className)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {status.label}
            </Badge>
            <SharePermissionBadge permission="EDIT" />
          </div>

          <h2 className="text-xl font-bold text-slate-900">{data.title}</h2>
          {data.description && <p className="text-sm text-slate-500 leading-relaxed">{data.description}</p>}

          <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-50">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Requested by {data.requester.name || data.requester.email}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(data.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </Card>

      {unsupportedResource && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Only shared files and secrets can be reviewed and merged right now.
        </div>
      )}

      {!unsupportedResource && (
        <>
          <Card className="border-slate-200 shadow-sm rounded-2xl">
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-700">Unlock Proposed Changes</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="share-passphrase">Shared passphrase</Label>
                  <PasswordInput
                    id="share-passphrase"
                    value={sharePassphrase}
                    onChange={(e) => setSharePassphrase(e.target.value)}
                    placeholder="Enter the passphrase used for this share"
                    autoComplete="off"
                  />
                </div>
                <Button onClick={unlockProposal} disabled={isUnlockingProposal || !isPending}>
                  {isUnlockingProposal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                  Unlock Proposal
                </Button>
              </div>

              {decryptError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {decryptError}
                </div>
              )}

              {!derivedKey && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Unlock your vault with your master key first so the current owner version can be decrypted and merged safely.
                </div>
              )}
            </div>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-indigo-600" />
                Content Review
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current</span>
                </div>
                <div className="p-4">
                  {isDecryptingCurrent ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    </div>
                  ) : currentResource ? (
                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all leading-relaxed">
                      {currentResource.plaintext}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Lock className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">Unlock vault to view the owner version</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 overflow-hidden bg-indigo-50/20 shadow-sm">
                <div className="px-4 py-2.5 border-b border-indigo-100 bg-indigo-50/60 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Proposed</span>
                </div>
                <div className="p-4">
                  {isUnlockingProposal ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    </div>
                  ) : decryptedProposed != null ? (
                    <pre className="text-xs font-mono text-indigo-900 whitespace-pre-wrap break-all leading-relaxed">
                      {decryptedProposed}
                    </pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ShieldAlert className="w-8 h-8 text-indigo-300 mb-2" />
                      <p className="text-xs text-indigo-400">Unlock the shared proposal with its passphrase</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {isPending && !unsupportedResource && (
        <Card className="border-slate-200 shadow-sm rounded-2xl">
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              Review
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="review-note" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Review note (optional)
              </Label>
              <Textarea
                id="review-note"
                placeholder="Add a note for the collaborator..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
                className="resize-none rounded-xl"
              />
            </div>

            {!mergeReady && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Unlock both the owner version and the shared proposal before merging this edit.
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex-1"
                onClick={() => setConfirmAction('MERGE')}
                disabled={!mergeReady}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve & Merge
              </Button>
              <Button
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50 flex-1"
                onClick={() => setConfirmAction('REJECT')}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle
              className={cn(
                'flex items-center gap-2 font-bold',
                confirmAction === 'MERGE' ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {confirmAction === 'MERGE' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {confirmAction === 'MERGE' ? 'Approve and Merge Changes' : 'Reject Edit Request'}
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              {confirmAction === 'MERGE'
                ? 'This will create a new version in your vault using the proposed content.'
                : 'This will reject the proposal and keep your current content unchanged.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button
              variant={confirmAction === 'MERGE' ? 'default' : 'destructive'}
              onClick={confirmAction === 'MERGE' ? handleMerge : handleReject}
              disabled={isMerging || isRejecting}
              className={cn(
                'flex-1 rounded-xl font-bold',
                confirmAction === 'MERGE' && 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200'
              )}
            >
              {confirmAction === 'MERGE'
                ? (isMerging ? 'Merging...' : 'Merge Changes')
                : (isRejecting ? 'Rejecting...' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
