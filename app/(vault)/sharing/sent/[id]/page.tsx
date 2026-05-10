'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  Eye,
  FileText,
  FolderKanban,
  FolderOpen,
  Key,
  Loader2,
  MessageSquare,
  Package,
  Send,
  Users,
  X,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Container,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CommentData {
  id: string;
  content: string;
  iv: string | null;
  isEncrypted: boolean;
  parentId: string | null;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  replies: CommentData[];
}

interface EditReqData {
  id: string;
  resourceType: string;
  resourceId: string;
  title: string;
  description: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  requester: { id: string; name: string | null; email: string };
}

interface SentDetail {
  id: string;
  resourceType: string;
  resourceId: string;
  permission: string;
  status: string;
  invitesRemaining: number;
  recipientEmail: string;
  recipient: { id: string; name: string | null; email: string } | null;
  project: { id: string; name: string; emoji: string; color: string } | null;
  note: string | null;
  expiresAt: string | null;
  ttlDays: number | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  firstAccessedAt: string | null;
  comments: CommentData[];
  editRequests: EditReqData[];
  accessCount: number;
  downloadCount: number;
}

function resourceIcon(type: string) {
  const cls = 'w-3.5 h-3.5 shrink-0';
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

export default function SentInvitationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<SentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [commentText, setCommentText] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/sharing/manage/${id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load');
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleAddComment = async () => {
    if (!commentText.trim() || !id) return;
    setIsSendingComment(true);
    try {
      const res = await fetch('/api/sharing/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId: id, content: commentText.trim(), isEncrypted: false }),
      });
      if (!res.ok) throw new Error('Failed');
      const newComment = await res.json();
      setData(prev => prev ? {
        ...prev,
        comments: [
          { ...newComment, replies: [] },
          ...prev.comments,
        ],
      } : prev);
      setCommentText('');
      toast.success('Comment added');
    } catch {
      toast.error('Could not add comment');
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const res = await fetch(`/api/sharing/manage/${id}/revoke`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to revoke');
      }
      setData(prev => prev ? { ...prev, status: 'REVOKED' } : prev);
      toast.success('Invitation revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke');
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-4" />
        <p className="text-sm text-slate-500">Loading invitation details...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.push('/sharing')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sharing
        </Button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-amber-800 font-medium">{error || 'Invitation not found'}</p>
        </div>
      </div>
    );
  }

  const isActive = data.status === 'PENDING' || data.status === 'ACCEPTED';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/sharing')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className={cn(
        'rounded-2xl px-5 py-3 flex items-center justify-between border',
        isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-100 border-slate-200'
      )}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
            {resourceIcon(data.resourceType)}
            {resourceLabel(data.resourceType)}
          </Badge>
          <Badge variant="outline" className={cn('text-xs', data.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' : data.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
            {data.status === 'ACCEPTED' ? 'Accepted' : data.status === 'PENDING' ? 'Pending' : data.status === 'REVOKED' ? 'Revoked' : data.status}
          </Badge>
          <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
            {data.permission === 'READ_ONLY' ? 'Read only' : data.permission === 'COMMENT' ? 'Comment' : 'Edit'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={handleRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
              Revoke
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Invitation Details</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recipient</p>
                  <p className="text-slate-900 font-medium">{data.recipient?.name || data.recipientEmail}</p>
                  <p className="text-xs text-slate-500">{data.recipientEmail}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Project</p>
                  <p className="text-slate-900 font-medium">
                    {data.project ? `${data.project.emoji} ${data.project.name}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Created</p>
                  <p className="text-slate-900">{new Date(data.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Accepted</p>
                  <p className="text-slate-900">{data.acceptedAt ? new Date(data.acceptedAt).toLocaleString() : 'Not yet'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">First Accessed</p>
                  <p className="text-slate-900">{data.firstAccessedAt ? new Date(data.firstAccessedAt).toLocaleString() : 'Not yet'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">TTL / Expiry</p>
                  <p className={cn('text-slate-900', data.expiresAt && new Date(data.expiresAt).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 ? 'text-amber-600 font-medium' : '')}>
                    {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'No expiry'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-slate-50">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Eye className="w-3.5 h-3.5" />
                  {data.accessCount} access{data.accessCount !== 1 ? 'es' : ''}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Download className="w-3.5 h-3.5" />
                  {data.downloadCount} download{data.downloadCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {data.comments.length} comment{data.comments.length !== 1 ? 's' : ''}
                </span>
              </div>

              {data.note && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Share Note</p>
                  <p className="text-sm text-slate-700 italic">&ldquo;{data.note}&rdquo;</p>
                </div>
              )}
            </CardContent>
          </Card>

          {data.editRequests.length > 0 && (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  Edit Requests ({data.editRequests.length})
                </h2>
                <div className="space-y-3">
                  {data.editRequests.map(er => (
                    <div key={er.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{er.title}</h3>
                          {er.description && <p className="text-xs text-slate-500 mt-1">{er.description}</p>}
                        </div>
                        <Badge variant="outline" className={cn('text-xs shrink-0',
                          er.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          er.status === 'MERGED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          er.status === 'REJECTED' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                          'bg-slate-100 text-slate-500 border-slate-200'
                        )}>
                          {er.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{er.requester.name || er.requester.email}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(er.createdAt).toLocaleDateString()}</span>
                      </div>
                      {er.reviewNote && (
                        <div className="mt-2 rounded-lg bg-white border border-slate-100 px-3 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Review Note</p>
                          <p className="text-xs text-slate-700">{er.reviewNote}</p>
                        </div>
                      )}
                      {er.status === 'PENDING' && (
                        <Button size="sm" variant="outline" className="mt-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => router.push(`/sharing/reviews/${er.id}`)}>
                          <CheckCircle2 className="w-3 h-3 mr-1.5" />Review
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Comments ({data.comments.length})
              </h2>

              <div className="flex gap-2">
                <Textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment on this shared resource..."
                  rows={2}
                  className="text-sm resize-none rounded-xl border-slate-200"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                />
                <Button size="icon" className="h-9 w-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                  onClick={handleAddComment} disabled={!commentText.trim() || isSendingComment}>
                  {isSendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.comments.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No comments yet</p>
                  </div>
                ) : (
                  data.comments.map(c => (
                    <div key={c.id} className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] font-medium text-slate-400">
                          {c.author.name || c.author.email} {c.author.id === 'owner' ? '(owner)' : ''}
                        </span>
                        <span className="text-[10px] text-slate-300">{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      {c.replies.map(r => (
                        <div key={r.id} className="mt-2 ml-4 rounded-lg p-2 bg-white border border-slate-100">
                          <p className="text-xs text-slate-600 whitespace-pre-wrap">{r.content}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] font-medium text-slate-400">{r.author.name || r.author.email}</span>
                            <span className="text-[9px] text-slate-300">{new Date(r.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-700">Quick Stats</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <Badge variant="outline" className={cn('text-xs', data.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : data.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>{data.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Views</span>
                  <span className="font-medium text-slate-900">{data.accessCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Downloads</span>
                  <span className="font-medium text-slate-900">{data.downloadCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Comments</span>
                  <span className="font-medium text-slate-900">{data.comments.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Edit Requests</span>
                  <span className="font-medium text-slate-900">{data.editRequests.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {isActive && (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-700">Actions</h3>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={handleRevoke} disabled={revoking}>
                    <XCircle className="w-3.5 h-3.5 mr-2" />
                    Revoke Access
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
