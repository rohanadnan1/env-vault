'use client';

import { Lock, MessageSquare, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Permission = 'READ_ONLY' | 'COMMENT' | 'EDIT';

interface SharePermissionBadgeProps {
  permission: Permission;
  className?: string;
}

const config: Record<Permission, { Icon: typeof Lock; label: string; className: string }> = {
  READ_ONLY: {
    Icon: Lock,
    label: 'Read only',
    className: 'border-slate-300 text-slate-600',
  },
  COMMENT: {
    Icon: MessageSquare,
    label: 'Comment',
    className: 'border-indigo-300 text-indigo-600',
  },
  EDIT: {
    Icon: Pencil,
    label: 'Edit',
    className: 'border-emerald-300 text-emerald-600',
  },
};

export function SharePermissionBadge({ permission, className }: SharePermissionBadgeProps) {
  const { Icon, label, className: colorClass } = config[permission];

  return (
    <Badge variant="outline" className={cn('gap-1', colorClass, className)}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
