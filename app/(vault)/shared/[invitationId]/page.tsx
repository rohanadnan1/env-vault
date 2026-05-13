"use client";

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileText,
  Key,
  Package,
  FolderKanban,
  Container,
  FolderOpen,
  Download,
  Send,
  MessageSquare,
  RefreshCw,
  ArrowLeft,
  X,
  AlertTriangle,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { useVaultStore } from '@/lib/store/vaultStore';
import { decryptContent, reEncryptContent, unwrapShareKey } from '@/lib/crypto/collaborative-share';
import { cn } from '@/lib/utils';

interface ResourceData {
  type: string;
  resourceId: string;
  resourceName: string;
  inviteToken: string;
  bundleEncrypted?: string | null;
  bundleIv?: string | null;
  encryptedShareKey: string;
  shareKeyIv: string | null;
  shareEncryptionSalt: string;
  permission: string;
  status: string;
  expiresAt: string | null;
  owner: { id: string; username?: string | null; name: string | null; email: string };
  project?: { id: string; name: string; emoji: string; color: string } | null;
  secrets?: Array<{ keyName: string; valueEncrypted: string; iv: string }>;
  files?: Array<{ name: string; contentEncrypted: string; iv: string; mimeType: string }>;
}

interface InviteMeta {
  id: string;
  resourceType: string;
  resourceId: string;
  permission: string;
  status: string;
  expiresAt: string | null;
  owner: { id: string; username?: string | null; name: string | null; email: string };
  project?: { id: string; name: string; emoji: string; color: string } | null;
}

interface CommentData {
  id: string;
  content: string;
  iv: string | null;
  isEncrypted: boolean;
  author: { id: string; username?: string | null; name: string | null };
  createdAt: string;
}

function personLabel(person: { username?: string | null; name?: string | null; email?: string | null }) {
  return person.username ? `@${person.username}` : person.name || person.email || 'Unknown';
}

