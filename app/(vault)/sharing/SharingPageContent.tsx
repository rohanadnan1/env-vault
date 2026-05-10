"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Inbox,
  FileCheck,
  Activity,
  Clock,
  ShieldAlert,
  XCircle,
  RotateCcw,
  CheckCircle2,
  Eye,
  FileText,
  Key,
  Package,
  FolderKanban,
  Container,
  FolderOpen,
  Users,
  UserPlus,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InvitationData {
  id: string;
  ownerId: string;
  recipientEmail: string;
  recipientId: string | null;
  resourceType: string;
  resourceId: string;
  projectId: string | null;
  permission: string;
  versionMode: string;
  expiresAt: string | null;
  ttlDays: number | null;
  inviteToken: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  firstAccessedAt: string | null;
  recipient?: { id: string; name: string | null; email: string } | null;
  owner?: { id: string; name: string | null; email: string } | null;
  project?: { id: string; name: string; emoji: string; color: string } | null;
  _count?: { accessLogs: number; comments: number; editRequests?: number; downloadLogs?: number };
}

interface ActiveLinksData {
  totalActive: number;
  expiringSoon: number;
  totalRecipients: number;
  pendingCount: number;
  recentActivity: Array<{
    id: string;
    action: string;
    resourceDetail: string | null;
    accessedAt: string;
    user: { name: string | null; email: string } | null;
    resourceType: string;
  }>;
}

interface EditRequestData {
  id: string;
  invitationId: string;
  resourceType: string;
  resourceId: string;
  title: string;
  description: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null };
}

