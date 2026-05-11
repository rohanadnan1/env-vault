import { toast } from 'sonner';

type MergeRequestItem = {
  id: string;
  status: string;
  title?: string;
  resourceType?: string;
};

type KingFileItem = {
  id: string;
  name: string;
  contentEncrypted?: string;
};

export type WorkspaceChangeSet = {
  newMergeRequests: number;
  statusChanges: Array<{ title: string; from: string; to: string }>;
  changedKingFiles: string[];
  changedKingSecrets: string[];
};

export function computeChanges(
  previousMergeRequests: MergeRequestItem[],
  currentMergeRequests: MergeRequestItem[],
  previousKingFiles: KingFileItem[],
  currentKingFiles: KingFileItem[]
): WorkspaceChangeSet {
  const prevIds = new Set(previousMergeRequests.map(r => r.id));
  const prevMap = new Map(previousMergeRequests.map(r => [r.id, r]));
  const currMap = new Map(currentMergeRequests.map(r => [r.id, r]));

  let newMergeRequests = 0;
  const statusChanges: WorkspaceChangeSet['statusChanges'] = [];

  for (const curr of currentMergeRequests) {
    if (!prevIds.has(curr.id)) {
      newMergeRequests++;
    } else {
      const prev = prevMap.get(curr.id);
      if (prev && prev.status !== curr.status) {
        const title = curr.title || `${curr.resourceType || 'File'} proposal`;
        statusChanges.push({
          title,
          from: prev.status,
          to: curr.status,
        });
      }
    }
  }

  const prevKingFileMap = new Map(previousKingFiles.map(f => [f.id, f]));
  const changedKingFiles: string[] = [];
  for (const curr of currentKingFiles) {
    const prev = prevKingFileMap.get(curr.id);
    if (prev && prev.contentEncrypted !== curr.contentEncrypted) {
      changedKingFiles.push(curr.name);
    }
  }

  return {
    newMergeRequests,
    statusChanges,
    changedKingFiles,
    changedKingSecrets: [],
  };
}

export function showChangeToasts(changes: WorkspaceChangeSet) {
  const { newMergeRequests, statusChanges, changedKingFiles } = changes;

  if (newMergeRequests > 0) {
    toast(`${newMergeRequests} new merge request${newMergeRequests > 1 ? 's' : ''}`, {
      description: 'Someone proposed changes — review them in the Merge Requests tab',
      style: { background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' },
      action: { label: 'View', onClick: () => {} },
    });
  }

  for (const change of statusChanges) {
    const isMerged = change.to === 'MERGED';
    const isRejected = change.to === 'REJECTED';
    const isApproved = change.to === 'APPROVED';

    if (isMerged) {
      toast.success(`"${change.title}" was merged`, {
        description: 'The king file has been updated with these changes',
        style: { background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46' },
      });
    } else if (isRejected) {
      toast(`"${change.title}" was rejected`, {
        style: { background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b' },
      });
    } else if (isApproved) {
      toast(`"${change.title}" received an approval`, {
        style: { background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e40af' },
      });
    }
  }

  if (changedKingFiles.length > 0) {
    const names = changedKingFiles.slice(0, 3).join(', ');
    const more = changedKingFiles.length > 3 ? ` +${changedKingFiles.length - 3} more` : '';
    toast(`King file${changedKingFiles.length > 1 ? 's' : ''} updated: ${names}${more}`, {
      description: 'Fork the updates into your workspace to get the latest changes',
      style: { background: '#ede9fe', border: '1px solid #8b5cf6', color: '#5b21b6' },
    });
  }

  if (newMergeRequests === 0 && statusChanges.length === 0 && changedKingFiles.length === 0) {
    toast('No new changes', {
      style: { background: '#f8fafc', border: '1px solid #cbd5e1', color: '#64748b' },
    });
  }
}

const toastStyles = {
  success: { background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46' },
  error: { background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b' },
  warning: { background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' },
  info: { background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e40af' },
  king: { background: '#ede9fe', border: '1px solid #8b5cf6', color: '#5b21b6' },
  muted: { background: '#f8fafc', border: '1px solid #cbd5e1', color: '#64748b' },
};

export function smartToast(type: keyof typeof toastStyles, message: string, description?: string) {
  const style = toastStyles[type];
  toast(message, { description, style });
}