interface EditRequestHistory {
  id: string;
  title: string;
  description: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

type SharedBundleEntry =
  | { kind: 'SECRET'; resourceId?: string; name: string; plaintext: string }
  | { kind: 'FILE'; resourceId?: string; name: string; plaintext: string; mimeType: string };

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

function ttlLabel(expiresAt: string | null) {
  if (!expiresAt) return 'No expiry';
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  if (days === 1) return 'Expires in 1 day';
  return `Expires in ${days} days`;
}

export default function SharedResourcePage({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = use(params);
  const router = useRouter();
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const [resource, setResource] = useState<ResourceData | null>(null);
  const [inviteMeta, setInviteMeta] = useState<InviteMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shareKey, setShareKey] = useState<CryptoKey | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [decryptedEntries, setDecryptedEntries] = useState<SharedBundleEntry[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [revealedFiles, setRevealedFiles] = useState<Set<string>>(new Set());

  const [comments, setComments] = useState<CommentData[]>([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    resourceId: string;
    resourceType: 'SECRET' | 'FILE';
    name: string;
    value: string;
    note: string;
  } | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editRequestHistory, setEditRequestHistory] = useState<EditRequestHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<EditRequestHistory | null>(null);
  const [viewingProposed, setViewingProposed] = useState<string | null>(null);
  const [isDecryptingProposal, setIsDecryptingProposal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const canComment = inviteMeta?.permission === 'COMMENT' || inviteMeta?.permission === 'EDIT';
  const canEdit = inviteMeta?.permission === 'EDIT';
  const isActive = inviteMeta?.status === 'ACCEPTED';
  const decryptedSecrets = decryptedEntries.filter((entry): entry is Extract<SharedBundleEntry, { kind: 'SECRET' }> => entry.kind === 'SECRET');
  const decryptedFiles = decryptedEntries.filter((entry): entry is Extract<SharedBundleEntry, { kind: 'FILE' }> => entry.kind === 'FILE');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sharing/resource/${invitationId}`);
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 410) setError(json.error || 'Access has ended for this shared resource');
          else if (res.status === 409) setError(json.error || 'Accept the invitation before opening this resource');
          else if (res.status === 403) setError('You do not have access to this resource');
          else setError(json.error || 'Failed to load resource');
          setIsLoading(false);
          return;
        }
        setResource(json);
        setInviteMeta({
          id: invitationId,
          resourceType: json.type,
          resourceId: json.resourceId,
          permission: json.permission,
          status: json.status,
          expiresAt: json.expiresAt,
          owner: json.owner,
          project: json.project,
        });
        setIsLoading(false);
      } catch {
        setError('Failed to connect to server');
        setIsLoading(false);
      }
    }
    load();
  }, [invitationId]);

  const doDecrypt = useCallback(async () => {
    if (!resource) return;
    if (!passphrase.trim()) {
      setPassphraseError('Enter the passphrase shared with you to unlock this content.');
      return;
    }
    if (!resource.bundleEncrypted || !resource.bundleIv) {
      setPassphraseError('This shared resource is missing its encrypted bundle.');
      return;
    }

    setIsDecrypting(true);
    setPassphraseError(null);
    try {
      let nextShareKey: CryptoKey | null = null;

      if (resource.shareKeyIv) {
        try {
          nextShareKey = await unwrapShareKey(
            resource.encryptedShareKey,
            resource.shareKeyIv,
            passphrase,
            resource.shareEncryptionSalt
          );
        } catch {
          nextShareKey = null;
        }
      }

      if (!nextShareKey && resource.encryptedShareKey.length <= 48) {
        const rawBytes = Uint8Array.from(atob(resource.encryptedShareKey), (char) => char.charCodeAt(0));
        const importedRawKey = await crypto.subtle.importKey(
          'raw',
          rawBytes,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        await decryptContent(resource.bundleEncrypted, resource.bundleIv, importedRawKey);
        nextShareKey = importedRawKey;
      }

      if (!nextShareKey) {
        throw new Error('invalid_passphrase');
      }

      const bundleJson = await decryptContent(resource.bundleEncrypted, resource.bundleIv, nextShareKey);
      const parsed = JSON.parse(bundleJson) as Array<
        | { kind: 'SECRET'; resourceId?: string; name: string; plaintext: string }
        | { kind: 'FILE'; resourceId?: string; name: string; plaintext: string; mimeType?: string }
        | { keyName: string; plaintext: string }
      >;

      const normalized = parsed.map((entry) => {
        if ('kind' in entry) {
          if (entry.kind === 'FILE') {
            return {
              kind: 'FILE' as const,
              resourceId: entry.resourceId,
              name: entry.name,
              plaintext: entry.plaintext,
              mimeType: entry.mimeType || 'text/plain',
            };
          }
          return {
            kind: 'SECRET' as const,
            resourceId: entry.resourceId,
            name: entry.name,
            plaintext: entry.plaintext,
          };
        }

        if (resource.type === 'FILE') {
          return {
            kind: 'FILE' as const,
            resourceId: resource.resourceId,
            name: entry.keyName,
            plaintext: entry.plaintext,
            mimeType: resource.files?.[0]?.mimeType || 'text/plain',
          };
        }

        return {
          kind: 'SECRET' as const,
          resourceId: resource.resourceId,
          name: entry.keyName,
          plaintext: entry.plaintext,
        };
      });

      setShareKey(nextShareKey);
      setDecryptedEntries(normalized);
      touchActivity();
    } catch {
      setShareKey(null);
      setDecryptedEntries([]);
      setPassphraseError('Invalid passphrase. Please verify it with the sender and try again.');
      toast.error('Could not decrypt shared content');
    } finally {
      setIsDecrypting(false);
    }
  }, [passphrase, resource, touchActivity]);

  const fetchComments = useCallback(async () => {
    setIsLoadingComments(true);
    try {
      const res = await fetch(`/api/sharing/comment/${invitationId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setComments(data);
      }
    } catch { /* skip */ } finally {
      setIsLoadingComments(false);
    }
  }, [invitationId]);