function resourceIcon(type: string) {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'PROJECT': return <FolderKanban className={cls} />;
    case 'ENVIRONMENT': return <Container className={cls} />;
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

function permissionBadge(permission: string) {
  switch (permission) {
    case 'READ_ONLY': return { label: 'Read only', variant: 'outline' as const, className: 'text-slate-600 border-slate-200' };
    case 'COMMENT': return { label: 'Comment', variant: 'outline' as const, className: 'text-blue-600 border-blue-200 bg-blue-50' };
    case 'EDIT': return { label: 'Edit', variant: 'outline' as const, className: 'text-amber-600 border-amber-200 bg-amber-50' };
    default: return { label: permission, variant: 'outline' as const, className: 'text-slate-600 border-slate-200' };
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'ACCEPTED': return { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'PENDING': return { label: 'Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'REVOKED': return { label: 'Revoked', className: 'bg-rose-100 text-rose-700 border-rose-200' };
    case 'EXPIRED': return { label: 'Expired', className: 'bg-slate-100 text-slate-500 border-slate-200' };
    default: return { label: status, className: 'bg-slate-100 text-slate-500 border-slate-200' };
  }
}

function ttlInfo(expiresAt: string | null): { text: string; urgent: boolean } {
  if (!expiresAt) return { text: 'No expiry', urgent: false };
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { text: 'Expired', urgent: true };
  const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  if (days <= 3) return { text: `Expires in ${days}d`, urgent: true };
  if (days <= 30) return { text: `Expires in ${days}d`, urgent: false };
  return { text: `Expires in ${days}d`, urgent: false };
}

function reviewStatusBadge(status: string) {
  switch (status) {
    case 'PENDING': return { label: 'Pending review', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'APPROVED': return { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'REJECTED': return { label: 'Rejected', className: 'bg-rose-100 text-rose-700 border-rose-200' };
    case 'MERGED': return { label: 'Merged', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    default: return { label: status, className: 'bg-slate-100 text-slate-500 border-slate-200' };
  }
}

function activityIcon(action: string) {
  const cls = 'w-4 h-4';
  switch (action) {
    case 'VIEW': return <Eye className={cls} />;
    case 'DOWNLOAD': return <Package className={cls} />;
    case 'EDIT_REQUEST': return <FileCheck className={cls} />;
    case 'DECRYPT': return <ShieldAlert className={cls} />;
    case 'COPY': return <FileText className={cls} />;
    case 'EXPORT': return <Package className={cls} />;
    default: return <Activity className={cls} />;
  }
}

function activityLabel(action: string) {
  switch (action) {
    case 'VIEW': return 'viewed';
    case 'DOWNLOAD': return 'downloaded';
    case 'EDIT_REQUEST': return 'submitted an edit request for';
    case 'DECRYPT': return 'decrypted';
    case 'COPY': return 'copied';
    case 'EXPORT': return 'exported';
    default: return action.toLowerCase();
  }
}

export function SharingPageContent({ userId, userName, defaultTab }: { userId: string; userName: string | null | undefined; defaultTab: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [sent, setSent] = useState<InvitationData[]>([]);
  const [received, setReceived] = useState<InvitationData[]>([]);
  const [activeLinks, setActiveLinks] = useState<ActiveLinksData | null>(null);
  const [editRequests, setEditRequests] = useState<EditRequestData[]>([]);

  const [sentLoading, setSentLoading] = useState(true);
  const [receivedLoading, setReceivedLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revokeDialogId, setRevokeDialogId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const [reviewDialog, setReviewDialog] = useState<{ id: string; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [isReviewAction, setIsReviewAction] = useState(false);
  const [permissionDialogId, setPermissionDialogId] = useState<string | null>(null);
  const [ttlDialogId, setTtlDialogId] = useState<string | null>(null);
  const [nextPermission, setNextPermission] = useState<'READ_ONLY' | 'COMMENT' | 'EDIT'>('READ_ONLY');
  const [ttlDaysInput, setTtlDaysInput] = useState('7');
  const [noExpiry, setNoExpiry] = useState(false);
  const [isSavingManage, setIsSavingManage] = useState(false);

  const fetchSent = useCallback(async () => {
    setSentLoading(true);
    try {
      const res = await fetch('/api/sharing/sent');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (Array.isArray(data)) setSent(data);
    } catch {
      setError('Could not load sent invitations');
    } finally {
      setSentLoading(false);
    }
  }, []);

  const fetchReceived = useCallback(async () => {
    setReceivedLoading(true);
    try {
      const res = await fetch('/api/sharing/received');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (Array.isArray(data)) setReceived(data);
    } catch {
      setError('Could not load received invitations');
    } finally {
      setReceivedLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch('/api/sharing/active-links');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setActiveLinks(data);
    } catch {
      setError('Could not load activity');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const res = await fetch('/api/sharing/edit-request');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEditRequests(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load reviews');
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const refreshActiveTabSilently = useCallback(async () => {
    try {
      if (activeTab === 'sent') {
        const res = await fetch('/api/sharing/sent');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setSent(data);
        }
        return;
      }

      if (activeTab === 'received') {
        const res = await fetch('/api/sharing/received');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setReceived(data);
        }
        return;
      }

      if (activeTab === 'reviews') {
        const res = await fetch('/api/sharing/edit-request');
        if (res.ok) {
          const data = await res.json();
          setEditRequests(Array.isArray(data) ? data : []);
        }
        return;
      }

      const res = await fetch('/api/sharing/active-links');
      if (res.ok) {
        const data = await res.json();
        setActiveLinks(data);
      }
    } catch {
      // Silent background refresh keeps the current view fresh without interrupting the user.
    }
  }, [activeTab]);

  useEffect(() => {
    setError(null);
    if (activeTab === 'sent') fetchSent();
    else if (activeTab === 'received') fetchReceived();
    else if (activeTab === 'reviews') fetchReviews();
    else if (activeTab === 'activity') fetchActivity();
  }, [activeTab, fetchSent, fetchReceived, fetchReviews, fetchActivity]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshActiveTabSilently();
    }, 10000);

    const handleFocus = () => {
      void refreshActiveTabSilently();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refreshActiveTabSilently]);

  const handleRevoke = async () => {
    if (!revokeDialogId) return;
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/sharing/manage/${revokeDialogId}/revoke`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to revoke');
      toast.success('Access revoked');
      setSent(prev => prev.map(inv => inv.id === revokeDialogId ? { ...inv, status: 'REVOKED', revokedAt: new Date().toISOString() } : inv));
      setRevokeDialogId(null);
    } catch {
      toast.error('Could not revoke invitation');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleReviewAction = async () => {
    if (!reviewDialog) return;
    setIsReviewAction(true);
    const action = 'REJECT';
    try {
      const res = await fetch(`/api/sharing/edit-request/${reviewDialog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Edit request rejected');
      setEditRequests(prev => prev.map(er => er.id === reviewDialog.id ? { ...er, status: 'REJECTED' } : er));
      setReviewDialog(null);
    } catch {
      toast.error('Could not update review');
    } finally {
      setIsReviewAction(false);
    }
  };

  const openPermissionDialog = (inv: InvitationData) => {
    setPermissionDialogId(inv.id);
    setNextPermission((inv.permission as 'READ_ONLY' | 'COMMENT' | 'EDIT') || 'READ_ONLY');
  };

  const openTtlDialog = (inv: InvitationData) => {
    setTtlDialogId(inv.id);
    setNoExpiry(!inv.expiresAt);
    setTtlDaysInput(inv.ttlDays ? String(inv.ttlDays) : '7');
  };

  const handleSavePermission = async () => {
    if (!permissionDialogId) return;
    setIsSavingManage(true);
    try {
      const res = await fetch(`/api/sharing/manage/${permissionDialogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: nextPermission }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setSent((prev) => prev.map((inv) => inv.id === permissionDialogId ? { ...inv, permission: updated.permission, updatedAt: updated.updatedAt } : inv));
      toast.success('Permission updated');
      setPermissionDialogId(null);
    } catch {
      toast.error('Could not update permission');
    } finally {
      setIsSavingManage(false);
    }
  };

  const handleSaveTtl = async () => {
    if (!ttlDialogId) return;
    setIsSavingManage(true);
    try {
      const ttlDays = noExpiry ? null : Math.max(1, Number(ttlDaysInput) || 1);
      const expiresAt = noExpiry ? null : new Date(Date.now() + (ttlDays as number) * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/sharing/manage/${ttlDialogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlDays, expiresAt }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setSent((prev) => prev.map((inv) => inv.id === ttlDialogId ? { ...inv, ttlDays: updated.ttlDays, expiresAt: updated.expiresAt, updatedAt: updated.updatedAt } : inv));
      toast.success('Expiry updated');
      setTtlDialogId(null);
    } catch {
      toast.error('Could not update expiry');
    } finally {
      setIsSavingManage(false);
    }
  };

  const sentCount = sent.length;
  const receivedCount = received.length;
  const editRequestCount = editRequests.filter(er => er.status === 'PENDING').length;
  const activityCount = activeLinks?.recentActivity?.length || 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Users className="w-8 h-8 text-indigo-600" />
          Sharing
        </h1>
        <p className="text-slate-500 mt-1">Manage collaborative access, reviews, and sharing activity.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {error}
          <Button variant="ghost" size="xs" className="ml-auto text-amber-700 hover:bg-amber-100" onClick={() => { setError(null); if (activeTab === 'sent') fetchSent(); else if (activeTab === 'received') fetchReceived(); else if (activeTab === 'reviews') fetchReviews(); else fetchActivity(); }}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { if (typeof v === 'string') setActiveTab(v); }}>
        <TabsList>
          <TabsTrigger value="sent">
            <Send className="w-4 h-4" />
            Sent
            {sentCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{sentCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="received">
            <Inbox className="w-4 h-4" />
            Received
            {receivedCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{receivedCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <FileCheck className="w-4 h-4" />
            Reviews
            {editRequestCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{editRequestCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="w-4 h-4" />
            Activity
            {activityCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activityCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Sent Tab ──────────────────────────────────────────────── */}
        <TabsContent value="sent">
          {sentLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : sent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                <Send className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800">No sent invitations</h2>
              <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs">
                Share resources with collaborators to see them here.
              </p>
            </div>
          ) : (
              <div className="space-y-4">
              {sent.map(inv => {
                const status = statusBadge(inv.status);
                const perm = permissionBadge(inv.permission);
                const ttl = ttlInfo(inv.expiresAt);
                return (
                  <Card
                    key={inv.id}
                    className="overflow-hidden border-slate-200 shadow-sm rounded-2xl cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                    onClick={() => router.push(`/sharing/sent/${inv.id}`)}
                  >
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className={cn('text-xs shrink-0', status.className)}>{status.label}</Badge>
                            {inv.project && (
                              <span className="text-xs text-slate-500 truncate">
                                {inv.project.emoji} {inv.project.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
                              {resourceIcon(inv.resourceType)}
                              {resourceLabel(inv.resourceType)}
                            </Badge>
                            <Badge variant="outline" className={cn('text-xs', perm.className)}>{perm.label}</Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                          <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-medium truncate">{inv.recipientEmail}</span>
                          {inv.recipient?.name && (
                            <span className="text-slate-400">({inv.recipient.name})</span>
                          )}
                        </div>

                        {inv.note && (
                          <p className="text-sm text-slate-500 italic line-clamp-1 mb-3">&ldquo;{inv.note}&rdquo;</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-50">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Created {new Date(inv.createdAt).toLocaleDateString()}
                          </span>
                          <span className={cn('flex items-center gap-1.5', ttl.urgent ? 'text-amber-600 font-medium' : '')}>
                            <Clock className="w-3.5 h-3.5" />
                            {ttl.text}
                          </span>
                          {inv.firstAccessedAt && (
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5" />
                              Accessed {new Date(inv.firstAccessedAt).toLocaleDateString()}
                            </span>
                          )}
                          {inv._count && (
                            <>
                              <span className="flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" />
                                {inv._count.accessLogs} access{inv._count.accessLogs !== 1 ? 'es' : ''}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5" />
                                {inv._count.downloadLogs || 0} download{(inv._count.downloadLogs || 0) !== 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="w-full md:w-56 p-5 bg-slate-50/50 flex flex-col justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {inv.status === 'PENDING' || inv.status === 'ACCEPTED' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={(e) => { e.stopPropagation(); openPermissionDialog(inv); }}
                            >
                              Edit Permission
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={(e) => { e.stopPropagation(); openTtlDialog(inv); }}
                            >
                              Edit TTL
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={(e) => { e.stopPropagation(); setRevokeDialogId(inv.id); }}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1.5" />
                              Revoke
                            </Button>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 text-center py-2">No actions available</div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Received Tab ──────────────────────────────────────────── */}
        <TabsContent value="received">
          {receivedLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : received.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800">No received invitations</h2>
              <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs">
                When someone shares resources with you, they&apos;ll appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {received.map(inv => {
                const perm = permissionBadge(inv.permission);
                const ttl = ttlInfo(inv.expiresAt);
                const status = statusBadge(inv.status);
                return (
                  <Card
                    key={inv.id}
                    className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow rounded-2xl cursor-pointer"
                    onClick={() => router.push(`/shared/${inv.id}`)}
                  >
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-xs shrink-0', status.className)}>{status.label}</Badge>
                            {inv.project && (
                              <span className="text-xs text-slate-500 truncate">
                                {inv.project.emoji} {inv.project.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
                              {resourceIcon(inv.resourceType)}
                              {resourceLabel(inv.resourceType)}
                            </Badge>
                            <Badge variant="outline" className={cn('text-xs', perm.className)}>{perm.label}</Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                          <Users className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-medium">Shared by {inv.owner?.name || inv.owner?.email || 'Unknown'}</span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-50">
                          <span className={cn('flex items-center gap-1.5', ttl.urgent ? 'text-amber-600 font-medium' : '')}>
                            <Clock className="w-3.5 h-3.5" />
                            {ttl.text}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </span>
                          {inv.firstAccessedAt && (
                            <span className="flex items-center gap-1.5 text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Accepted
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Reviews Tab ───────────────────────────────────────────── */}
        <TabsContent value="reviews">
          {reviewsLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : editRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                <FileCheck className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800">No pending reviews</h2>
              <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs">
                Edit requests from collaborators will appear here for your review.
              </p>
            </div>
          ) : (
              <div className="space-y-4">
              {editRequests.map(er => {
                const rs = reviewStatusBadge(er.status);
                const perm = permissionBadge('EDIT');
                return (
                  <Card
                    key={er.id}
                    className={cn(
                      'overflow-hidden border-slate-200 shadow-sm rounded-2xl',
                      'cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all'
                    )}
                    onClick={() => router.push(`/sharing/reviews/${er.id}`)}
                  >
                    <div className="p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
                              {resourceIcon(er.resourceType)}
                              {resourceLabel(er.resourceType)}
                            </Badge>
                            <Badge variant="outline" className={cn('text-xs', rs.className)}>{rs.label}</Badge>
                            <Badge variant="outline" className={cn('text-xs', perm.className)}>{perm.label}</Badge>
                          </div>
                        </div>
                      </div>

                      <h3 className="font-semibold text-slate-900 mb-1">{er.title}</h3>
                      {er.description && (
                        <p className="text-sm text-slate-500 mb-3">{er.description}</p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {er.requester.name || er.requester.email}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(er.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {er.status === 'PENDING' && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/sharing/reviews/${er.id}`);
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Review & Merge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReviewDialog({ id: er.id, action: 'REJECT' });
                            }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Activity Tab ──────────────────────────────────────────── */}
        <TabsContent value="activity">
          {activityLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : !activeLinks || activeLinks.recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-xl font-semibold text-slate-800">No recent activity</h2>
              <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs">
                Sharing activity will appear here as collaborators access your resources.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-indigo-600">{activeLinks.totalActive}</div>
                    <div className="text-xs text-slate-500 mt-1">Active shares</div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{activeLinks.expiringSoon}</div>
                    <div className="text-xs text-slate-500 mt-1">Expiring soon</div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-slate-700">{activeLinks.totalRecipients}</div>
                    <div className="text-xs text-slate-500 mt-1">Recipients</div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{activeLinks.pendingCount}</div>
                    <div className="text-xs text-slate-500 mt-1">Pending</div>
                  </CardContent>
                </Card>
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                Recent Activity
              </h3>

              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                {activeLinks.recentActivity.map((event) => (
                  <div key={event.id} className="relative">
                    <div className="absolute -left-[29px] p-1 bg-white rounded-full border-2 border-slate-200">
                      <div className="w-5 h-5 flex items-center justify-center text-slate-500">
                        {activityIcon(event.action)}
                      </div>
                    </div>
                    <div className="pb-1">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">{event.user?.name || event.user?.email || 'Someone'}</span>
                        {' '}{activityLabel(event.action)}{' '}
                        <span className="font-medium text-slate-900">{event.resourceDetail || event.resourceType}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(event.accessedAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Revoke Confirmation Dialog ──────────────────────────────── */}
      <Dialog open={!!revokeDialogId} onOpenChange={(open) => { if (!open) setRevokeDialogId(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <ShieldAlert className="w-5 h-5" />
              Revoke Access
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              This will immediately prevent the recipient from accessing this shared resource. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setRevokeDialogId(null)} disabled={isRevoking} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={isRevoking} className="flex-1 rounded-xl font-bold shadow-lg shadow-rose-200">
              {isRevoking ? 'Revoking...' : 'Revoke Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Review Action Dialog ────────────────────────────────────── */}
      <Dialog open={!!reviewDialog} onOpenChange={(open) => { if (!open) setReviewDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className={cn(
              'flex items-center gap-2 font-bold',
              reviewDialog?.action === 'APPROVE' ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {reviewDialog?.action === 'APPROVE' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              Reject Edit Request
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              This will reject the proposed changes. The collaborator will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setReviewDialog(null)} disabled={isReviewAction} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReviewAction}
              disabled={isReviewAction}
              className="flex-1 rounded-xl font-bold"
            >
              {isReviewAction ? 'Processing...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permissionDialogId} onOpenChange={(open) => { if (!open) setPermissionDialogId(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Permission</DialogTitle>
            <DialogDescription>Update what this recipient is allowed to do with this shared resource.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(['READ_ONLY', 'COMMENT', 'EDIT'] as const).map((permission) => (
              <button
                key={permission}
                type="button"
                onClick={() => setNextPermission(permission)}
                className={cn('w-full rounded-xl border p-3 text-left', nextPermission === permission ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200')}
              >
                <div className="font-medium text-sm text-slate-900">{permissionBadge(permission).label}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {permission === 'READ_ONLY' ? 'Can only view content.' : permission === 'COMMENT' ? 'Can view and comment.' : 'Can submit edit proposals for review.'}
                </div>
              </button>
            ))}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="ghost" onClick={() => setPermissionDialogId(null)} disabled={isSavingManage}>Cancel</Button>
            <Button onClick={handleSavePermission} disabled={isSavingManage} className="bg-indigo-600 hover:bg-indigo-700">
              {isSavingManage ? 'Saving...' : 'Save Permission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ttlDialogId} onOpenChange={(open) => { if (!open) setTtlDialogId(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Expiry</DialogTitle>
            <DialogDescription>Change when this share should expire.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} />
              No expiry
            </label>
            {!noExpiry && (
              <div className="space-y-2">
                <Label htmlFor="ttl-days">Days until expiry</Label>
                <Input id="ttl-days" type="number" min={1} max={3650} value={ttlDaysInput} onChange={(e) => setTtlDaysInput(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="ghost" onClick={() => setTtlDialogId(null)} disabled={isSavingManage}>Cancel</Button>
            <Button onClick={handleSaveTtl} disabled={isSavingManage} className="bg-indigo-600 hover:bg-indigo-700">
              {isSavingManage ? 'Saving...' : 'Save Expiry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
