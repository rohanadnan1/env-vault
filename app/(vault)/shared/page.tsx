import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Clock,
  Container,
  FolderOpen,
  FileText,
  Key,
  Package,
  FolderKanban,
  AlertTriangle,
  Inbox,
  ChevronRight,
  Pencil,
  MessageSquare,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { LeaveButton, LeaveProjectButton } from '@/components/sharing/SharedLeaveActions';

interface Invitation {
  id: string;
  resourceType: string;
  resourceId: string;
  permission: string;
  expiresAt: Date | null;
  status: string;
  note: string | null;
  createdAt: Date;
  owner: { id: string; name: string | null; email: string };
  project: { id: string; name: string; emoji: string; color: string } | null;
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

function permissionLabel(permission: string) {
  switch (permission) {
    case 'READ_ONLY': return 'Read';
    case 'COMMENT': return 'Comment';
    case 'EDIT': return 'Edit';
    default: return permission;
  }
}

function permissionBadgeClass(permission: string) {
  switch (permission) {
    case 'READ_ONLY': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'COMMENT': return 'bg-blue-100 text-blue-600 border-blue-200';
    case 'EDIT': return 'bg-amber-100 text-amber-600 border-amber-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function invitationStatus(expiresAt: Date | null, status: string): { label: string; className: string } {
  if (status === 'ACCEPTED') return { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (status === 'REVOKED') return { label: 'Revoked', className: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (status === 'EXPIRED') return { label: 'Expired', className: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (status === 'PENDING') return { label: 'Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (!expiresAt) return { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) return { label: 'Expired', className: 'bg-slate-100 text-slate-500 border-slate-200' };
  const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
  if (days <= 3) return { label: 'Expiring soon', className: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
}

interface ProjectGroup {
  key: string;
  project: { id: string; name: string; emoji: string; color: string };
  owner: { id: string; name: string | null; email: string };
  items: Invitation[];
}

interface OwnerGroup {
  key: string;
  owner: { id: string; name: string | null; email: string };
  items: Invitation[];
}

export default async function SharedPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const sessionEmail = session.user.email?.toLowerCase();

  let invitations: Invitation[] = [];
  let loadError = false;

  try {
    invitations = await db.shareInvitation.findMany({
      where: {
        OR: [
          { recipientId: session.user.id },
          ...(sessionEmail ? [{ recipientEmail: { equals: sessionEmail, mode: 'insensitive' as const } }] : []),
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, emoji: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (err) {
    console.error('[SHARED_PAGE]', err);
    loadError = true;
  }

  const projectGroups: Map<string, ProjectGroup> = new Map();
  const unassigned: Invitation[] = [];

  for (const inv of invitations) {
    if (inv.project) {
      const existing = projectGroups.get(inv.project.id);
      if (existing) {
        existing.items.push(inv);
      } else {
        projectGroups.set(inv.project.id, {
          key: inv.project.id,
          project: inv.project,
          owner: inv.owner,
          items: [inv],
        });
      }
    } else {
      unassigned.push(inv);
    }
  }

  const ownerGroups: Map<string, OwnerGroup> = new Map();
  for (const inv of unassigned) {
    const existing = ownerGroups.get(inv.owner.id);
    if (existing) {
      existing.items.push(inv);
    } else {
      ownerGroups.set(inv.owner.id, {
        key: inv.owner.id,
        owner: inv.owner,
        items: [inv],
      });
    }
  }

  const PERMISSION_SECTIONS = [
    { key: 'EDIT', label: 'Can Edit', icon: Pencil, color: 'text-amber-600 bg-amber-50 border-amber-200', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
    { key: 'COMMENT', label: 'Can Comment', icon: MessageSquare, color: 'text-blue-600 bg-blue-50 border-blue-200', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'READ_ONLY', label: 'Read Only', icon: Eye, color: 'text-slate-500 bg-slate-50 border-slate-200', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  ];

  function groupItemsByPermission(items: Invitation[]): Record<string, Invitation[]> {
    const groups: Record<string, Invitation[]> = { EDIT: [], COMMENT: [], READ_ONLY: [] };
    for (const item of items) {
      const perm = groups[item.permission] ? item.permission : 'READ_ONLY';
      groups[perm].push(item);
    }
    return groups;
  }

  function renderResourceRow(inv: Invitation) {
    const status = invitationStatus(inv.expiresAt, inv.status);
    const isActive = inv.status === 'ACCEPTED' || inv.status === 'PENDING';
    return (
      <Link key={inv.id} href={`/shared/${inv.id}`}>
        <div className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer group/item">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-slate-400">{resourceIcon(inv.resourceType)}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {resourceLabel(inv.resourceType)}
                </span>
                <Badge variant="outline" className={cn('text-[10px] leading-tight', permissionBadgeClass(inv.permission))}>
                  {permissionLabel(inv.permission)}
                </Badge>
                <Badge variant="outline" className={cn('text-[10px] leading-tight', status.className)}>
                  {status.label}
                </Badge>
              </div>
              {inv.note && (
                <p className="text-xs text-slate-400 italic truncate mt-0.5">
                  &ldquo;{inv.note}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-slate-400">
              {inv.expiresAt
                ? `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                : 'No expiry'}
            </span>
            {isActive && <LeaveButton invitationId={inv.id} />}
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover/item:text-slate-500 transition-colors" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Shared resources are temporarily unavailable. Please retry shortly.
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Users className="w-8 h-8 text-indigo-600" />
          Shared With Me
        </h1>
        <p className="text-slate-500 mt-1">Resources that others have shared with you for collaboration.</p>
      </div>

      {invitations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">No shared resources</h2>
          <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs px-4">
            When someone shares a project, environment, or secret with you, it will appear here.
          </p>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">Go to Dashboard</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {[...projectGroups.values()].map(group => {
            const permGroups = groupItemsByPermission(group.items);
            return (
            <Card key={group.key} className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-3 px-5 py-4 bg-slate-50/80 border-b border-slate-100">
                  <span className="text-xl">{group.project.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{group.project.name}</h3>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      Shared by {group.owner.name || group.owner.email}
                      <span className="text-slate-300">·</span>
                      {group.items.length} resource{group.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <LeaveProjectButton projectId={group.project.id} projectName={group.project.name} />
                </div>
                {PERMISSION_SECTIONS.map(section => {
                  const sectionItems = permGroups[section.key];
                  if (sectionItems.length === 0) return null;
                  const SectionIcon = section.icon;
                  return (
                    <div key={section.key}>
                      <div className={cn('flex items-center gap-2 px-5 py-2 border-b border-slate-50', section.color)}>
                        <SectionIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {section.label}
                        </span>
                        <Badge variant="outline" className={cn('text-[9px] ml-auto', section.badgeClass)}>
                          {sectionItems.length}
                        </Badge>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {sectionItems.map(inv => renderResourceRow(inv))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            );
          })}

          {ownerGroups.size > 0 && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                Other shared resources
              </p>
              {[...ownerGroups.values()].map(group => {
                const permGroups = groupItemsByPermission(group.items);
                return (
                <Card key={group.key} className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3 px-5 py-3 bg-slate-50/80 border-b border-slate-100">
                      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600">
                          {(group.owner.name || group.owner.email).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{group.owner.name || group.owner.email}</p>
                        <p className="text-[10px] text-slate-400">{group.items.length} resource{group.items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {PERMISSION_SECTIONS.map(section => {
                      const sectionItems = permGroups[section.key];
                      if (sectionItems.length === 0) return null;
                      const SectionIcon = section.icon;
                      return (
                        <div key={section.key}>
                          <div className={cn('flex items-center gap-2 px-5 py-1.5 border-b border-slate-50', section.color)}>
                            <SectionIcon className="w-3 h-3" />
                            <span className="text-[9px] font-bold uppercase tracking-widest">{section.label}</span>
                            <Badge variant="outline" className={cn('text-[8px] ml-auto', section.badgeClass)}>{sectionItems.length}</Badge>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {sectionItems.map(inv => renderResourceRow(inv))}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