  const fetchEditRequestHistory = useCallback(async () => {
    if (!canEdit) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/sharing/edit-request?invitationId=${invitationId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setEditRequestHistory(data);
      }
    } catch { /* skip */ } finally {
      setIsLoadingHistory(false);
    }
  }, [invitationId, canEdit]);

  useEffect(() => {
    if (shareKey && canEdit) fetchEditRequestHistory();
  }, [shareKey, canEdit, fetchEditRequestHistory]);

  const handleViewRequest = async (req: EditRequestHistory) => {
    setViewingRequest(req);
    setViewingProposed(null);
    setIsDecryptingProposal(true);
    try {
      const res = await fetch(`/api/sharing/edit-request/${req.id}`);
      if (!res.ok) throw new Error('Failed');
      const detail = await res.json();
      if (detail.proposedEncrypted && detail.proposedIv && shareKey) {
        const plaintext = await decryptContent(detail.proposedEncrypted, detail.proposedIv, shareKey);
        setViewingProposed(plaintext);
      } else {
        setViewingProposed(null);
      }
    } catch {
      setViewingProposed(null);
      toast.error('Could not decrypt proposal');
    } finally {
      setIsDecryptingProposal(false);
    }
  };

  useEffect(() => {
    if (isCommentsOpen) fetchComments();
  }, [isCommentsOpen, fetchComments]);

  const handleAddComment = async () => {
    if (!commentInput.trim()) return;
    setIsAddingComment(true);
    try {
      const res = await fetch('/api/sharing/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId, content: commentInput.trim(), isEncrypted: false }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setComments(prev => [...prev, { ...data, author: data.author || { id: '', name: 'You' } }]);
      setCommentInput('');
      toast.success('Comment added');
    } catch {
      toast.error('Could not add comment');
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleDownloadNotify = async (fileName: string, fileType: string) => {
    try {
      await fetch('/api/sharing/download-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId, fileName, fileType }),
      });
    } catch { /* silent */ }
  };

  const copyToClipboard = async (text: string, keyName: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(`${keyName} copied`);
    touchActivity();
  };

  const toggleReveal = (keyName: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName);
      else next.add(keyName);
      return next;
    });
    touchActivity();
  };

  const toggleFileReveal = (fileName: string) => {
    setRevealedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
    touchActivity();
  };

  const openEditDraft = (entry: SharedBundleEntry) => {
    if (!entry.resourceId) {
      toast.error('This shared item cannot be edited because it is missing its resource reference.');
      return;
    }
    setEditDraft({
      resourceId: entry.resourceId,
      resourceType: entry.kind,
      name: entry.name,
      value: entry.plaintext,
      note: '',
    });
  };

  const handleSubmitEditRequest = async () => {
    if (!editDraft || !shareKey) return;
    setIsSubmittingEdit(true);
    try {
      const { encrypted, iv } = await reEncryptContent(editDraft.value, shareKey);
      const res = await fetch('/api/sharing/edit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId,
          resourceType: editDraft.resourceType,
          resourceId: editDraft.resourceId,
          title: `Proposed update to ${editDraft.name}`,
          ...(editDraft.note.trim() ? { description: editDraft.note.trim() } : {}),
          proposedEncrypted: encrypted,
          proposedIv: iv,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to submit edit request');
      toast.success('Edit request submitted for owner review');
      setEditDraft(null);
      fetchEditRequestHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit edit request');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      const res = await fetch(`/api/sharing/manage/${invitationId}/leave`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed');
      }
      setInviteMeta((prev) => prev ? { ...prev, status: 'LEFT' } : prev);
      setShowLeaveConfirm(false);
      toast.success('You have left this shared resource');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setIsLeaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-6">{error || 'Resource not available'}</p>
          <Button variant="outline" onClick={() => router.push('/shared')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Shared Resources
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Top banner ─────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-2xl px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border',
        isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-100 border-slate-200'
      )}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="font-medium">Shared by {inviteMeta?.owner ? personLabel(inviteMeta.owner) : 'Unknown'}</span>
          </span>
          <span className="text-slate-300 hidden sm:inline">·</span>
          <Badge variant="outline" className={cn('text-xs', permissionBadgeClass(inviteMeta?.permission || 'READ_ONLY'))}>
            {permissionLabel(inviteMeta?.permission || 'READ_ONLY')}
          </Badge>
          <span className="text-slate-300 hidden sm:inline">·</span>
          <span className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {ttlLabel(inviteMeta?.expiresAt || null)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push('/shared')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back
          </Button>
          {shareKey ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShareKey(null);
                setPassphrase('');
                setPassphraseError(null);
                setDecryptedEntries([]);
                setRevealedKeys(new Set());
                setRevealedFiles(new Set());
              }}
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Lock
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={doDecrypt} disabled={isDecrypting}>
              {isDecrypting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
              Unlock
            </Button>
          )}
          {canComment && (
            <Button
              variant={isCommentsOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsCommentsOpen(v => !v)}
              className={isCommentsOpen ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            >
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Comments
              {comments.length > 0 && <span className="ml-1 text-[10px]">({comments.length})</span>}
            </Button>
          )}
          {isActive && (
            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setShowLeaveConfirm(true)}>
              <LogOut className="w-4 h-4 mr-1.5" />
              Leave
            </Button>
          )}
        </div>
      </div>

      {/* ── Decrypting overlay ──────────────────────────────────────── */}
      {isDecrypting && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Decrypting shared content...</p>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────── */}
      {!isDecrypting && !shareKey && (
        <Card className="rounded-2xl border-slate-200 shadow-sm max-w-xl">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Enter Shared Passphrase</h3>
                <p className="text-sm text-slate-500">
                  This content was re-encrypted for sharing. Enter the passphrase provided separately by the sender to unlock it.
                </p>
              </div>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void doDecrypt();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shared-passphrase">Passphrase</Label>
                <PasswordInput
                  id="shared-passphrase"
                  placeholder="Enter the shared passphrase"
                  value={passphrase}
                  onChange={(event) => {
                    setPassphrase(event.target.value);
                    if (passphraseError) setPassphraseError(null);
                  }}
                  className="h-11 rounded-xl border-slate-200"
                />
                {passphraseError && (
                  <p className="text-sm text-rose-600">{passphraseError}</p>
                )}
              </div>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                disabled={isDecrypting || !passphrase.trim()}
              >
                {isDecrypting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                Unlock Shared Content
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!isDecrypting && shareKey && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            {/* Resource title */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {resource.resourceName || resourceLabel(resource.type)}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
                  {resourceLabel(resource.type)}
                </Badge>
              </div>
            </div>

            {canEdit && editDraft && (
              <Card className="rounded-2xl border-amber-200 shadow-sm overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Edit {editDraft.name}</h3>
                      <p className="text-xs text-slate-500">Your changes will be sent to the owner for review before anything is merged.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditDraft(null)} disabled={isSubmittingEdit}>
                      <X className="w-4 h-4 mr-1.5" />
                      Close
                    </Button>
                  </div>
                  <Textarea
                    value={editDraft.value}
                    onChange={(event) => setEditDraft((prev) => prev ? { ...prev, value: event.target.value } : prev)}
                    rows={12}
                    className="font-mono text-sm rounded-xl border-slate-200"
                    disabled={isSubmittingEdit}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="edit-note">Review note</Label>
                    <Textarea
                      id="edit-note"
                      value={editDraft.note}
                      onChange={(event) => setEditDraft((prev) => prev ? { ...prev, note: event.target.value } : prev)}
                      rows={3}
                      placeholder="Summarize what changed for the owner"
                      className="rounded-xl border-slate-200"
                      disabled={isSubmittingEdit}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSubmitEditRequest} disabled={isSubmittingEdit} className="bg-amber-600 hover:bg-amber-700">
                      {isSubmittingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      Submit for Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SECRET */}
            {resource.type === 'SECRET' && (
              <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5">
                  {decryptedSecrets.map((secret) => {
                    const isRevealed = revealedKeys.has(secret.name);
                    return (
                      <div key={secret.name} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900">{secret.name}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-slate-400" onClick={() => toggleReveal(secret.name)}>
                              {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-slate-400"
                              onClick={() => copyToClipboard(secret.plaintext, secret.name)}
                            >
                              {copiedKey === secret.name ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </Button>
                            {canEdit && secret.resourceId && (
                              <Button variant="ghost" size="sm" className="h-8 text-xs text-amber-700" onClick={() => openEditDraft(secret)}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className={cn(
                          'font-mono text-sm rounded-lg p-3',
                          isRevealed
                            ? 'bg-slate-100 border border-slate-200 break-all'
                            : 'bg-slate-50 border border-dashed border-slate-200 text-slate-400'
                        )}>
                          {isRevealed ? secret.plaintext : '••••••••••••••••'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* FILE */}
            {resource.type === 'FILE' && (
              <div className="space-y-4">
                {decryptedFiles.map((file) => {
                  return (
                    <Card key={file.name} className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-500" />
                            <span className="font-mono text-sm font-bold text-slate-900">{file.name}</span>
                            <span className="text-[10px] text-slate-400">{file.mimeType}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-slate-400"
                              onClick={() => {
                                navigator.clipboard.writeText(file.plaintext);
                                toast.success('Content copied');
                              }}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-slate-400"
                              onClick={() => {
                                handleDownloadNotify(file.name, 'FILE');
                                const blob = new Blob([file.plaintext], { type: file.mimeType || 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url; a.download = file.name;
                                a.click();
                                URL.revokeObjectURL(url);
                                toast.success(`Downloaded ${file.name}`);
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            {canEdit && file.resourceId && (
                              <Button variant="ghost" size="sm" className="h-8 text-xs text-amber-700" onClick={() => openEditDraft(file)}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="p-5">
                          <pre className={cn(
                            'text-sm font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto',
                            'bg-slate-50 rounded-lg p-4 border border-slate-100'
                          )}>
                            {file.plaintext}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* PROJECT / ENVIRONMENT / FOLDER — show secrets and files lists */}
            {(resource.type === 'PROJECT' || resource.type === 'ENVIRONMENT' || resource.type === 'FOLDER' || resource.type === 'BUNDLE') && (
              <div className="space-y-6">
                {resource.secrets && resource.secrets.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Key className="w-4 h-4 text-indigo-600" />
                      Secrets ({decryptedSecrets.length})
                    </h3>
                    <div className="space-y-2">
                      {decryptedSecrets.map((secret) => {
                        const isRevealed = revealedKeys.has(secret.name);
                        return (
                          <Card key={secret.name} className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-900 text-sm">{secret.name}</span>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-slate-400" onClick={() => toggleReveal(secret.name)}>
                                  {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                                <Button
                                  variant="ghost" size="icon-sm" className="h-8 w-8 text-slate-400"
                                  onClick={() => copyToClipboard(secret.plaintext, secret.name)}
                                >
                                  {copiedKey === secret.name ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </Button>
                                {canEdit && secret.resourceId && (
                                  <Button variant="ghost" size="sm" className="h-8 text-xs text-amber-700" onClick={() => openEditDraft(secret)}>
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isRevealed && (
                              <div className="px-4 pb-4">
                                <div className="font-mono text-sm bg-slate-50 rounded-lg p-3 border border-slate-200 break-all">
                                  {secret.plaintext}
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {decryptedFiles.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      Files ({decryptedFiles.length})
                    </h3>
                    <div className="space-y-2">
                      {decryptedFiles.map((file) => {
                        const isRevealed = revealedFiles.has(file.name);
                        return (
                          <Card
                            key={file.name}
                            className={cn(
                              'rounded-2xl border-slate-200 shadow-sm overflow-hidden transition-colors',
                              'cursor-pointer hover:border-indigo-300 hover:shadow-md'
                            )}
                            onClick={() => toggleFileReveal(file.name)}
                          >
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="font-mono text-sm font-bold text-slate-900">{file.name}</span>
                                <span className="text-[10px] text-slate-400">{file.mimeType}</span>
                              </div>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost" size="icon-sm" className="h-8 w-8 text-slate-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(file.plaintext);
                                    toast.success(`Copied ${file.name}`);
                                  }}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon-sm" className="h-8 w-8 text-slate-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadNotify(file.name, 'FILE');
                                    const blob = new Blob([file.plaintext], { type: file.mimeType || 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url; a.download = file.name;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    toast.success(`Downloaded ${file.name}`);
                                  }}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                                {canEdit && file.resourceId && (
                                  <Button
                                    variant="ghost" size="sm" className="h-8 text-xs text-amber-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDraft(file);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                            {isRevealed && (
                              <div className="px-4 pb-4">
                                <pre
                                  className={cn(
                                    'text-sm font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto',
                                    'bg-slate-50 rounded-lg p-4 border border-slate-100'
                                  )}
                                >
                                  {file.plaintext}
                                </pre>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {decryptedEntries.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <FolderKanban className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm">No content available in this {resourceLabel(resource.type).toLowerCase()}.</p>
                  </div>
                )}
              </div>
            )}

            {canEdit && editRequestHistory.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-600" />
                  My Edit Requests ({editRequestHistory.length})
                </h3>
                <div className="space-y-2">
                  {editRequestHistory.map(er => (
                    <Card
                      key={er.id}
                      className="rounded-2xl border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                      onClick={() => handleViewRequest(er)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">{er.title}</h4>
                            {er.description && <p className="text-xs text-slate-500 mt-1">{er.description}</p>}
                          </div>
                          <Badge variant="outline" className={cn('text-xs shrink-0',
                            er.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            er.status === 'MERGED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            er.status === 'REJECTED' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                            er.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            'bg-slate-100 text-slate-500 border-slate-200'
                          )}>
                            {er.status === 'PENDING' ? 'Pending review' :
                             er.status === 'MERGED' ? 'Merged' :
                             er.status === 'REJECTED' ? 'Rejected' :
                             er.status === 'APPROVED' ? 'Approved' : er.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Submitted {new Date(er.createdAt).toLocaleDateString()}</span>
                          {er.reviewedAt && (
                            <span className="flex items-center gap-1">Reviewed {new Date(er.reviewedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                        {er.reviewNote && (
                          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Review Note from Owner</p>
                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{er.reviewNote}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {viewingRequest && (
                  <Dialog open={!!viewingRequest} onOpenChange={(open) => { if (!open) setViewingRequest(null); }}>
                    <DialogContent className="sm:max-w-[560px]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-indigo-600" />
                          {viewingRequest.title}
                        </DialogTitle>
                        <DialogDescription>
                          {viewingRequest.description || 'View your submitted changes'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('text-xs',
                            viewingRequest.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            viewingRequest.status === 'MERGED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            viewingRequest.status === 'REJECTED' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                            'bg-emerald-100 text-emerald-700 border-emerald-200'
                          )}>
                            {viewingRequest.status}
                          </Badge>
                          {viewingRequest.reviewNote && (
                            <span className="text-xs text-slate-500">— {viewingRequest.reviewNote}</span>
                          )}
                        </div>

                        <div>
                          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Proposed Changes</Label>
                          {isDecryptingProposal ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                            </div>
                          ) : viewingProposed ? (
                            <pre className="mt-1 text-xs font-mono text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-auto bg-slate-50 rounded-lg p-4 border border-slate-100">
                              {viewingProposed}
                            </pre>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-lg border border-slate-100">
                              No proposed content available
                            </p>
                          )}
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setViewingRequest(null)}>Close</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}

          </div>

          {/* ── Comments Panel ─────────────────────────────────────── */}
          {isCommentsOpen && (
            <div className="w-full lg:w-80 shrink-0">
              <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden sticky top-6">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                    Comments
                    {comments.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                    )}
                  </span>
                  <button onClick={() => setIsCommentsOpen(false)} className="p-1 rounded-md text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto px-3 py-3 space-y-2.5">
                  {isLoadingComments ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No comments yet</p>
                    </div>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                        <p className="text-xs text-slate-700 leading-relaxed">{c.content}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] font-medium text-slate-400">{c.author?.name || 'User'}</span>
                          <span className="text-[9px] text-slate-300">{new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {canComment && (
                  <div className="px-3 py-3 border-t border-slate-100">
                    <div className="flex gap-2">
                      <Textarea
                        value={commentInput}
                        onChange={e => setCommentInput(e.target.value)}
                        placeholder="Add a comment..."
                        rows={2}
                        className="text-xs resize-none rounded-xl border-slate-200"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                        disabled={isAddingComment}
                      />
                      <Button
                        size="icon-sm"
                        className="h-8 w-8 shrink-0 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                        onClick={handleAddComment}
                        disabled={!commentInput.trim() || isAddingComment}
                      >
                        {isAddingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <LogOut className="w-5 h-5" />
              Leave Shared Resource
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              You will lose access to this resource immediately. The sender will need to share it with you again if you want to regain access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-3 sm:justify-between">
            <Button variant="ghost" onClick={() => setShowLeaveConfirm(false)} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeave}
              disabled={isLeaving}
              className="flex-1 rounded-xl font-bold"
            >
              {isLeaving ? 'Leaving...' : 'Yes, Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
