'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileCheck,
  Users,
  Calendar,
  Eye,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RefreshCw,
  FileText,
  Key,
  Package,
  FolderKanban,
  Container,
  FolderOpen,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SharePermissionBadge } from '@/components/sharing/SharePermissionBadge';

type Permission = 'READ_ONLY' | 'COMMENT' | 'EDIT';

interface ReviewRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  resourceType: string;
  resourceId: string;
  proposedEncrypted: string;
  proposedIv: string;
  createdAt: string;
  requester: { id: string; name: string | null; email: string };
  invitation: {
    resourceType: string;
    resourceId: string;
    permission: string;
    recipientEmail: string;
  };
}

export type { ReviewRequest };

interface ReviewsContentProps {
  requests: ReviewRequest[];
  error?: string;
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

function reviewStatusBadge(status: string) {
  switch (status) {
    case 'PENDING': return { label: 'Pending review', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'APPROVED': return { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'REJECTED': return { label: 'Rejected', className: 'bg-rose-100 text-rose-700 border-rose-200' };
    case 'MERGED': return { label: 'Merged', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    default: return { label: status, className: 'bg-slate-100 text-slate-500 border-slate-200' };
  }
}

export function ReviewsContent({ requests, error: initialError }: ReviewsContentProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError || null);
  const [localRequests, setLocalRequests] = useState(requests);
  const [reviewDialog, setReviewDialog] = useState<{ id: string; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [isReviewAction, setIsReviewAction] = useState(false);

  const handleApprove = (id: string) => setReviewDialog({ id, action: 'APPROVE' });
  const handleReject = (id: string) => setReviewDialog({ id, action: 'REJECT' });

  const handleReviewAction = async () => {
    if (!reviewDialog) return;
    setIsReviewAction(true);
    const action = reviewDialog.action;
    try {
      const res = await fetch(`/api/sharing/edit-request/${reviewDialog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(action === 'APPROVE' ? 'Edit request approved' : 'Edit request rejected');
      setLocalRequests(prev => prev.filter(r => r.id !== reviewDialog.id));
      setReviewDialog(null);
    } catch {
      toast.error('Could not update review');
    } finally {
      setIsReviewAction(false);
    }
  };

  const retry = () => {
    setError(null);
    window.location.reload();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <FileCheck className="w-8 h-8 text-indigo-600" />
        <h1 className="text-3xl font-bold text-slate-900">Edit Requests</h1>
        {localRequests.length > 0 && (
          <Badge variant="secondary" className="ml-2 h-5 px-2 text-xs">
            {localRequests.length}
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {error}
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-amber-700 hover:bg-amber-100"
            onClick={retry}
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {localRequests.length === 0 && !error ? (
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
          {localRequests.map(request => {
            const rs = reviewStatusBadge(request.status);
            return (
              <Card key={request.id} className="overflow-hidden border-slate-200 shadow-sm rounded-2xl">
                <div className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs gap-1 border-slate-200 text-slate-600">
                        {resourceIcon(request.resourceType)}
                        {resourceLabel(request.resourceType)}
                      </Badge>
                      <Badge variant="outline" className={cn('text-xs', rs.className)}>
                        {rs.label}
                      </Badge>
                      <SharePermissionBadge permission={request.invitation.permission as Permission} />
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1">{request.title}</h3>
                  {request.description && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{request.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {request.requester.name || request.requester.email}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(request.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/sharing/reviews/${request.id}`)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => handleApprove(request.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => handleReject(request.id)}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={(open) => { if (!open) setReviewDialog(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className={cn(
              'flex items-center gap-2 font-bold',
              reviewDialog?.action === 'APPROVE' ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {reviewDialog?.action === 'APPROVE' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {reviewDialog?.action === 'APPROVE' ? 'Approve Edit Request' : 'Reject Edit Request'}
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              {reviewDialog?.action === 'APPROVE'
                ? 'This will approve the proposed changes and merge them into the resource.'
                : 'This will reject the proposed changes. The collaborator will be notified.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-between gap-3">
            <Button variant="ghost" onClick={() => setReviewDialog(null)} disabled={isReviewAction} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === 'APPROVE' ? 'default' : 'destructive'}
              onClick={handleReviewAction}
              disabled={isReviewAction}
              className={cn(
                'flex-1 rounded-xl font-bold',
                reviewDialog?.action === 'APPROVE' && 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200'
              )}
            >
              {isReviewAction ? 'Processing...' : reviewDialog?.action === 'APPROVE' ? 'Approve & Merge' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
