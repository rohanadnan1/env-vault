"use client";

import { diffLines, createPatch, applyPatch } from 'diff';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { encryptSpaceKeyForMember } from '@/lib/crypto/private-space';
import { decryptSpaceKeyForCurrentUser } from '@/lib/crypto/private-space-client';
import { toast } from 'sonner';
import { InviteToPrivateSpaceModal } from '@/components/private-spaces/InviteToPrivateSpaceModal';
import { ImportProjectToSpaceModal, type ImportProjectClientPayload } from '@/components/private-spaces/ImportProjectToSpaceModal';
import { KeypairManager } from '@/components/private-spaces/KeypairManager';
import { motion, AnimatePresence } from 'framer-motion';
import { StaggerList, StaggerItem, FadeIn } from '@/components/ui/animations';
import { cn } from '@/lib/utils';
import { ForkDiffViewer } from '@/components/private-spaces/ForkDiffViewer';
import { ArrowLeftRight, CheckCircle2, ChevronRight, Crown, Database, FolderKanban, GitPullRequestArrow, History, KeyRound, Loader2, Plus, RefreshCw, Save, ShieldAlert, Trash2, Users, Vote, XCircle, Sparkles, Globe, Swords, MailCheck, AlertTriangle, GitMerge, FilePlus, FileCode, Copy, UserPlus, LogOut, FolderGit2 } from 'lucide-react';
import { FILE_DRAFT_PRESETS, getSuggestedPresetByFilename, type FileDraftPreset } from '@/lib/constants/file-presets';

const workspaceCache = new Map<string, {
  space: SpacePayload;
  mergeRequests: MergeRequestPayload[];
  spaceKey: CryptoKey | null;
}>();

const OPTIMISTIC_MERGE_REQUEST_GRACE_MS = 15_000;

// Constants extracted to lib/constants/file-presets.ts

function normalizeClientSpacePath(folderPath?: string | null) {
  if (!folderPath) return '/';
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed === '/') return '/';
  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function sortPaths(paths: Iterable<string>) {
  return Array.from(paths).sort((left, right) => {
    if (left === right) return 0;
    if (left === '/') return -1;
    if (right === '/') return 1;
    return left < right ? -1 : 1;
  });
}

function buildFolderSuggestions(files: SpaceFile[]) {
  const folders = new Set<string>(['/']);
  for (const file of files) {
    const normalized = normalizeClientSpacePath(file.folderPath);
    folders.add(normalized);
    if (normalized === '/') continue;
    const segments = normalized.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current += `/${segment}`;
      folders.add(current);
    }
  }
  return sortPaths(folders);
}

// getSuggestedPresetByFilename moved to lib/constants/file-presets.ts

function getMergeRequestComparisonPath(request: MergeRequestPayload) {
  return normalizeClientSpacePath(
    request.proposedFolderPath ?? request.currentKing?.folderPath ?? '/'
  );
}

function getMergeRequestFingerprint(request: MergeRequestPayload) {
  return [
    request.resourceType,
    request.requester.id,
    request.currentKing?.id ?? 'new',
    request.proposedName ?? '',
    getMergeRequestComparisonPath(request),
    request.proposedData,
    request.iv,
  ].join('::');
}

function reconcileMergeRequestLists(
  incoming: MergeRequestPayload[],
  current: MergeRequestPayload[],
  currentUserId: string
) {
  const now = Date.now();
  const incomingById = new Set(incoming.map((request) => request.id));
  const incomingFingerprints = new Set(incoming.map(getMergeRequestFingerprint));
  const merged = [...incoming];

  for (const request of current) {
    if (incomingById.has(request.id)) {
      continue;
    }

    if (incomingFingerprints.has(getMergeRequestFingerprint(request))) {
      continue;
    }

    const createdAtMs = Date.parse(request.createdAt);
    const withinGracePeriod =
      Number.isFinite(createdAtMs) && now - createdAtMs <= OPTIMISTIC_MERGE_REQUEST_GRACE_MS;
    const isRecentOwnPendingRequest =
      request.status === 'PENDING' &&
      request.requester.user.id === currentUserId &&
      (request.id.startsWith('temp-') || withinGracePeriod);

    if (isRecentOwnPendingRequest) {
      merged.push(request);
    }
  }

  merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return merged;
}

function sortWorkspaceFiles(files: SpaceFile[]) {
  return [...files].sort((left, right) => {
    const pathCompare = normalizeClientSpacePath(left.folderPath).localeCompare(normalizeClientSpacePath(right.folderPath));
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.name.localeCompare(right.name);
  });
}

function sortWorkspaceSecrets(secrets: SpaceSecret[]) {
  return [...secrets].sort((left, right) => {
    const pathCompare = normalizeClientSpacePath(left.folderPath).localeCompare(normalizeClientSpacePath(right.folderPath));
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.keyName.localeCompare(right.keyName);
  });
}

function sortSpaceFolders(folders: SpaceFolder[]) {
  return [...folders].sort((left, right) => {
    const visibilityCompare = left.visibility.localeCompare(right.visibility);
    if (visibilityCompare !== 0) {
      return visibilityCompare;
    }
    const domainCompare = left.domain.localeCompare(right.domain);
    if (domainCompare !== 0) {
      return domainCompare;
    }
    return left.path.localeCompare(right.path);
  });
}

function PlaintextDiff({
  original,
  modified,
  originalLabel,
  modifiedLabel,
}: {
  original: string;
  modified: string;
  originalLabel: string;
  modifiedLabel: string;
}) {
  const diffResult = diffLines(original, modified);
  const leftLines: { type: string, text?: string, num?: number }[] = [];
  const rightLines: { type: string, text?: string, num?: number }[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;

  diffResult.forEach(part => {
    const value = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;
    if (!value && !part.added && !part.removed) return;
    const lines = value.split('\n');
    lines.forEach(line => {
      if (part.added) {
        leftLines.push({ type: 'empty' });
        rightLines.push({ type: 'added', text: line, num: rightLineNum++ });
      } else if (part.removed) {
        leftLines.push({ type: 'removed', text: line, num: leftLineNum++ });
        rightLines.push({ type: 'empty' });
      } else {
        leftLines.push({ type: 'normal', text: line, num: leftLineNum++ });
        rightLines.push({ type: 'normal', text: line, num: rightLineNum++ });
      }
    });
  });

  return (
    <div className="grid h-full min-h-0 gap-px bg-slate-200 md:grid-cols-2">
      <section className="flex min-h-0 flex-col bg-slate-50 relative group">
        <header className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 shrink-0 bg-white">
          {originalLabel}
        </header>
        <div 
          className="flex-1 overflow-auto min-h-0 bg-white"
          onScroll={(e) => {
            const target = e.target as HTMLDivElement;
            const rightPane = target.parentElement?.nextElementSibling?.querySelector('.diff-scroll-pane');
            if (rightPane && !target.dataset.ignoreScroll) {
              rightPane.setAttribute('data-ignoreScroll', 'true');
              rightPane.scrollTop = target.scrollTop;
              rightPane.scrollLeft = target.scrollLeft;
              setTimeout(() => rightPane.removeAttribute('data-ignoreScroll'), 10);
            }
          }}
        >
          <div className="flex flex-col w-max min-w-full font-mono text-xs text-slate-700 py-2">
            {leftLines.map((l, i) => (
              <div key={i} className={cn("flex px-2 py-0.5 whitespace-pre min-h-[21px] leading-[21px]", l.type === 'removed' ? 'bg-rose-50 text-rose-700' : l.type === 'empty' ? 'bg-slate-50/50' : '')}>
                <span className="w-8 shrink-0 text-right pr-3 text-slate-400 select-none">{l.num || ''}</span>
                <span>{l.text || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="flex min-h-0 flex-col bg-white relative group">
        <header className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-600 shrink-0 bg-indigo-50/30">
          {modifiedLabel}
        </header>
        <div 
          className="flex-1 overflow-auto min-h-0 bg-white diff-scroll-pane"
          onScroll={(e) => {
            const target = e.target as HTMLDivElement;
            const leftPane = target.parentElement?.previousElementSibling?.querySelector('div.overflow-auto');
            if (leftPane && !target.dataset.ignoreScroll) {
              leftPane.setAttribute('data-ignoreScroll', 'true');
              leftPane.scrollTop = target.scrollTop;
              leftPane.scrollLeft = target.scrollLeft;
              setTimeout(() => leftPane.removeAttribute('data-ignoreScroll'), 10);
            }
          }}
        >
          <div className="flex flex-col w-max min-w-full font-mono text-xs text-slate-900 py-2">
            {rightLines.map((l, i) => (
              <div key={i} className={cn("flex px-2 py-0.5 whitespace-pre min-h-[21px] leading-[21px]", l.type === 'added' ? 'bg-emerald-50 text-emerald-700' : l.type === 'empty' ? 'bg-slate-50/50' : '')}>
                <span className="w-8 shrink-0 text-right pr-3 text-slate-400 select-none">{l.num || ''}</span>
                <span>{l.text || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

type MergeRiskLevel = 'low' | 'medium' | 'high' | 'critical';

type MergeSummaryItem = {
  level: MergeRiskLevel;
  title: string;
  message: string;
};

function levelClasses(level: MergeRiskLevel) {
  switch (level) {
    case 'critical':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    case 'high':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'medium':
      return 'border-indigo-200 bg-indigo-50 text-indigo-900';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
}

function summarizeMergeRequestRisk(
  request: MergeRequestPayload,
  preview: { kingText: string; proposedText: string } | null
) {
  const summaries: MergeSummaryItem[] = [];
  const currentPath = request.currentKing?.folderPath ?? null;
  const proposedPath = request.proposedFolderPath ?? currentPath;
  const folderMoved = !!currentPath && !!proposedPath && currentPath !== proposedPath;

  if (folderMoved) {
    const formatPath = (p: string | null) => (!p || p === '/') ? 'Root' : p.replace(/^\//, '') + ' folder';
    summaries.push({
      level: 'critical',
      title: 'Folder Structure Change',
      message: `This request moves the official ${request.resourceType === 'FILE' ? 'file' : 'secret'} from ${formatPath(currentPath)} to ${formatPath(proposedPath)}. Approving it changes the king folder structure.`,
    });
  }

  if (!preview) {
    return {
      summaries,
      stats: { added: 0, removed: 0, changed: 0, folderMoved },
    };
  }

  let added = 0;
  let removed = 0;
  for (const part of diffLines(preview.kingText, preview.proposedText)) {
    const lineCount = part.count ?? part.value.split('\n').filter((line, index, arr) => line.length > 0 || index < arr.length - 1).length;
    if (part.added) added += lineCount;
    if (part.removed) removed += lineCount;
  }
  const changed = Math.min(added, removed);

  if (removed > 0) {
    summaries.push({
      level: 'critical',
      title: 'Deletion Detected',
      message: `${request.requester.user.name || request.requester.user.email} removed ${removed} line${removed === 1 ? '' : 's'}. Deletions are risky and should be reviewed carefully before merge.`,
    });
  } else if (added >= 8) {
    summaries.push({
      level: 'high',
      title: 'Large Addition',
      message: `${request.requester.user.name || request.requester.user.email} added ${added} lines. This is a substantial change and should be reviewed thoroughly before merge.`,
    });
  } else if (added >= 2) {
    summaries.push({
      level: 'medium',
      title: 'Moderate Change',
      message: `${request.requester.user.name || request.requester.user.email} changed the official content with ${added} added line${added === 1 ? '' : 's'}. Review the content before merge.`,
    });
  } else if (added === 1) {
    summaries.push({
      level: 'low',
      title: 'Small Addition',
      message: `${request.requester.user.name || request.requester.user.email} only added one line. This is a low-risk update, but still verify the content.`,
    });
  } else if (changed === 0 && !folderMoved) {
    summaries.push({
      level: 'low',
      title: 'Minimal Impact',
      message: 'This request does not introduce a meaningful content diff.',
    });
  }

  if (removed === 0 && added > 0 && request.currentKing) {
    summaries.push({
      level: added >= 8 ? 'high' : 'medium',
      title: 'Official Content Modification',
      message: 'Approving this request updates the current king content. Make sure the new content is safe to become the official version.',
    });
  }

  return {
    summaries,
    stats: { added, removed, changed, folderMoved },
  };
}

type SpaceFile = {
  id: string;
  kingFileId: string | null;
  workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
  name: string;
  contentEncrypted: string;
  iv: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  kingFile: {
    id: string;
    name: string;
    folderPath: string;
    updatedAt: string;
  } | null;
  peers: Array<{
    memberId: string;
    userId: string;
    name: string | null;
    email: string;
    userFileId: string;
    folderPath: string;
    updatedAt: string;
  }>;
};

type CloneRequestData = {
  id: string;
  type: 'STRUCTURE' | 'CONTENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  requester?: { id: string; user: { id: string; name: string | null; email: string } };
  source?: { id: string; user: { id: string; name: string | null; email: string } };
};

type SpaceSecret = {
  id: string;
  kingSecretId: string | null;
  workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
  keyName: string;
  valueEncrypted: string;
  iv: string;
  folderPath: string;
  createdAt?: string;
  updatedAt: string;
  kingSecret: {
    id: string;
    keyName: string;
    folderPath: string;
    updatedAt: string;
  } | null;
};

type KingFileView = {
  id: string;
  name: string;
  contentEncrypted: string;
  iv: string;
  folderPath: string;
  updatedAt: string;
};

type KingSecretView = {
  id: string;
  keyName: string;
  valueEncrypted: string;
  iv: string;
  folderPath: string;
  updatedAt: string;
};

type SpaceFolder = {
  id: string;
  visibility: 'PERSONAL' | 'KING';
  domain: 'FILE' | 'SECRET';
  name: string;
  path: string;
  parentId: string | null;
  memberId: string | null;
  createdAt: string;
  updatedAt: string;
};

type SpaceBundle = {
  id: string;
  name: string;
  bundleType: 'EXTENSION' | 'NAME' | 'CUSTOM';
  matchRule: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userFileId: string;
    addedAt: string;
  }>;
};

type KingFileHistoryItem = {
  id: string;
  name: string;
  contentEncrypted: string;
  iv: string;
  folderPath: string;
  revisionNumber: number;
  createdAt: string;
};

type SpacePayload = {
  id: string;
  name: string;
  myMembership: {
    id: string;
    encryptedSpaceKey: string;
    user: { id: string; email: string; name: string | null };
  };
  members: Array<{
    id: string;
    joinedAt: string;
    isCouncilMember: boolean;
    user: { id: string; email: string; name: string | null };
  }>;
  files: SpaceFile[];
  secrets: SpaceSecret[];
  officialFiles: KingFileView[];
  officialSecrets: KingSecretView[];
  folders: SpaceFolder[];
  bundles: SpaceBundle[];
  pendingInvites: Array<{
    id: string;
    recipientEmail: string;
    inviteToken: string;
    createdAt: string;
    hasEncryptedSpaceKey: boolean;
    recipientHasVaultKey?: boolean;
    status?: string;
  }>;
  governance: {
    isCouncilMode: boolean;
    isLockedDown: boolean;
    memberCount: number;
    petitionCount: number;
    councilMemberIds: string[];
    activeElection: null | {
      id: string;
      createdAt: string;
      totalVotes: number;
      hasCurrentUserVoted: boolean;
    };
  };
};

type PeerFilePayload = {
  id: string;
  kingFileId: string | null;
  name: string;
  contentEncrypted: string;
  iv: string;
  folderPath: string;
  updatedAt: string;
  member: {
    id: string;
    user: { id: string; email: string; name: string | null };
  };
};

type Props = {
  spaceId: string;
  userId: string;
  initialSpace?: SpacePayload | null;
  initialMergeRequests?: MergeRequestPayload[] | null;
};

type MergeRequestPayload = {
  id: string;
  resourceType: 'FILE' | 'SECRET';
  status: 'PENDING' | 'MERGED' | 'REJECTED' | 'APPROVED';
  proposedData: string;
  iv: string;
  proposedName: string | null;
  proposedFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
  requester: {
    id: string;
    user: { id: string; email: string; name: string | null };
  };
  approvals: Array<{
    id: string;
    approvedAt: string;
    preserveFolderStructure: boolean;
    member: {
      id: string;
      user: { id: string; email: string; name: string | null };
    };
  }>;
  memberCount: number;
  requiredApprovals: number;
  currentKing:
    | {
        id: string;
        name: string;
        contentEncrypted: string;
        iv: string;
        folderPath: string;
        updatedAt: string;
      }
    | {
        id: string;
        keyName: string;
        folderPath: string;
        valueEncrypted: string;
        iv: string;
        updatedAt: string;
      }
    | null;
  canApprove: boolean;
    canReject: boolean;
    isRequester: boolean;
};

type DuplicateMergeRequestPrompt = {
  resourceType: 'FILE' | 'SECRET';
  existingRequest: {
    id: string;
    proposedData: string;
    iv: string;
    proposedName: string | null;
    proposedFolderPath: string | null;
    createdAt: string;
  };
  nextRequestBody: {
    resourceType: 'FILE' | 'SECRET';
    kingResourceId: string | null;
    proposedData: string;
    iv: string;
    proposedName?: string;
    proposedFolderPath?: string;
  };
  previousText: string;
  nextText: string;
  resourceLabel: string;
};

type WorkspaceScope = `folder:${string}` | 'secrets';
type KingScope = `files:${string}` | `secrets:${string}`;

export function PrivateSpaceWorkspace({ spaceId, userId, initialSpace = null, initialMergeRequests = null }: Props) {
  const router = useRouter();
  const [space, setSpace] = useState<SpacePayload | null>(initialSpace);
  const [mergeRequests, setMergeRequests] = useState<MergeRequestPayload[]>(initialMergeRequests ?? []);
  const [spaceKey, setSpaceKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState(!initialSpace);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    initialSpace?.files.find((file) => file.workspaceMode !== 'SYNC')?.id ?? null
  );
  const [decryptedFileMap, setDecryptedFileMap] = useState<Record<string, string>>({});
  const [decryptedSecretMap, setDecryptedSecretMap] = useState<Record<string, string>>({});
  const [decryptedKingFileMap, setDecryptedKingFileMap] = useState<Record<string, string>>({});
  const prevKingFileContentRef = useRef<Record<string, string>>({});
  const [highlightedKingLines, setHighlightedKingLines] = useState<number[]>([]);
  const [decryptedKingSecretMap, setDecryptedKingSecretMap] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState('');
  const [draftFolderPath, setDraftFolderPath] = useState('/');
  const [draftContent, setDraftContent] = useState('');
  const [isAllTemplatesOpen, setIsAllTemplatesOpen] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isCreatingDraftFile, setIsCreatingDraftFile] = useState(false);
  const [isCreatingDraftSecret, setIsCreatingDraftSecret] = useState(false);
  const [forkingKingFileId, setForkingKingFileId] = useState<string | null>(null);
  const [forkingKingSecretId, setForkingKingSecretId] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isImportProjectOpen, setIsImportProjectOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newSecretOpen, setNewSecretOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFilePath, setNewFilePath] = useState('/');
  const [newFileContent, setNewFileContent] = useState('');
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderVisibility, setNewFolderVisibility] = useState<'PERSONAL' | 'KING'>('PERSONAL');
  const [newFolderDomain, setNewFolderDomain] = useState<'FILE' | 'SECRET'>('FILE');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [pendingKingFolderVote, setPendingKingFolderVote] = useState<{ id: string; path: string } | null>(null);
  const [activePeerPayload, setActivePeerPayload] = useState<{
    mine: string;
    theirs: string;
    kingText: string;
    peerLabel: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState('workspace');
  const [selectedMergeRequestId, setSelectedMergeRequestId] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    kingText: string;
    proposedText: string;
  } | null>(null);
  const [isSubmittingMergeRequest, setIsSubmittingMergeRequest] = useState(false);
  const [duplicateMergeRequestPrompt, setDuplicateMergeRequestPrompt] = useState<DuplicateMergeRequestPrompt | null>(null);
  const [isReplacingMergeRequest, setIsReplacingMergeRequest] = useState(false);
  const [isReviewingMergeRequest, setIsReviewingMergeRequest] = useState(false);
  const [preserveFolderStructureOnApprove, setPreserveFolderStructureOnApprove] = useState(false);
  const [isRefreshingMergeRequests, setIsRefreshingMergeRequests] = useState(false);
  const [isRiskExpanded, setIsRiskExpanded] = useState(false);
  const [selectedVoteMemberIds, setSelectedVoteMemberIds] = useState<string[]>([]);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [isCallingReelection, setIsCallingReelection] = useState(false);
  const [isLeavingSpace, setIsLeavingSpace] = useState(false);
  const [newBundleOpen, setNewBundleOpen] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');
  const [isSavingBundle, setIsSavingBundle] = useState(false);
  const [officialHistoryOpen, setOfficialHistoryOpen] = useState(false);
  const [officialHistory, setOfficialHistory] = useState<KingFileHistoryItem[]>([]);
  const [officialHistoryPreview, setOfficialHistoryPreview] = useState<{ revisionId: string; text: string } | null>(null);
  const [isLoadingOfficialHistory, setIsLoadingOfficialHistory] = useState(false);
  const [repairingInviteTokens, setRepairingInviteTokens] = useState<string[]>([]);
  const [keypairMissing, setKeypairMissing] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [showHistoryRestoreConfirm, setShowHistoryRestoreConfirm] = useState<KingFileHistoryItem | null>(null);
  const [forkConflict, setForkConflict] = useState<{
    kingFile: KingFileView;
    workspaceFile: SpaceFile;
    kingText: string;
    workspaceText: string;
  } | null>(null);
  const [isCloningFile, setIsCloningFile] = useState(false);
  const [cloneRequestsSent, setCloneRequestsSent] = useState<CloneRequestData[]>([]);
  const [cloneRequestsReceived, setCloneRequestsReceived] = useState<CloneRequestData[]>([]);
  const [showClonePanel, setShowClonePanel] = useState(false);
  const [isSendingCloneRequest, setIsSendingCloneRequest] = useState(false);
  const [isApprovingCloneRequest, setIsApprovingCloneRequest] = useState(false);
  const [deleteConfirmFileId, setDeleteConfirmFileId] = useState<string | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ sourceId: string; sourceName: string } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope>('folder:/');
  const [kingScope, setKingScope] = useState<KingScope>('files:/');
  const [selectedKingFileId, setSelectedKingFileId] = useState<string | null>(null);
  const [selectedKingSecretId, setSelectedKingSecretId] = useState<string | null>(null);
  const backgroundRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSpaceRef = useRef<SpacePayload | null>(initialSpace ?? null);
  const cacheKey = `${spaceId}:${userId}`;

  useEffect(() => {
    latestSpaceRef.current = space;
  }, [space]);

  const workspaceFiles = useMemo(
    () => space?.files.filter((file) => file.workspaceMode !== 'SYNC') ?? [],
    [space?.files]
  );
  const workspaceSecrets = useMemo(
    () => space?.secrets.filter((secret) => secret.workspaceMode !== 'SYNC') ?? [],
    [space?.secrets]
  );
  const selectedFile = useMemo(
    () => workspaceFiles.find((file) => file.id === selectedFileId) ?? null,
    [workspaceFiles, selectedFileId]
  );
  const selectedMergeRequest = useMemo(
    () => mergeRequests.find((request) => request.id === selectedMergeRequestId) ?? null,
    [mergeRequests, selectedMergeRequestId]
  );
  const selectedMergeRequestRisk = useMemo(
    () => (selectedMergeRequest ? summarizeMergeRequestRisk(selectedMergeRequest, mergePreview) : null),
    [mergePreview, selectedMergeRequest]
  );
  const selectedFileBundleIds = useMemo(
    () =>
      selectedFile
        ? space?.bundles
            .filter((bundle) => bundle.members.some((member) => member.userFileId === selectedFile.id))
            .map((bundle) => bundle.id) ?? []
        : [],
    [selectedFile, space]
  );
  const votingCandidates = useMemo(
    () => (space?.members ?? []).filter((member) => member.id !== space?.myMembership.id),
    [space]
  );
  const folderSuggestions = useMemo(() => buildFolderSuggestions(workspaceFiles), [workspaceFiles]);
  const suggestedPreset = useMemo(() => getSuggestedPresetByFilename(newFileName), [newFileName]);
  const personalFileFolders = useMemo(() => {
    const folders = new Set<string>(folderSuggestions);
    for (const folder of space?.folders ?? []) {
      if (folder.visibility === 'PERSONAL' && folder.domain === 'FILE') {
        folders.add(folder.path);
      }
    }
    return sortPaths(folders);
  }, [folderSuggestions, space?.folders]);
  const kingFileFolders = useMemo(() => {
    const folders = new Set<string>(['/']);
    for (const folder of space?.folders ?? []) {
      if (folder.visibility === 'KING' && folder.domain === 'FILE') {
        folders.add(folder.path);
      }
    }
    for (const file of space?.officialFiles ?? []) {
      folders.add(normalizeClientSpacePath(file.folderPath));
    }
    return sortPaths(folders);
  }, [space?.folders, space?.officialFiles]);
  const kingSecretFolders = useMemo(() => {
    const folders = new Set<string>(['/']);
    for (const folder of space?.folders ?? []) {
      if (folder.visibility === 'KING' && folder.domain === 'SECRET') {
        folders.add(folder.path);
      }
    }
    for (const secret of space?.officialSecrets ?? []) {
      folders.add(normalizeClientSpacePath(secret.folderPath));
    }
    return sortPaths(folders);
  }, [space?.folders, space?.officialSecrets]);
  const activeFolderPath = useMemo(
    () => (workspaceScope.startsWith('folder:') ? workspaceScope.slice('folder:'.length) || '/' : '/'),
    [workspaceScope]
  );
  const kingMode = useMemo(() => (kingScope.startsWith('files:') ? 'files' : 'secrets'), [kingScope]);
  const activeKingPath = useMemo(
    () => (kingMode === 'files' ? kingScope.slice('files:'.length) : kingScope.slice('secrets:'.length)) || '/',
    [kingMode, kingScope]
  );
  const visibleWorkspaceFiles = useMemo(
    () => workspaceFiles.filter((file) => normalizeClientSpacePath(file.folderPath) === activeFolderPath),
    [activeFolderPath, workspaceFiles]
  );
  const workspaceFolders = useMemo(
    () => [...new Set(workspaceFiles.map(f => normalizeClientSpacePath(f.folderPath)))].sort(),
    [workspaceFiles]
  );
  const kingFiles = useMemo(() => {
    return [...(space?.officialFiles ?? [])].sort((left, right) =>
      `${left.folderPath}/${left.name}`.localeCompare(`${right.folderPath}/${right.name}`)
    );
  }, [space?.officialFiles]);
  const kingSecrets = useMemo(() => {
    return [...(space?.officialSecrets ?? [])].sort((left, right) => left.keyName.localeCompare(right.keyName));
  }, [space?.officialSecrets]);
  const visibleKingFiles = useMemo(
    () => kingFiles.filter((file) => normalizeClientSpacePath(file.folderPath) === activeKingPath),
    [activeKingPath, kingFiles]
  );
  const visibleKingSecrets = useMemo(
    () => kingSecrets.filter((secret) => normalizeClientSpacePath(secret.folderPath) === activeKingPath),
    [activeKingPath, kingSecrets]
  );
  const selectedKingFile = useMemo(
    () => kingFiles.find((file) => file.id === selectedKingFileId) ?? null,
    [kingFiles, selectedKingFileId]
  );
  const selectedKingSecret = useMemo(
    () => kingSecrets.find((secret) => secret.id === selectedKingSecretId) ?? null,
    [kingSecrets, selectedKingSecretId]
  );
  const isElectionActive = !!space?.governance.activeElection;
  const mustVote = !!space?.governance.activeElection && !space.governance.activeElection.hasCurrentUserVoted;

  function syncWorkspace(nextSpace: SpacePayload, nextRequests: MergeRequestPayload[], nextSpaceKey: CryptoKey | null = spaceKey) {
    setSpace(nextSpace);
    setMergeRequests(nextRequests);
    setSpaceKey(nextSpaceKey);
    workspaceCache.set(cacheKey, {
      space: nextSpace,
      mergeRequests: nextRequests,
      spaceKey: nextSpaceKey,
    });
  }

  function getLatestWorkspaceState() {
    const cached = workspaceCache.get(cacheKey);
    return {
      space: cached?.space ?? space,
      mergeRequests: cached?.mergeRequests ?? mergeRequests,
    };
  }

  function queueBackgroundRefresh(delay = 1200) {
    if (backgroundRefreshTimerRef.current) {
      clearTimeout(backgroundRefreshTimerRef.current);
    }
    backgroundRefreshTimerRef.current = setTimeout(() => {
      backgroundRefreshTimerRef.current = null;
      void loadSpace({ background: true });
    }, delay);
  }

  function applyFileDraftPreset(preset: (typeof FILE_DRAFT_PRESETS)[number]) {
    setNewFileName((current) => (current.trim() ? current : preset.name));
    setNewFileContent((current) => (current.trim() ? current : preset.content));
  }

  function replaceOptimisticFile(tempId: string, nextFile: SpaceFile, plaintext: string) {
    const latest = getLatestWorkspaceState();
    if (!latest.space) return;
    syncWorkspace(
      {
        ...latest.space,
        files: latest.space.files.map((file) => (file.id === tempId ? nextFile : file)),
      },
      latest.mergeRequests
    );
    setSelectedFileId(nextFile.id);
    setDecryptedFileMap((current) => {
      const next = { ...current, [nextFile.id]: plaintext };
      delete next[tempId];
      return next;
    });
  }

  function replaceOptimisticSecret(tempId: string, nextSecret: SpaceSecret, plaintext: string) {
    const latest = getLatestWorkspaceState();
    if (!latest.space) return;
    syncWorkspace(
      {
        ...latest.space,
        secrets: latest.space.secrets.map((secret) => (secret.id === tempId ? nextSecret : secret)),
      },
      latest.mergeRequests
    );
    setDecryptedSecretMap((current) => {
      const next = { ...current, [nextSecret.id]: plaintext };
      delete next[tempId];
      return next;
    });
  }

  function updateInviteLocally(
    inviteToken: string,
    updater: (invite: SpacePayload['pendingInvites'][number]) => SpacePayload['pendingInvites'][number]
  ) {
    const latest = getLatestWorkspaceState();
    if (!latest.space) return;
    syncWorkspace(
      {
        ...latest.space,
        pendingInvites: latest.space.pendingInvites.map((invite) =>
          invite.inviteToken === inviteToken ? updater(invite) : invite
        ),
      },
      latest.mergeRequests
    );
  }

  function applyImportedProject(payload: ImportProjectClientPayload) {
    const latest = getLatestWorkspaceState();
    if (!latest.space) {
      return;
    }

    const filesById = new Map(latest.space.files.map((file) => [file.id, file]));
    for (const file of payload.result.files) {
      filesById.set(file.id, file);
    }

    const secretsById = new Map(latest.space.secrets.map((secret) => [secret.id, secret]));
    for (const secret of payload.result.secrets) {
      secretsById.set(secret.id, secret);
    }

    const foldersById = new Map(latest.space.folders.map((folder) => [folder.id, folder]));
    for (const folder of payload.result.folders) {
      foldersById.set(folder.id, folder);
    }

    syncWorkspace(
      {
        ...latest.space,
        files: sortWorkspaceFiles(Array.from(filesById.values())),
        secrets: sortWorkspaceSecrets(Array.from(secretsById.values())),
        folders: sortSpaceFolders(Array.from(foldersById.values())),
      },
      latest.mergeRequests
    );

    setDecryptedFileMap((current) => {
      const next = { ...current };
      for (const file of payload.result.files) {
        const key = `${normalizeClientSpacePath(file.folderPath)}::${file.name}`;
        const plaintext = payload.decryptedFiles[key];
        if (plaintext !== undefined) {
          next[file.id] = plaintext;
        }
      }
      return next;
    });

    setDecryptedSecretMap((current) => {
      const next = { ...current };
      for (const secret of payload.result.secrets) {
        const key = `${normalizeClientSpacePath(secret.folderPath)}::${secret.keyName}`;
        const plaintext = payload.decryptedSecrets[key];
        if (plaintext !== undefined) {
          next[secret.id] = plaintext;
        }
      }
      return next;
    });

    setWorkspaceScope(`folder:${payload.result.rootFolderPath}`);
    if (payload.result.files.length > 0) {
      setSelectedFileId(payload.result.files[0].id);
    }
  }

  async function loadSpace(options?: { background?: boolean }) {
    const background = options?.background ?? false;
    if (!background) setIsLoading(true);
    try {
      const [spaceRes, requestsRes] = await Promise.all([
        fetch(`/api/spaces/${spaceId}?fresh=1`, { cache: 'no-store' }),
        fetch(`/api/spaces/${spaceId}/merge-requests?fresh=1`, { cache: 'no-store' }),
      ]);
      const [spacePayload, requestsPayload] = await Promise.all([
        spaceRes.json(),
        requestsRes.json(),
      ]);
      if (!spaceRes.ok) throw new Error(spacePayload.error || 'Could not load private space');
      if (!requestsRes.ok) throw new Error(requestsPayload.error || 'Could not load merge requests');

      let decryptedSpaceKey = spaceKey ?? workspaceCache.get(cacheKey)?.spaceKey ?? null;
      if (!decryptedSpaceKey) {
        try {
          decryptedSpaceKey = await decryptSpaceKeyForCurrentUser(
            spacePayload.myMembership.encryptedSpaceKey,
            userId
          );
          setKeypairMissing(false);
        } catch {
          setKeypairMissing(true);
        }
      }

      const latestRequests = workspaceCache.get(cacheKey)?.mergeRequests ?? mergeRequests;
      const reconciledRequests = reconcileMergeRequestLists(
        requestsPayload,
        latestRequests,
        userId
      );

      syncWorkspace(spacePayload, reconciledRequests, decryptedSpaceKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load private space');
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }

  async function refreshMergeRequestsNow() {
    setIsRefreshingMergeRequests(true);
    try {
      await loadSpace({ background: true });
      toast.success('Merge requests refetched');
    } catch {
      // loadSpace handles its own error toast
    } finally {
      setIsRefreshingMergeRequests(false);
    }
  }

  async function refreshKingFilesNow() {
    setIsRefreshingMergeRequests(true);
    try {
      await loadSpace({ background: true });
      toast.success('Official files refetched');
    } catch {
      // loadSpace handles its own error toast
    } finally {
      setIsRefreshingMergeRequests(false);
    }
  }

  useEffect(() => {
    setHighlightedKingLines([]);
  }, [selectedKingFile?.id]);

  useEffect(() => {
    const cached = workspaceCache.get(cacheKey);
    if (cached) {
      setSpace(cached.space);
      setMergeRequests(cached.mergeRequests);
      setSpaceKey(cached.spaceKey);
      setIsLoading(false);
      void loadSpace({ background: true });
      return;
    }
    if (initialSpace) {
      workspaceCache.set(cacheKey, {
        space: initialSpace,
        mergeRequests: initialMergeRequests ?? [],
        spaceKey: null,
      });
      setIsLoading(false);
      return;
    }
    void loadSpace();
  }, [cacheKey, initialMergeRequests, initialSpace, spaceId]);

  useEffect(() => {
    if (!space || spaceKey) return;
    decryptSpaceKeyForCurrentUser(space.myMembership.encryptedSpaceKey, userId)
      .then((decrypted) => {
        setKeypairMissing(false);
        setSpaceKey(decrypted);
        workspaceCache.set(cacheKey, {
          space,
          mergeRequests,
          spaceKey: decrypted,
        });
      })
      .catch(() => {
        setKeypairMissing(true);
      });
  }, [cacheKey, mergeRequests, space, spaceKey, userId]);

  useEffect(() => {
    if (workspaceFiles.length === 0) return;
    if (!selectedFileId || !workspaceFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(workspaceFiles[0].id);
    }
  }, [selectedFileId, workspaceFiles]);

  useEffect(() => {
    if (workspaceScope === 'secrets') return;
    if (visibleWorkspaceFiles.length === 0) {
      setSelectedFileId(null);
      return;
    }
    if (!selectedFileId || !visibleWorkspaceFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(visibleWorkspaceFiles[0].id);
    }
  }, [selectedFileId, visibleWorkspaceFiles, workspaceScope]);

  useEffect(() => {
    if (kingMode !== 'files') return;
    if (visibleKingFiles.length === 0) {
      setSelectedKingFileId(null);
      return;
    }
    if (!selectedKingFileId || !visibleKingFiles.some((file) => file.id === selectedKingFileId)) {
      setSelectedKingFileId(visibleKingFiles[0].id);
    }
  }, [kingMode, selectedKingFileId, visibleKingFiles]);

  useEffect(() => {
    if (kingMode !== 'secrets') return;
    if (visibleKingSecrets.length === 0) {
      setSelectedKingSecretId(null);
      return;
    }
    if (!selectedKingSecretId || !visibleKingSecrets.some((secret) => secret.id === selectedKingSecretId)) {
      setSelectedKingSecretId(visibleKingSecrets[0].id);
    }
  }, [kingMode, selectedKingSecretId, visibleKingSecrets]);

  const selectedFilePlaintext = selectedFile ? decryptedFileMap[selectedFile.id] : undefined;

  useEffect(() => {
    if (!selectedFile || !spaceKey) return;
    const cached = selectedFilePlaintext;
    if (cached !== undefined) {
      setDraftName(selectedFile.name);
      setDraftFolderPath(selectedFile.folderPath);
      setDraftContent(cached);
      return;
    }

    decryptSecret(selectedFile.contentEncrypted, selectedFile.iv, spaceKey)
      .then((plaintext) => {
        setDecryptedFileMap((current) => ({ ...current, [selectedFile.id]: plaintext }));
        setDraftName(selectedFile.name);
        setDraftFolderPath(selectedFile.folderPath);
        setDraftContent(plaintext);
      })
      .catch(() => {
        toast.error(`Could not decrypt ${selectedFile.name}`);
      });
  }, [selectedFile, selectedFilePlaintext, spaceKey]);

  useEffect(() => {
    if (!spaceKey || !space) return;
    const missingSecrets = workspaceSecrets.filter((secret) => decryptedSecretMap[secret.id] === undefined);
    if (missingSecrets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missingSecrets.map(async (secret) => [
        secret.id,
        await decryptSecret(secret.valueEncrypted, secret.iv, spaceKey),
      ] as const)
    )
      .then((entries) => {
        if (cancelled) return;
        setDecryptedSecretMap((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [decryptedSecretMap, space, spaceKey, workspaceSecrets]);

  useEffect(() => {
    if (!selectedKingFile || !spaceKey || decryptedKingFileMap[selectedKingFile.updatedAt] !== undefined) return;
    decryptSecret(selectedKingFile.contentEncrypted, selectedKingFile.iv, spaceKey)
      .then((plaintext) => {
        setDecryptedKingFileMap((current) => ({ ...current, [selectedKingFile.updatedAt]: plaintext }));
        
        const oldContent = prevKingFileContentRef.current[selectedKingFile.id];
        if (oldContent !== undefined && oldContent !== plaintext) {
          const changes = diffLines(oldContent, plaintext);
          let currentLineIndex = 0;
          const newHighlights: number[] = [];
          for (const part of changes) {
            if (part.added) {
              for (let i = 0; i < part.count!; i++) {
                newHighlights.push(currentLineIndex + i);
              }
              currentLineIndex += part.count!;
            } else if (!part.removed) {
              currentLineIndex += part.count!;
            }
          }
          if (newHighlights.length > 0) {
            setHighlightedKingLines(newHighlights);
            setTimeout(() => {
              setHighlightedKingLines([]);
            }, 6000);
          }
        }
        prevKingFileContentRef.current[selectedKingFile.id] = plaintext;
      })
      .catch(() => {
        toast.error(`Could not decrypt official file ${selectedKingFile.name}`);
      });
  }, [decryptedKingFileMap, selectedKingFile, spaceKey]);

  useEffect(() => {
    if (!selectedKingSecret || !spaceKey || decryptedKingSecretMap[selectedKingSecret.id] !== undefined) return;
    decryptSecret(selectedKingSecret.valueEncrypted, selectedKingSecret.iv, spaceKey)
      .then((plaintext) => {
        setDecryptedKingSecretMap((current) => ({ ...current, [selectedKingSecret.id]: plaintext }));
      })
      .catch(() => {
        toast.error(`Could not decrypt official secret ${selectedKingSecret.keyName}`);
      });
  }, [decryptedKingSecretMap, selectedKingSecret, spaceKey]);

  useEffect(() => {
    if (!mergeRequests.length) {
      setSelectedMergeRequestId(null);
      return;
    }
    if (!selectedMergeRequestId || !mergeRequests.some((request) => request.id === selectedMergeRequestId)) {
      setSelectedMergeRequestId(mergeRequests[0].id);
    }
  }, [mergeRequests, selectedMergeRequestId]);

  useEffect(() => {
    if (!spaceKey || !selectedMergeRequest) {
      setMergePreview(null);
      return;
    }

    const run = async () => {
      if (selectedMergeRequest.resourceType === 'FILE') {
        if (!selectedMergeRequest.currentKing) {
          const proposedText = await decryptSecret(
            selectedMergeRequest.proposedData,
            selectedMergeRequest.iv,
            spaceKey
          );
          setMergePreview({ kingText: '', proposedText });
          return;
        }

        if (!('contentEncrypted' in selectedMergeRequest.currentKing)) {
          setMergePreview(null);
          return;
        }

        const [kingText, proposedText] = await Promise.all([
          decryptSecret(
            selectedMergeRequest.currentKing.contentEncrypted,
            selectedMergeRequest.currentKing.iv,
            spaceKey
          ),
          decryptSecret(selectedMergeRequest.proposedData, selectedMergeRequest.iv, spaceKey),
        ]);
        setMergePreview({ kingText, proposedText });
        return;
      }

      if (!selectedMergeRequest.currentKing) {
        const proposedText = await decryptSecret(selectedMergeRequest.proposedData, selectedMergeRequest.iv, spaceKey);
        setMergePreview({ kingText: '', proposedText });
        return;
      }

      if ('valueEncrypted' in selectedMergeRequest.currentKing) {
        const [kingText, proposedText] = await Promise.all([
          decryptSecret(
            selectedMergeRequest.currentKing.valueEncrypted,
            selectedMergeRequest.currentKing.iv,
            spaceKey
          ),
          decryptSecret(selectedMergeRequest.proposedData, selectedMergeRequest.iv, spaceKey),
        ]);
        setMergePreview({ kingText, proposedText });
      }
    };

    run().catch(() => {
      setMergePreview(null);
      toast.error('Could not decrypt merge request preview');
    });
  }, [selectedMergeRequest, spaceKey]);

  useEffect(() => {
    setPreserveFolderStructureOnApprove(false);
  }, [selectedMergeRequestId]);

  useEffect(() => {
    if (!mustVote) {
      setSelectedVoteMemberIds([]);
    }
  }, [mustVote]);

  useEffect(() => {
    return () => {
      if (backgroundRefreshTimerRef.current) {
        clearTimeout(backgroundRefreshTimerRef.current);
      }
    };
  }, []);

  async function repairInvite(invite: { recipientEmail: string; inviteToken: string }) {
    if (!spaceKey) return;
    setRepairingInviteTokens(prev => [...prev, invite.inviteToken]);
    try {
      const lookupRes = await fetch(`/api/users/vault-key?email=${encodeURIComponent(invite.recipientEmail)}`);
      const lookup = await lookupRes.json();
      if (!lookupRes.ok || !lookup.hasVaultKey) {
        toast.error(`${invite.recipientEmail} hasn't set up their vault key yet`);
        return;
      }
      const encryptedSpaceKey = await encryptSpaceKeyForMember(spaceKey, lookup.vaultPublicKey);
      const res = await fetch(`/api/spaces/invite/${invite.inviteToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedSpaceKey, encryptedSpaceKeyAlgorithm: lookup.vaultPublicKeyAlgorithm }),
      });
      if (!res.ok) throw new Error('Could not complete invite');
      toast.success(`Invite for ${invite.recipientEmail} is now ready`);
      updateInviteLocally(invite.inviteToken, (currentInvite) => ({
        ...currentInvite,
        hasEncryptedSpaceKey: true,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not repair invite');
    } finally {
      setRepairingInviteTokens(prev => prev.filter(t => t !== invite.inviteToken));
    }
  }

  useEffect(() => {
    if (!spaceKey || !space) return;

    const repairableInvites = space.pendingInvites.filter(
      (invite) => !invite.hasEncryptedSpaceKey && !repairingInviteTokens.includes(invite.inviteToken)
    );

    if (repairableInvites.length === 0) return;

    setRepairingInviteTokens((current) => [
      ...current,
      ...repairableInvites.map((invite) => invite.inviteToken).filter((token) => !current.includes(token)),
    ]);

    let cancelled = false;

    void Promise.all(
      repairableInvites.map(async (invite) => {
        const lookupRes = await fetch(`/api/users/vault-key?email=${encodeURIComponent(invite.recipientEmail)}`);
        const lookup = await lookupRes.json();
        if (!lookupRes.ok || !lookup.hasVaultKey) {
          return false;
        }

        const encryptedSpaceKey = await encryptSpaceKeyForMember(spaceKey, lookup.vaultPublicKey);
        const res = await fetch(`/api/spaces/invite/${invite.inviteToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedSpaceKey,
            encryptedSpaceKeyAlgorithm: lookup.vaultPublicKeyAlgorithm,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Could not refresh invitation key');
        }

        return true;
      })
    )
      .then((results) => {
        if (cancelled) return;
        const latest = getLatestWorkspaceState();
        if (results.some(Boolean) && latest.space) {
          const repairedTokens = repairableInvites
            .filter((_, index) => results[index])
            .map((invite) => invite.inviteToken);
          syncWorkspace(
            {
              ...latest.space,
              pendingInvites: latest.space.pendingInvites.map((invite) =>
                repairedTokens.includes(invite.inviteToken)
                  ? { ...invite, hasEncryptedSpaceKey: true }
                  : invite
              ),
            },
            latest.mergeRequests
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setRepairingInviteTokens((current) =>
          current.filter((token) => !repairableInvites.some((invite) => invite.inviteToken === token))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [repairingInviteTokens, space, spaceKey]);

  useEffect(() => {
    const source = new EventSource(`/api/spaces/${spaceId}/events`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') return;

        if (payload.type === 'file-moved') {
          const targetFile = latestSpaceRef.current?.files.find((file) => file.kingFileId === payload.kingFileId);
          if (!targetFile) return;
          toast(`${payload.actorName} moved ${payload.fileName} to ${payload.newFolderPath}`, {
            action: {
              label: 'Follow move',
              onClick: async () => {
                const res = await fetch(`/api/spaces/${spaceId}/my-files/${targetFile.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ folderPath: payload.newFolderPath }),
                });
                if (!res.ok) { toast.error('Could not follow move'); return; }
                toast.success('Folder path updated');
                loadSpace({ background: true });
              },
            },
          });
          return;
        }

        if (payload.type === 'MERGE_REQUEST_CREATED') {
          toast.success(`${payload.actorName || 'Someone'} submitted a merge request`, {
            action: { label: 'View', onClick: () => setActiveTab('merge-requests') },
          });
          loadSpace({ background: true });
          return;
        }

        if (payload.type === 'MERGE_REQUEST_APPROVED' || payload.type === 'MERGE_REQUEST_MERGED') {
          const verb = payload.type === 'MERGE_REQUEST_MERGED' ? 'merged' : 'approved';
          toast.success(`${payload.actorName || 'Someone'} ${verb} a merge request`, {
            action: { label: 'View', onClick: () => setActiveTab('merge-requests') },
          });
          loadSpace({ background: true });
          return;
        }

        if (payload.type === 'MERGE_REQUEST_REJECTED') {
          toast(`${payload.actorName || 'Someone'} rejected a merge request`);
          loadSpace({ background: true });
          return;
        }

        if (payload.type === 'MEMBER_JOINED') {
          toast.success(`${payload.actorName || 'Someone'} joined the space`);
          loadSpace({ background: true });
          return;
        }
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects. On reconnect, do a background sync.
      setTimeout(() => {
        if (source.readyState === EventSource.OPEN) {
          loadSpace({ background: true });
        }
      }, 2000);
    };

    return () => {
      source.close();
    };
  }, [spaceId]);

  async function forkOfficialFile(file: KingFileView) {
    if (!space || forkingKingFileId) return;

    const existingWorkspaceFile = space.files.find(f => f.kingFileId === file.id);
    if (existingWorkspaceFile && spaceKey) {
      try {
        const [kingPlaintext, wsPlaintext] = await Promise.all([
          decryptSecret(file.contentEncrypted, file.iv, spaceKey),
          (async () => {
            if (decryptedFileMap[existingWorkspaceFile.id]) return decryptedFileMap[existingWorkspaceFile.id];
            return decryptSecret(existingWorkspaceFile.contentEncrypted, existingWorkspaceFile.iv, spaceKey);
          })(),
        ]);
        if (kingPlaintext === wsPlaintext) {
          toast.info('Your workspace file is already up to date with the King file.');
          return;
        }
        setForkConflict({
          kingFile: file,
          workspaceFile: existingWorkspaceFile,
          kingText: kingPlaintext,
          workspaceText: wsPlaintext,
        });
        return;
      } catch {
        // Fall through to normal fork if decryption fails
      }
    }

    return doForkOfficialFile(file);
  }

  async function saveFileWithContent(content: string) {
    if (!selectedFile || !spaceKey) return;
    setIsSavingFile(true);
    const previousSpace = space;
    try {
      const encrypted = await encryptSecret(content, spaceKey);
      setDraftContent(content);
      setDecryptedFileMap((current) => ({ ...current, [selectedFile.id]: content }));
      if (previousSpace) {
        syncWorkspace({
          ...previousSpace,
          files: previousSpace.files.map((file) =>
            file.id === selectedFile.id
              ? { ...file, contentEncrypted: encrypted.valueEncrypted, iv: encrypted.iv, updatedAt: new Date().toISOString() }
              : file
          ),
        }, mergeRequests);
      }
      const res = await fetch(`/api/spaces/${spaceId}/my-files/${selectedFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentEncrypted: encrypted.valueEncrypted, iv: encrypted.iv }),
      });
      if (!res.ok) throw new Error('Could not save file');
      toast.success('Fork updated');
    } catch (error) {
      if (previousSpace) syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not save file');
    } finally {
      setIsSavingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedFile || !spaceKey) return;
    setIsSavingFile(true);
    const previousSpace = space;
    try {
      const encrypted = await encryptSecret(draftContent, spaceKey);
      if (previousSpace) {
        const optimisticSpace = {
          ...previousSpace,
          files: previousSpace.files.map((file) =>
            file.id === selectedFile.id
              ? {
                  ...file,
                  name: draftName,
                  folderPath: draftFolderPath,
                  contentEncrypted: encrypted.valueEncrypted,
                  iv: encrypted.iv,
                  updatedAt: new Date().toISOString(),
                }
              : file
          ),
        };
        syncWorkspace(optimisticSpace, mergeRequests);
      }
      setDecryptedFileMap((current) => ({ ...current, [selectedFile.id]: draftContent }));
      const res = await fetch(`/api/spaces/${spaceId}/my-files/${selectedFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          folderPath: draftFolderPath,
          contentEncrypted: encrypted.valueEncrypted,
          iv: encrypted.iv,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save file');

      if (previousSpace) {
        syncWorkspace(
          {
            ...previousSpace,
            files: previousSpace.files.map((file) =>
              file.id === selectedFile.id
                ? {
                    ...file,
                    ...payload,
                    folderPath: normalizeClientSpacePath(payload.folderPath ?? draftFolderPath),
                  }
                : file
            ),
          },
          mergeRequests
        );
      }

      toast.success('Your fork was updated');
      queueBackgroundRefresh();
    } catch (error) {
      if (previousSpace) {
        syncWorkspace(previousSpace, mergeRequests);
      }
      toast.error(error instanceof Error ? error.message : 'Could not save file');
    } finally {
      setIsSavingFile(false);
    }
  }

  async function createLocalDraft() {
    if (!spaceKey || !space || !newFileName.trim() || isCreatingDraftFile) return;
    const previousSpace = space;
    try {
      setIsCreatingDraftFile(true);
      const normalizedName = newFileName.trim();
      const normalizedPath = normalizeClientSpacePath(newFilePath);
      const hasConflict = space.files.some(
        (file) => normalizeClientSpacePath(file.folderPath) === normalizedPath && file.name === normalizedName
      );
      if (hasConflict) {
        throw new Error('A draft file with this name already exists in this folder.');
      }

      const encrypted = await encryptSecret(newFileContent, spaceKey);
      const tempFileId = `temp-file-${Date.now()}`;
      const optimisticFile: SpaceFile = {
        id: tempFileId,
        kingFileId: null,
        workspaceMode: 'DRAFT',
        name: normalizedName,
        contentEncrypted: encrypted.valueEncrypted,
        iv: encrypted.iv,
        folderPath: normalizedPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kingFile: null,
        peers: [],
      };

      syncWorkspace(
        {
          ...space,
          files: [...space.files, optimisticFile],
        },
        mergeRequests
      );
      setWorkspaceScope(`folder:${normalizedPath}`);
      setSelectedFileId(optimisticFile.id);
      setDecryptedFileMap((current) => ({ ...current, [optimisticFile.id]: newFileContent }));

      const res = await fetch(`/api/spaces/${spaceId}/my-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          folderPath: normalizedPath,
          contentEncrypted: encrypted.valueEncrypted,
          iv: encrypted.iv,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not create local draft');

      replaceOptimisticFile(
        tempFileId,
        {
          ...payload,
          folderPath: normalizeClientSpacePath(payload.folderPath),
          kingFile: null,
          peers: [],
        },
        newFileContent
      );

      toast.success('Local draft created');
      setNewFileName('');
      setNewFilePath('/');
      setNewFileContent('');
      setNewFileOpen(false);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not create local draft');
    } finally {
      setIsCreatingDraftFile(false);
    }
  }

  async function createLocalDraftSecret() {
    if (!spaceKey || !space || !newSecretName.trim() || isCreatingDraftSecret) return;
    const previousSpace = space;
    try {
      setIsCreatingDraftSecret(true);
      const normalizedKeyName = newSecretName.trim();
      const secretFolderPath = normalizeClientSpacePath(workspaceScope === 'secrets' ? '/' : activeFolderPath);
      const hasConflict = space.secrets.some(
        (secret) => normalizeClientSpacePath(secret.folderPath) === secretFolderPath && secret.keyName === normalizedKeyName
      );
      if (hasConflict) {
        throw new Error('A draft secret with this key already exists in this folder.');
      }

      const encrypted = await encryptSecret(newSecretValue, spaceKey);
      const tempSecretId = `temp-secret-${Date.now()}`;
      const optimisticSecret: SpaceSecret = {
        id: tempSecretId,
        kingSecretId: null,
        workspaceMode: 'DRAFT',
        keyName: normalizedKeyName,
        valueEncrypted: encrypted.valueEncrypted,
        iv: encrypted.iv,
        folderPath: secretFolderPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kingSecret: null,
      };

      syncWorkspace(
        {
          ...space,
          secrets: [...space.secrets, optimisticSecret],
        },
        mergeRequests
      );
      setDecryptedSecretMap((current) => ({ ...current, [optimisticSecret.id]: newSecretValue }));

      const res = await fetch(`/api/spaces/${spaceId}/my-secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyName: normalizedKeyName,
          valueEncrypted: encrypted.valueEncrypted,
          iv: encrypted.iv,
          folderPath: secretFolderPath,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not create local draft secret');

      replaceOptimisticSecret(
        tempSecretId,
        {
          ...payload,
          kingSecret: null,
        },
        newSecretValue
      );

      toast.success('Local draft secret created');
      setNewSecretName('');
      setNewSecretValue('');
      setNewSecretOpen(false);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not create local draft secret');
    } finally {
      setIsCreatingDraftSecret(false);
    }
  }

  async function handleInviteApproval(inviteId: string, action: 'APPROVE' | 'REJECT') {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/invite/${inviteId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Could not process');
      toast.success(action === 'APPROVE' ? 'Invite approved and sent' : 'Invite rejected');
      loadSpace({ background: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not process request');
    }
  }

  async function cloneWorkspaceFile(fileId: string) {
    setIsCloningFile(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/my-files/${fileId}/clone`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not clone file');
      const cloned = await res.json();
      const clonedFile = { ...cloned, kingFileId: null as string | null, kingFile: null as SpaceFile['kingFile'], peers: [] };
      syncWorkspace({ ...space!, files: [...space!.files, clonedFile] }, mergeRequests);
      toast.success(`Cloned as ${cloned.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not clone file');
    } finally {
      setIsCloningFile(false);
    }
  }

  async function deleteWorkspaceFile(fileId: string) {
    setIsDeletingFile(true);
    const previousSpace = space;
    try {
      if (previousSpace) {
        syncWorkspace({
          ...previousSpace,
          files: previousSpace.files.filter(f => f.id !== fileId),
          bundles: previousSpace.bundles.map(b => ({ ...b, members: b.members.filter(m => m.userFileId !== fileId) })),
        }, mergeRequests);
      }
      const res = await fetch(`/api/spaces/${spaceId}/my-files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete file');
      toast.success('File deleted');
      if (selectedFileId === fileId) setSelectedFileId(null);
      setDeleteConfirmFileId(null);
    } catch (err) {
      if (previousSpace) syncWorkspace(previousSpace, mergeRequests);
      toast.error(err instanceof Error ? err.message : 'Could not delete file');
    } finally {
      setIsDeletingFile(false);
    }
  }

  async function mergeCopyIntoBase(sourceFileId: string, deleteAfter: boolean) {
    if (!spaceKey || !space) return;
    const sourceFile = space.files.find(f => f.id === sourceFileId);
    if (!sourceFile) return;
    const baseName = sourceFile.name.replace(/(-copy)(-\d+)?(\.[^.]+)?$/, '$3');
    const baseFile = space.files.find(f =>
      f.id !== sourceFileId && f.name === baseName && f.folderPath === sourceFile.folderPath
    );
    if (!baseFile) { toast.error('Base file not found'); return; }

    setIsMerging(true);
    try {
      let sourceText = decryptedFileMap[sourceFile.id];
      if (!sourceText) sourceText = await decryptSecret(sourceFile.contentEncrypted, sourceFile.iv, spaceKey);
      const encrypted = await encryptSecret(sourceText, spaceKey);
      setDraftContent(sourceText);
      setDecryptedFileMap(c => ({ ...c, [baseFile.id]: sourceText }));

      const prev = space;
      syncWorkspace({
        ...space,
        files: space.files
          .filter(f => !(deleteAfter && f.id === sourceFileId))
          .map(f => f.id === baseFile.id ? { ...f, contentEncrypted: encrypted.valueEncrypted, iv: encrypted.iv, updatedAt: new Date().toISOString() } : f),
      }, mergeRequests);

      const res = await fetch(`/api/spaces/${spaceId}/my-files/${baseFile.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentEncrypted: encrypted.valueEncrypted, iv: encrypted.iv }),
      });
      if (!res.ok) throw new Error('Could not merge');
      if (deleteAfter) await fetch(`/api/spaces/${spaceId}/my-files/${sourceFileId}`, { method: 'DELETE' });
      if (selectedFileId === baseFile.id || selectedFileId === sourceFileId) setSelectedFileId(baseFile.id);
      toast.success(deleteAfter ? 'Merged and deleted copy' : 'Merged into base file');
      setMergeTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not merge');
    } finally {
      setIsMerging(false);
    }
  }

  function handleFileDrop(e: React.DragEvent, targetFolder: string) {
    e.preventDefault();
    setDragOverFolder(null);
    const fileId = e.dataTransfer.getData('workspace-file-id');
    if (fileId) moveFileToFolder(fileId, targetFolder);
  }

  async function moveFileToFolder(fileId: string, newFolderPath: string) {
    if (!space) return;
    const file = space.files.find(f => f.id === fileId);
    if (!file || file.folderPath === newFolderPath) return;
    const prev = space;
    syncWorkspace({ ...space, files: space.files.map(f => f.id === fileId ? { ...f, folderPath: newFolderPath } : f) }, mergeRequests);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/my-files/${fileId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: newFolderPath }),
      });
      if (!res.ok) throw new Error('Could not move');
      toast.success(`Moved to ${newFolderPath}`);
    } catch (err) {
      syncWorkspace(prev!, mergeRequests);
      toast.error(err instanceof Error ? err.message : 'Could not move');
    }
  }

  async function fetchCloneRequests() {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/clone-requests`);
      if (!res.ok) return;
      const data = await res.json();
      setCloneRequestsSent(data.sent || []);
      setCloneRequestsReceived(data.received || []);
    } catch { /* skip */ }
  }

  async function sendCloneRequest(sourceMemberId: string, type: 'STRUCTURE' | 'CONTENT') {
    setIsSendingCloneRequest(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/clone-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMemberId, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not send request');
      }
      toast.success('Clone request sent');
      await fetchCloneRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setIsSendingCloneRequest(false);
    }
  }

  async function handleCloneRequestAction(requestId: string, action: 'APPROVE' | 'REJECT') {
    setIsApprovingCloneRequest(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/clone-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Could not process request');
      toast.success(action === 'APPROVE' ? 'Content shared with requester' : 'Request rejected');
      if (action === 'APPROVE') {
        loadSpace({ background: true });
      }
      await fetchCloneRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not process request');
    } finally {
      setIsApprovingCloneRequest(false);
    }
  }

  async function doForkOfficialFile(file: KingFileView) {
    if (!space || forkingKingFileId) return;
    setForkingKingFileId(file.id);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/my-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kingFileId: file.id,
          folderPath: file.folderPath,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not fork official file');

      const nextFile: SpaceFile = {
        ...payload,
        folderPath: normalizeClientSpacePath(payload.folderPath),
        kingFileId: file.id,
        kingFile: {
          id: file.id,
          name: file.name,
          folderPath: file.folderPath,
          updatedAt: file.updatedAt,
        },
        peers: [],
      };

      syncWorkspace(
        {
          ...space,
          files: space.files.some((entry) => entry.id === nextFile.id)
            ? space.files.map((entry) => (entry.id === nextFile.id ? nextFile : entry))
            : [...space.files, nextFile],
        },
        mergeRequests
      );

      if (spaceKey) {
        try {
          const plaintext = await decryptSecret(nextFile.contentEncrypted, nextFile.iv, spaceKey);
          setDecryptedFileMap((current) => ({ ...current, [nextFile.id]: plaintext }));
          setActiveTab('workspace');
          setWorkspaceScope(`folder:${nextFile.folderPath}`);
          setSelectedFileId(nextFile.id);
          toast.success('Official file forked into your workspace');
        } catch {
          toast.success('Official file forked. Import your keys on this device to open it.');
        }
      } else {
        toast.success('Official file forked. Import your keys on this device to open it.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not fork official file');
    } finally {
      setForkingKingFileId(null);
    }
  }

  async function forkOfficialSecret(secret: KingSecretView) {
    if (!space || forkingKingSecretId) return;
    setForkingKingSecretId(secret.id);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/my-secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kingSecretId: secret.id,
          folderPath: secret.folderPath,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not fork official secret');

      const nextSecret: SpaceSecret = {
        ...payload,
        folderPath: normalizeClientSpacePath(payload.folderPath),
        kingSecretId: secret.id,
        kingSecret: {
          id: secret.id,
          keyName: secret.keyName,
          folderPath: secret.folderPath,
          updatedAt: secret.updatedAt,
        },
      };

      syncWorkspace(
        {
          ...space,
          secrets: space.secrets.some((entry) => entry.id === nextSecret.id)
            ? space.secrets.map((entry) => (entry.id === nextSecret.id ? nextSecret : entry))
            : [...space.secrets, nextSecret],
        },
        mergeRequests
      );

      if (spaceKey) {
        try {
          const plaintext = await decryptSecret(nextSecret.valueEncrypted, nextSecret.iv, spaceKey);
          setDecryptedSecretMap((current) => ({ ...current, [nextSecret.id]: plaintext }));
          setActiveTab('workspace');
          setWorkspaceScope('secrets');
          toast.success('Official secret forked into your workspace');
        } catch {
          toast.success('Official secret forked. Import your keys on this device to open it.');
        }
      } else {
        toast.success('Official secret forked. Import your keys on this device to open it.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not fork official secret');
    } finally {
      setForkingKingSecretId(null);
    }
  }

  async function saveSecret(secret: SpaceSecret) {
    if (!spaceKey) return;
    const previousSpace = space;
    try {
      const plaintext = decryptedSecretMap[secret.id] ?? '';
      const encrypted = await encryptSecret(plaintext, spaceKey);
      if (previousSpace) {
        const optimisticSpace = {
          ...previousSpace,
          secrets: previousSpace.secrets.map((item) =>
            item.id === secret.id
              ? {
                  ...item,
                  valueEncrypted: encrypted.valueEncrypted,
                  iv: encrypted.iv,
                  updatedAt: new Date().toISOString(),
                }
              : item
          ),
        };
        syncWorkspace(optimisticSpace, mergeRequests);
      }
      const res = await fetch(`/api/spaces/${spaceId}/my-secrets/${secret.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valueEncrypted: encrypted.valueEncrypted,
          iv: encrypted.iv,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save secret');
      if (previousSpace) {
        syncWorkspace(
          {
            ...previousSpace,
            secrets: previousSpace.secrets.map((item) =>
              item.id === secret.id
                ? {
                    ...item,
                    ...payload,
                  }
                : item
            ),
          },
          mergeRequests
        );
      }
      toast.success(`${secret.keyName} updated`);
      queueBackgroundRefresh();
    } catch (error) {
      if (previousSpace) {
        syncWorkspace(previousSpace, mergeRequests);
      }
      toast.error(error instanceof Error ? error.message : 'Could not save secret');
    }
  }

  async function proposeSelectedFileToKing() {
    if (!selectedFile || !spaceKey) return;
    setIsSubmittingMergeRequest(true);
    const previousRequests = mergeRequests;
    try {
      const encrypted = await encryptSecret(draftContent, spaceKey);
      const requestBody = {
        resourceType: 'FILE' as const,
        kingResourceId: selectedFile.kingFileId,
        proposedData: encrypted.valueEncrypted,
        iv: encrypted.iv,
        proposedName: draftName,
        proposedFolderPath: draftFolderPath,
      };
      const optimisticRequestId = `temp-${Date.now()}`;
      const optimisticRequest: MergeRequestPayload = {
        id: optimisticRequestId,
        resourceType: 'FILE',
        status: 'PENDING',
        proposedData: encrypted.valueEncrypted,
        iv: encrypted.iv,
        proposedName: draftName,
        proposedFolderPath: draftFolderPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requester: {
          id: space!.myMembership.id,
          user: space!.myMembership.user,
        },
        approvals: [],
        memberCount: space!.governance.memberCount,
        requiredApprovals: space!.governance.isCouncilMode ? 2 : Math.max(0, space!.governance.memberCount - 1),
        currentKing: selectedFile.kingFile
          ? {
              id: selectedFile.kingFile.id,
              name: selectedFile.kingFile.name,
              contentEncrypted: selectedFile.contentEncrypted,
              iv: selectedFile.iv,
              folderPath: selectedFile.kingFile.folderPath,
              updatedAt: selectedFile.kingFile.updatedAt,
            }
          : null,
        canApprove: false,
        canReject: false,
        isRequester: true,
      };
      const optimisticRequests = [optimisticRequest, ...mergeRequests];
      setMergeRequests(optimisticRequests);
      if (space) {
        syncWorkspace(space, optimisticRequests);
      }
      setSelectedMergeRequestId(optimisticRequestId);
      setActiveTab('merge-requests');
      const res = await fetch(`/api/spaces/${spaceId}/merge-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 409 && payload?.code === 'PENDING_REQUEST_EXISTS' && payload?.duplicateRequest) {
          const previousText = await decryptSecret(
            payload.duplicateRequest.proposedData,
            payload.duplicateRequest.iv,
            spaceKey
          );
          setMergeRequests(previousRequests);
          if (space) {
            syncWorkspace(space, previousRequests);
          }
          setDuplicateMergeRequestPrompt({
            resourceType: 'FILE',
            existingRequest: payload.duplicateRequest,
            nextRequestBody: requestBody,
            previousText,
            nextText: draftContent,
            resourceLabel: draftName || selectedFile.name,
          });
          return;
        }
        throw new Error(payload.error || 'Could not propose file changes');
      }
      setMergeRequests((current) => {
        const next = current.map((request) =>
          request.id === optimisticRequestId
            ? {
                ...request,
                id: payload.id,
                status: payload.status ?? request.status,
                createdAt: payload.createdAt ?? request.createdAt,
                updatedAt: payload.createdAt ?? request.updatedAt,
              }
            : request
        );
        if (space) {
          syncWorkspace(space, next);
        }
        return next;
      });
      setSelectedMergeRequestId(payload.id);
      toast.success('Merge request created');
    } catch (error) {
      setMergeRequests(previousRequests);
      if (space) {
        syncWorkspace(space, previousRequests);
      }
      toast.error(error instanceof Error ? error.message : 'Could not create merge request');
    } finally {
      setIsSubmittingMergeRequest(false);
    }
  }

  async function proposeSecretToKing(secret: SpaceSecret) {
    if (!spaceKey) return;
    setIsSubmittingMergeRequest(true);
    const previousRequests = mergeRequests;
    try {
      const plaintext = decryptedSecretMap[secret.id] ?? '';
      const encrypted = await encryptSecret(plaintext, spaceKey);
      const requestBody = {
        resourceType: 'SECRET' as const,
        kingResourceId: secret.kingSecretId,
        proposedData: encrypted.valueEncrypted,
        iv: encrypted.iv,
        proposedName: secret.keyName,
        proposedFolderPath: secret.folderPath,
      };
      const optimisticRequestId = `temp-${Date.now()}`;
      const optimisticRequest: MergeRequestPayload = {
        id: optimisticRequestId,
        resourceType: 'SECRET',
        status: 'PENDING',
        proposedData: encrypted.valueEncrypted,
        iv: encrypted.iv,
        proposedName: secret.keyName,
        proposedFolderPath: secret.folderPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requester: {
          id: space!.myMembership.id,
          user: space!.myMembership.user,
        },
        approvals: [],
        memberCount: space!.governance.memberCount,
        requiredApprovals: space!.governance.isCouncilMode ? 2 : Math.max(0, space!.governance.memberCount - 1),
        currentKing: secret.kingSecret
          ? {
              id: secret.kingSecret.id,
              keyName: secret.kingSecret.keyName,
              folderPath: secret.kingSecret.folderPath,
              valueEncrypted: secret.valueEncrypted,
              iv: secret.iv,
              updatedAt: secret.kingSecret.updatedAt,
            }
          : null,
        canApprove: false,
        canReject: false,
        isRequester: true,
      };
      const optimisticRequests = [optimisticRequest, ...mergeRequests];
      setMergeRequests(optimisticRequests);
      if (space) {
        syncWorkspace(space, optimisticRequests);
      }
      setSelectedMergeRequestId(optimisticRequestId);
      setActiveTab('merge-requests');
      const res = await fetch(`/api/spaces/${spaceId}/merge-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 409 && payload?.code === 'PENDING_REQUEST_EXISTS' && payload?.duplicateRequest) {
          const previousText = await decryptSecret(
            payload.duplicateRequest.proposedData,
            payload.duplicateRequest.iv,
            spaceKey
          );
          setMergeRequests(previousRequests);
          if (space) {
            syncWorkspace(space, previousRequests);
          }
          setDuplicateMergeRequestPrompt({
            resourceType: 'SECRET',
            existingRequest: payload.duplicateRequest,
            nextRequestBody: requestBody,
            previousText,
            nextText: plaintext,
            resourceLabel: secret.keyName,
          });
          return;
        }
        throw new Error(payload.error || 'Could not propose secret changes');
      }
      setMergeRequests((current) => {
        const next = current.map((request) =>
          request.id === optimisticRequestId
            ? {
                ...request,
                id: payload.id,
                status: payload.status ?? request.status,
                createdAt: payload.createdAt ?? request.createdAt,
                updatedAt: payload.createdAt ?? request.updatedAt,
              }
            : request
        );
        if (space) {
          syncWorkspace(space, next);
        }
        return next;
      });
      setSelectedMergeRequestId(payload.id);
      toast.success('Merge request created');
    } catch (error) {
      setMergeRequests(previousRequests);
      if (space) {
        syncWorkspace(space, previousRequests);
      }
      toast.error(error instanceof Error ? error.message : 'Could not create merge request');
    } finally {
      setIsSubmittingMergeRequest(false);
    }
  }

  async function replacePendingMergeRequest() {
    if (!duplicateMergeRequestPrompt) return;
    setIsReplacingMergeRequest(true);
    const previousRequests = mergeRequests;
    try {
      const optimisticRequestId = `temp-${Date.now()}`;
      const optimisticRequest: MergeRequestPayload = {
        id: optimisticRequestId,
        resourceType: duplicateMergeRequestPrompt.resourceType,
        status: 'PENDING',
        proposedData: duplicateMergeRequestPrompt.nextRequestBody.proposedData,
        iv: duplicateMergeRequestPrompt.nextRequestBody.iv,
        proposedName: duplicateMergeRequestPrompt.nextRequestBody.proposedName ?? null,
        proposedFolderPath: duplicateMergeRequestPrompt.nextRequestBody.proposedFolderPath ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        requester: {
          id: space!.myMembership.id,
          user: space!.myMembership.user,
        },
        approvals: [],
        memberCount: space!.governance.memberCount,
        requiredApprovals: space!.governance.isCouncilMode ? 2 : Math.max(0, space!.governance.memberCount - 1),
        currentKing: previousRequests.find((request) => request.id === duplicateMergeRequestPrompt.existingRequest.id)?.currentKing ?? null,
        canApprove: false,
        canReject: false,
        isRequester: true,
      };

      const nextRequests = [
        optimisticRequest,
        ...previousRequests.filter((request) => request.id !== duplicateMergeRequestPrompt.existingRequest.id),
      ];
      setMergeRequests(nextRequests);
      if (space) {
        syncWorkspace(space, nextRequests);
      }
      setSelectedMergeRequestId(optimisticRequestId);
      setActiveTab('merge-requests');

      const res = await fetch(`/api/spaces/${spaceId}/merge-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...duplicateMergeRequestPrompt.nextRequestBody,
          replacePending: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not replace merge request');

      setMergeRequests((current) => {
        const replaced = current.map((request) =>
          request.id === optimisticRequestId
            ? {
                ...request,
                id: payload.id,
                status: payload.status ?? request.status,
                createdAt: payload.createdAt ?? request.createdAt,
                updatedAt: payload.createdAt ?? request.updatedAt,
              }
            : request
        );
        if (space) {
          syncWorkspace(space, replaced);
        }
        return replaced;
      });
      setSelectedMergeRequestId(payload.id);
      setDuplicateMergeRequestPrompt(null);
      toast.success('Previous pending request was replaced with your latest changes');
    } catch (error) {
      setMergeRequests(previousRequests);
      if (space) {
        syncWorkspace(space, previousRequests);
      }
      toast.error(error instanceof Error ? error.message : 'Could not replace merge request');
    } finally {
      setIsReplacingMergeRequest(false);
    }
  }

  async function reviewMergeRequest(action: 'APPROVE' | 'REJECT') {
    if (!selectedMergeRequest) return;
    setIsReviewingMergeRequest(true);
    const previousRequests = mergeRequests;
    const targetRequestId = selectedMergeRequest.id;
    try {
      if (action === 'REJECT') {
        setMergeRequests((current) =>
          current.map((request) =>
            request.id === targetRequestId
              ? { ...request, status: 'REJECTED', canApprove: false, canReject: false }
              : request
          )
        );
      } else {
        setMergeRequests((current) =>
          current.map((request) =>
            request.id === targetRequestId
              ? {
                  ...request,
                  approvals: [
                    ...request.approvals,
                    {
                      id: `temp-${Date.now()}`,
                      approvedAt: new Date().toISOString(),
                      preserveFolderStructure: preserveFolderStructureOnApprove,
                      member: {
                        id: space!.myMembership.id,
                        user: space!.myMembership.user,
                      },
                    },
                  ],
                  canApprove: false,
                  canReject: false,
                }
              : request
          )
        );
      }
      const res = await fetch(`/api/spaces/merge-requests/${targetRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          preserveFolderStructure: action === 'APPROVE' ? preserveFolderStructureOnApprove : false,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `Could not ${action.toLowerCase()} request`);
      setMergeRequests((current) =>
        current.map((request) =>
          request.id === targetRequestId
            ? {
                ...request,
                status: payload.status ?? request.status,
                updatedAt: payload.updatedAt ?? request.updatedAt,
                canApprove: false,
                canReject: false,
              }
            : request
        )
      );
      toast.success(
        action === 'APPROVE'
          ? payload.status === 'MERGED'
            ? 'Request approved and merged into the king resource'
            : 'Approval recorded'
          : 'Merge request rejected'
      );
      await loadSpace({ background: true });
    } catch (error) {
      setMergeRequests(previousRequests);
      toast.error(error instanceof Error ? error.message : `Could not ${action.toLowerCase()} request`);
    } finally {
      setIsReviewingMergeRequest(false);
    }
  }

  async function submitElectionVote() {
    if (!space?.governance.activeElection || selectedVoteMemberIds.length !== 3) return;
    const previousSpace = space;
    setIsSubmittingVote(true);
    const nextSpace = {
      ...space,
      governance: {
        ...space.governance,
        activeElection: {
          ...space.governance.activeElection,
          hasCurrentUserVoted: true,
          totalVotes: space.governance.activeElection.totalVotes + 1,
        },
      },
    };
    syncWorkspace(nextSpace, mergeRequests);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/elections/${space.governance.activeElection.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate1Id: selectedVoteMemberIds[0],
          candidate2Id: selectedVoteMemberIds[1],
          candidate3Id: selectedVoteMemberIds[2],
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not submit vote');
      toast.success('Vote submitted');
      queueBackgroundRefresh();
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not submit vote');
    } finally {
      setIsSubmittingVote(false);
    }
  }

  async function callReelection() {
    if (!space) return;
    const previousSpace = space;
    setIsCallingReelection(true);
    syncWorkspace(
      {
        ...space,
        governance: {
          ...space.governance,
          petitionCount: space.governance.petitionCount + 1,
        },
      },
      mergeRequests
    );
    try {
      const res = await fetch(`/api/spaces/${spaceId}/re-election-petition`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not file re-election petition');
      toast.success(payload.electionTriggered ? 'Re-election triggered' : 'Petition recorded');
      queueBackgroundRefresh();
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not file petition');
    } finally {
      setIsCallingReelection(false);
    }
  }

  async function leaveSpace() {
    setIsLeavingSpace(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/leave`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload.error || 'Could not leave private space');
        return;
      }
      toast.success('You left the private space');
      router.push('/spaces');
    } finally {
      setIsLeavingSpace(false);
    }
  }

  async function createBundle() {
    if (!space || !newBundleName.trim()) return;
    setIsSavingBundle(true);
    const previousSpace = space;
    const optimisticBundle: SpaceBundle = {
      id: `temp-bundle-${Date.now()}`,
      name: newBundleName.trim(),
      bundleType: 'CUSTOM',
      matchRule: null,
      sortOrder: space.bundles.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [],
    };

    syncWorkspace(
      {
        ...space,
        bundles: [...space.bundles, optimisticBundle],
      },
      mergeRequests
    );

    try {
      const res = await fetch(`/api/spaces/${spaceId}/bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBundleName.trim(),
          bundleType: 'CUSTOM',
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not create bundle');

      const latest = getLatestWorkspaceState();
      if (latest.space) {
        syncWorkspace(
          {
            ...latest.space,
            bundles: latest.space.bundles.map((bundle) => (bundle.id === optimisticBundle.id ? payload : bundle)),
          },
          latest.mergeRequests
        );
      }

      toast.success('Private bundle created');
      setNewBundleName('');
      setNewBundleOpen(false);
      queueBackgroundRefresh(1500);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not create bundle');
    } finally {
      setIsSavingBundle(false);
    }
  }

  async function createFolder() {
    if (!space || !newFolderName.trim()) return;
    setIsSavingFolder(true);
    const parentPath = newFolderVisibility === 'PERSONAL'
      ? (newFolderDomain === 'FILE' ? activeFolderPath : '/')
      : '/';
    try {
      const res = await fetch(`/api/spaces/${spaceId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: newFolderVisibility,
          domain: newFolderDomain,
          name: newFolderName.trim(),
          parentPath,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not create folder');

      const latest = getLatestWorkspaceState();
      if (latest.space) {
        syncWorkspace(
          {
            ...latest.space,
            folders: [
              ...latest.space.folders,
              {
                id: payload.id,
                visibility: payload.visibility,
                domain: payload.domain,
                name: payload.name,
                path: payload.path,
                parentId: payload.parentId,
                memberId: payload.memberId ?? null,
                createdAt: payload.createdAt,
                updatedAt: payload.updatedAt,
              },
            ],
          },
          latest.mergeRequests
        );
      }

      if (payload.visibility === 'PERSONAL' && payload.domain === 'FILE') {
        setWorkspaceScope(`folder:${payload.path}`);
      }
      toast.success('Folder created');
      setNewFolderName('');
      setNewFolderOpen(false);
      queueBackgroundRefresh(1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create folder');
    } finally {
      setIsSavingFolder(false);
    }
  }

  async function voteAgainstKingFolder(folderId: string) {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/folders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not vote against folder');
      toast.success(payload.rejected ? 'Folder vote passed. The king folder was undone.' : 'Vote recorded');
      queueBackgroundRefresh(1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not vote against folder');
    }
  }

  async function addSelectedFileToBundle(bundleId: string) {
    if (!space || !selectedFile || selectedFileBundleIds.includes(bundleId)) return;
    const previousSpace = space;

    syncWorkspace(
      {
        ...space,
        bundles: space.bundles.map((bundle) =>
          bundle.id === bundleId
            ? {
                ...bundle,
                members: [
                  ...bundle.members,
                  {
                    userFileId: selectedFile.id,
                    addedAt: new Date().toISOString(),
                  },
                ],
              }
            : bundle.members.some((member) => member.userFileId === selectedFile.id)
              ? {
                  ...bundle,
                  members: bundle.members.filter((member) => member.userFileId !== selectedFile.id),
                }
              : bundle
        ),
      },
      mergeRequests
    );

    try {
      const res = await fetch(`/api/spaces/${spaceId}/bundles/${bundleId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userFileId: selectedFile.id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not add file to bundle');
      toast.success('File added to your private bundle');
      queueBackgroundRefresh(1500);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not add file to bundle');
    }
  }

  async function removeFileFromBundle(bundleId: string, userFileId: string) {
    if (!space) return;
    const previousSpace = space;

    syncWorkspace(
      {
        ...space,
        bundles: space.bundles.map((bundle) =>
          bundle.id === bundleId
            ? {
                ...bundle,
                members: bundle.members.filter((member) => member.userFileId !== userFileId),
              }
            : bundle
        ),
      },
      mergeRequests
    );

    try {
      const res = await fetch(`/api/spaces/${spaceId}/bundles/${bundleId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userFileId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not remove file from bundle');
      toast.success('File removed from your private bundle');
      queueBackgroundRefresh(1500);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not remove file from bundle');
    }
  }

  async function deleteBundle(bundleId: string) {
    if (!space) return;
    const previousSpace = space;
    syncWorkspace(
      {
        ...space,
        bundles: space.bundles.filter((bundle) => bundle.id !== bundleId),
      },
      mergeRequests
    );

    try {
      const res = await fetch(`/api/spaces/${spaceId}/bundles/${bundleId}`, {
        method: 'DELETE',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not delete bundle');
      toast.success('Private bundle deleted');
      queueBackgroundRefresh(1500);
    } catch (error) {
      syncWorkspace(previousSpace, mergeRequests);
      toast.error(error instanceof Error ? error.message : 'Could not delete bundle');
    }
  }

  async function openOfficialHistory() {
    if (!selectedFile?.kingFileId) return;
    setIsLoadingOfficialHistory(true);
    setOfficialHistoryOpen(true);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/king-files/${selectedFile.kingFileId}/history`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not load official history');
      setOfficialHistory(payload.history ?? []);
      setOfficialHistoryPreview(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load official history');
      setOfficialHistoryOpen(false);
    } finally {
      setIsLoadingOfficialHistory(false);
    }
  }

  async function previewOfficialHistoryEntry(entry: KingFileHistoryItem) {
    if (!spaceKey) return;
    try {
      const text = await decryptSecret(entry.contentEncrypted, entry.iv, spaceKey);
      setOfficialHistoryPreview({ revisionId: entry.id, text });
    } catch {
      toast.error('Could not decrypt official history revision');
    }
  }

  async function restoreOfficialHistoryEntry(entry: KingFileHistoryItem) {
    setShowHistoryRestoreConfirm(entry);
  }

  async function confirmHistoryRestore() {
    const entry = showHistoryRestoreConfirm;
    if (!spaceKey || !selectedFile || !entry) return;
    try {
      const text = await decryptSecret(entry.contentEncrypted, entry.iv, spaceKey);
      setDraftName(entry.name);
      setDraftFolderPath(entry.folderPath);
      await saveFileWithContent(text);
      setOfficialHistoryOpen(false);
      setShowHistoryRestoreConfirm(null);
    } catch {
      toast.error('Could not restore official history revision');
    }
  }

  useEffect(() => {
    if (!space) return;
    workspaceCache.set(cacheKey, {
      space,
      mergeRequests,
      spaceKey,
    });
  }, [cacheKey, mergeRequests, space, spaceKey]);

  async function openPeerDiff(kingFileId: string | null, peerUserFileId: string) {
    if (!spaceKey || !selectedFile || !kingFileId) return;
    try {
      const res = await fetch(`/api/spaces/${spaceId}/peer-files/${kingFileId}`);
      const payload = (await res.json()) as PeerFilePayload[] | { error?: string };
      if (!res.ok || !Array.isArray(payload)) {
        throw new Error(!Array.isArray(payload) ? payload.error || 'Could not load peer version' : 'Could not load peer version');
      }

      const peer = payload.find((item) => item.id === peerUserFileId);
      if (!peer) throw new Error('Peer version not found');

      const theirs = await decryptSecret(peer.contentEncrypted, peer.iv, spaceKey);
      const mine = decryptedFileMap[selectedFile.id] ?? draftContent;
      const kingText = decryptedKingFileMap[kingFileId] ?? '';

      setActivePeerPayload({
        mine,
        theirs,
        kingText,
        peerLabel: peer.member.user.name || peer.member.user.email,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load peer diff');
    }
  }

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading private space...</div>;
  }

  if (!space) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Private space could not be loaded.</div>;
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 shadow-lg shadow-indigo-500/10"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-200">Private Space</p>
            </div>
            <h1 className="text-2xl font-bold text-white">{space.name}</h1>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-indigo-200 text-sm">
                <Users className="w-3.5 h-3.5" /> {space.members.length} members
              </span>
              <span className="flex items-center gap-1.5 text-indigo-200 text-sm">
                <Globe className="w-3.5 h-3.5" /> {new Set([...workspaceFiles.map(f => `${f.folderPath}/${f.name}`), ...kingFiles.map(f => `${f.folderPath}/${f.name}`)]).size + new Set([...workspaceSecrets.map(s => `${s.folderPath}/${s.keyName}`), ...kingSecrets.map(s => `${s.folderPath}/${s.keyName}`)]).size} resources
              </span>
            </div>
            {space.governance.isCouncilMode && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex -space-x-2">
                  {space.members.filter(m => space.governance.councilMemberIds.includes(m.id)).slice(0, 3).map(m => (
                    <div key={m.id} className="w-7 h-7 rounded-full ring-2 ring-amber-400 bg-amber-100 flex items-center justify-center">
                      <Crown className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                  ))}
                </div>
                <Badge className="bg-amber-400/20 text-amber-100 border-amber-400/30 hover:bg-amber-400/20">
                  <Crown className="mr-1 h-3 w-3" /> Iron Throne Active
                </Badge>
              </div>
            )}
            {isElectionActive && (
              <div className="mt-3">
                <Badge className="bg-white/10 text-white border-white/20">
                  <Vote className="mr-1 h-3 w-3" /> Election in Progress
                </Badge>
                {mustVote && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-amber-400/20 border border-amber-400/30">
                    <p className="text-xs text-amber-100 flex items-center gap-1.5">
                      <Swords className="w-3 h-3" />
                      You must vote — king-level actions are locked until the council is seated.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === 'workspace' && (
              <>
                <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-white/20" onClick={() => setIsImportProjectOpen(true)}>
                  <FolderGit2 className="mr-1.5 h-3.5 w-3.5" /> Import Project
                </Button>
                <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-white/20" onClick={() => setNewSecretOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Local Secret
                </Button>
                <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-white/20" onClick={() => { setNewFilePath(activeFolderPath); setNewFileOpen(true); }}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Local Draft
                </Button>
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setShowClonePanel(true); fetchCloneRequests(); }}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Clone from Peer
                </Button>
                <KeypairManager userId={userId} customButtonClass="text-white/70 hover:text-white hover:bg-white/10 border border-transparent" />
              </>
            )}

            {activeTab === 'king' && (
              <>
                <Button size="sm" className="bg-white text-indigo-700 hover:bg-indigo-50" onClick={() => setIsInviteOpen(true)} disabled={isElectionActive}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite Member
                </Button>
                {space.governance.isCouncilMode && (
                  <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-white/20" onClick={callReelection} disabled={isElectionActive || isCallingReelection}>
                    <Swords className="mr-1.5 h-3.5 w-3.5" /> Call Re-election
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={leaveSpace} disabled={isLeavingSpace}>
                  <LogOut className="mr-1.5 h-3.5 w-3.5" /> Leave Space
                </Button>
              </>
            )}

            {activeTab === 'bundles' && (
              <>
                <Button variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-white/20" onClick={() => setNewBundleOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Bundle
                </Button>
              </>
            )}

            {activeTab === 'merge-requests' && (
              <>
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={() => window.location.reload()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh Requests
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {keypairMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">New device detected</p>
              <p className="text-xs text-amber-700 mt-1">
                This space was encrypted with keys from another device. You can still browse the official king structure and fork resources, but you need this device&apos;s private keys to open encrypted contents. To access everything here, you can:
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-xs font-semibold text-amber-800">Option 1: Transfer keys</p>
                  <p className="text-[10px] text-amber-600 mt-0.5 mb-2">
                    Export keys from your original device and import them here.
                  </p>
                  <KeypairManager userId={userId} />
                </div>
                <div className="rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-xs font-semibold text-amber-800">Option 2: Request re-invite</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Ask a space admin to re-invite you. A new invite will be encrypted for this device.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {space.pendingInvites.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <MailCheck className="w-4 h-4" />
              Pending Invites ({space.pendingInvites.length})
            </p>
            {!spaceKey && (
              <span className="text-[10px] text-amber-600 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Unlock space key to complete invites
              </span>
            )}
          </div>
          <div className="space-y-2">
            {space.pendingInvites.map((invite) => {
              const isRepairing = repairingInviteTokens.includes(invite.inviteToken);
              const needsSignup = invite.recipientHasVaultKey === false;
              
              return (
                <div key={invite.id} className="flex items-center justify-between rounded-xl bg-white border border-amber-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-700">{invite.recipientEmail}</span>
                    {invite.status === 'PENDING_APPROVAL' ? (
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">Needs approval</Badge>
                    ) : invite.hasEncryptedSpaceKey ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Ready to accept</Badge>
                    ) : needsSignup ? (
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">Waiting for signup</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                        {spaceKey ? 'Needs completion' : 'Waiting for unlock'}
                      </Badge>
                    )}
                  </div>
                  {invite.status === 'PENDING_APPROVAL' ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleInviteApproval(invite.id, 'APPROVE')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 text-rose-600"
                        onClick={() => handleInviteApproval(invite.id, 'REJECT')}>
                        Reject
                      </Button>
                    </div>
                  ) : !invite.hasEncryptedSpaceKey && !needsSignup && spaceKey ? (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => repairInvite(invite)} disabled={isRepairing}>
                      {isRepairing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Complete Invite
                    </Button>
                  ) : !invite.hasEncryptedSpaceKey && !needsSignup && !spaceKey ? (
                    <span className="text-[10px] text-slate-400">Waiting for space key to decrypt</span>
                  ) : needsSignup ? (
                    <span className="text-[10px] text-slate-400">Recipient must create an account</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList className="bg-slate-100/50 p-2.5 rounded-[1.25rem] flex w-fit border border-slate-200/60 shadow-sm gap-2">
            <TabsTrigger value="workspace" className="px-7 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-700 font-semibold transition-all text-slate-500 hover:text-slate-700">Workspace</TabsTrigger>
            <TabsTrigger value="king" className="px-7 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-amber-700 font-semibold transition-all text-slate-500 hover:text-slate-700 flex items-center">
              King
              {(kingFiles.length > 0 || kingSecrets.length > 0) && (
                <Badge className="ml-2.5 bg-amber-100 text-amber-800 hover:bg-amber-100 px-1.5 py-0.5 text-[10px]">
                  {kingFiles.length + kingSecrets.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="bundles" className="px-7 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-700 font-semibold transition-all text-slate-500 hover:text-slate-700 flex items-center">
              Bundles
              {space.bundles.length > 0 && (
                <Badge className="ml-2.5 bg-slate-200 text-slate-700 hover:bg-slate-200 px-1.5 py-0.5 text-[10px]">
                  {space.bundles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="merge-requests" className="px-7 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-700 font-semibold transition-all text-slate-500 hover:text-slate-700 flex items-center">
              Merge Requests
              {mergeRequests.filter((request) => request.status === 'PENDING').length > 0 && (
                <Badge className="ml-2.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 px-1.5 py-0.5 text-[10px]">
                  {mergeRequests.filter((request) => request.status === 'PENDING').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl border-slate-200 bg-white"
            onClick={activeTab === 'king' ? refreshKingFilesNow : refreshMergeRequestsNow}
            disabled={isRefreshingMergeRequests}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingMergeRequests ? 'animate-spin' : ''}`} />
            {isRefreshingMergeRequests ? 'Refetching...' : 'Refetch'}
          </Button>
        </div>

        <TabsContent value="workspace">
          <div className="h-[calc(100vh-220px)] flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <aside className="w-72 shrink-0 border-r border-slate-100 bg-slate-50/40">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Database className="h-3.5 w-3.5" />
                  Structure
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setNewFolderVisibility('PERSONAL');
                      setNewFolderDomain(workspaceScope === 'secrets' ? 'SECRET' : 'FILE');
                      setNewFolderOpen(true);
                    }}
                  >
                    <FolderKanban className="h-4 w-4 text-slate-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNewSecretOpen(true)}>
                    <KeyRound className="h-4 w-4 text-amber-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setNewFilePath(activeFolderPath); setNewFileOpen(true); }}>
                    <Plus className="h-4 w-4 text-indigo-600" />
                  </Button>
                </div>
              </div>
              <div className="space-y-4 overflow-y-auto p-3">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setWorkspaceScope('folder:/')}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold uppercase tracking-widest transition',
                      workspaceScope === 'folder:/'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-400 hover:bg-white hover:text-indigo-600'
                    )}
                  >
                    <Database className="h-3.5 w-3.5" />
                    Root
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceScope('secrets')}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold uppercase tracking-widest transition',
                      workspaceScope === 'secrets'
                        ? 'bg-amber-50 text-amber-700'
                        : 'text-slate-400 hover:bg-white hover:text-amber-700'
                    )}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Secrets
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Folders</div>
                  {personalFileFolders.map((folder) => {
                    if (folder === '/') return null;
                    const parts = folder.split('/').filter(Boolean);
                    let currentPath = '';
                    let isHidden = false;
                    for (let i = 0; i < parts.length - 1; i++) {
                      currentPath += '/' + parts[i];
                      if (collapsedFolders[currentPath]) {
                        isHidden = true;
                        break;
                      }
                    }
                    if (isHidden) return null;
                    
                    const hasChildren = personalFileFolders.some(f => f !== folder && f.startsWith(folder === '/' ? '/' : folder + '/'));
                    const isCollapsed = collapsedFolders[folder] ?? false;

                    return (
                      <div
                        key={folder}
                        className={cn(
                          'flex w-full items-center gap-1 rounded-md px-1 py-1 transition group',
                          workspaceScope === `folder:${folder}`
                            ? 'bg-indigo-50'
                            : 'hover:bg-slate-100/50',
                          dragOverFolder === folder ? 'ring-2 ring-indigo-400 bg-indigo-100/50' : ''
                        )}
                        style={{ paddingLeft: `${4 + Math.max(0, folder.split('/').filter(Boolean).length - 1) * 14}px` }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder); }}
                        onDragLeave={() => setDragOverFolder(null)}
                        onDrop={(e) => handleFileDrop(e, folder)}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (hasChildren) {
                              setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
                            }
                          }}
                          className={cn("p-0.5 rounded-sm hover:bg-slate-200 transition-colors shrink-0", !hasChildren && "opacity-0 cursor-default")}
                          disabled={!hasChildren}
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", !isCollapsed && "rotate-90")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkspaceScope(`folder:${folder}`)}
                          className={cn(
                            'flex-1 text-left text-sm truncate py-0.5',
                            workspaceScope === `folder:${folder}`
                              ? 'text-indigo-700 font-medium'
                              : 'text-slate-600 hover:text-indigo-600'
                          )}
                        >
                          {folder === '/' ? 'Root files' : folder.split('/').pop()}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {workspaceScope !== 'secrets' && (
                  <div className="space-y-1 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between px-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {activeFolderPath === '/' ? 'Root files' : `${activeFolderPath} files`}
                      </span>
                    </div>

                    {visibleWorkspaceFiles.map((file) => (
                      <div key={file.id} className="group/file relative">
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('workspace-file-id', file.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => setSelectedFileId(file.id)}
                          className={cn(
                            'w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150 flex items-center gap-2',
                            selectedFileId === file.id
                              ? 'border border-indigo-200 bg-indigo-50 shadow-sm'
                              : 'border border-transparent hover:border-slate-200 hover:bg-white'
                          )}
                        >
                          <span className="text-slate-300 opacity-0 group-hover/file:opacity-100 cursor-grab text-[10px] shrink-0">⋮⋮</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              {!file.kingFileId && (
                                <Badge variant="outline" className="h-4 border-amber-300 bg-amber-50 px-1.5 text-[9px] text-amber-700">Draft</Badge>
                              )}
                              <span className="text-[9px] text-slate-400">{file.folderPath}</span>
                              <span className="text-[9px] text-slate-300">{(file.peers?.length ?? 0)}p</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity shrink-0">
                            {file.name.includes('-copy') && (
                              <span
                                className="p-1 rounded text-[9px] text-indigo-500 hover:bg-indigo-50 cursor-pointer select-none"
                                onClick={(e) => { e.stopPropagation(); setMergeTarget({ sourceId: file.id, sourceName: file.name }); }}
                                role="button"
                                tabIndex={0}
                                title="Merge copy into base file"
                              >Merge</span>
                            )}
                            <span
                              className="p-1 rounded text-[9px] text-rose-500 hover:bg-rose-50 cursor-pointer select-none"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmFileId(file.id); }}
                              role="button"
                              tabIndex={0}
                              title="Delete file"
                            >Del</span>
                          </div>
                        </button>
                      </div>
                    ))}
                    {visibleWorkspaceFiles.length === 0 && (
                      <p className="px-2 py-4 text-xs italic text-slate-400">No files in this folder yet</p>
                    )}
                  </div>
                )}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{space.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <span className="font-semibold text-slate-900">
                    {workspaceScope === 'secrets' ? 'Secrets' : (activeFolderPath === '/' ? 'Root' : activeFolderPath)}
                  </span>
                </div>
              </div>
              <div className={cn("flex-1 p-6", workspaceScope === 'secrets' ? "overflow-y-auto" : "flex flex-col min-h-0")}>
              {workspaceScope === 'secrets' ? (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Private secrets</h2>
                    <p className="text-sm text-slate-500">Keep local secret drafts here, then promote them when ready.</p>
                  </div>
                  {workspaceSecrets.map((secret) => (
                    <div key={secret.id} className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{secret.keyName}</p>
                          {!secret.kingSecretId && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                              Draft
                            </Badge>
                          )}
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveSecret(secret)}>
                          <Save className="w-3 h-3 text-slate-400" />
                        </Button>
                      </div>
                      <Textarea
                        value={decryptedSecretMap[secret.id] ?? ''}
                        onChange={(e) => setDecryptedSecretMap((c) => ({ ...c, [secret.id]: e.target.value }))}
                        className="min-h-[80px] font-mono text-xs resize-none border-slate-100 bg-slate-50"
                        placeholder="Secret value..."
                      />
                      <Button size="sm" variant="ghost" className="mt-2 h-7 text-[10px] text-indigo-600 hover:text-indigo-700"
                        onClick={() => proposeSecretToKing(secret)} disabled={isSubmittingMergeRequest || isElectionActive}>
                        <GitPullRequestArrow className="mr-1 h-3 w-3" /> {secret.kingSecretId ? 'Propose' : 'Propose as Official Secret'}
                      </Button>
                    </div>
                  ))}
                  {workspaceSecrets.length === 0 && (
                    <div className="flex min-h-[300px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                      <div className="text-center">
                        <KeyRound className="mx-auto mb-3 h-8 w-8 text-amber-300" />
                        <p className="text-sm font-medium text-slate-500">No private secrets yet</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedFile ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between shrink-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{draftName || selectedFile.name}</h2>
                        {!selectedFile.kingFileId && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{draftFolderPath || selectedFile.folderPath} · your fork</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={openOfficialHistory}
                        disabled={!selectedFile.kingFileId}
                      >
                        <History className="w-3.5 h-3.5 mr-1" /> History
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs" onClick={proposeSelectedFileToKing} disabled={isSubmittingMergeRequest || isElectionActive}>
                        <GitPullRequestArrow className="w-3.5 h-3.5 mr-1" /> {selectedFile.kingFileId ? 'Propose' : 'Propose as Official File'}
                      </Button>
                      <Button size="sm" className="text-xs bg-indigo-600 hover:bg-indigo-700" onClick={saveFile} disabled={isSavingFile}>
                        <Save className="w-3.5 h-3.5 mr-1" /> {isSavingFile ? 'Saving' : 'Save'}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 shrink-0 mt-4">
                    <div className="flex gap-3">
                      <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-9 text-sm" placeholder="Name" />
                      <Input
                        value={draftFolderPath}
                        onChange={(e) => setDraftFolderPath(e.target.value)}
                        onBlur={() => setDraftFolderPath((current) => normalizeClientSpacePath(current))}
                        list="private-space-folder-suggestions"
                        className="h-9 text-sm"
                        placeholder="Path"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {personalFileFolders.slice(0, 8).map((folder) => (
                        <button
                          key={folder}
                          type="button"
                          onClick={() => setDraftFolderPath(folder)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[10px] transition-colors',
                            draftFolderPath === folder
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                          )}
                        >
                          {folder}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex border border-slate-200 rounded-xl overflow-hidden bg-white mt-4 relative focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-200 transition-all shadow-sm">
                    <div 
                      className="w-12 shrink-0 bg-slate-50 border-r border-slate-100 text-right pr-3 py-4 select-none overflow-hidden"
                      aria-hidden="true"
                    >
                      {draftContent.split('\n').map((_, i) => (
                        <div key={i} className="text-sm leading-[21px] text-slate-400 font-mono">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      className="flex-1 p-4 font-mono text-sm leading-[21px] resize-none outline-none bg-transparent overflow-auto"
                      wrap="off"
                      spellCheck={false}
                      onScroll={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        if (target.previousElementSibling) {
                          target.previousElementSibling.scrollTop = target.scrollTop;
                        }
                      }}
                    />
                  </div>
                  {selectedFile.peers?.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap shrink-0 mt-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Peers</span>
                      {selectedFile.peers.map((peer) => (
                        <button
                          key={peer.userFileId}
                          onClick={() => openPeerDiff(selectedFile.kingFileId, peer.userFileId)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-xs text-slate-600 transition-colors"
                        >
                          <Users className="w-3 h-3" />
                          {peer.name || peer.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center min-h-0 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                      <FolderKanban className="w-7 h-7 text-indigo-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Select a file to edit</p>
                    <p className="text-xs text-slate-400 mt-1">Your personal fork of each file lives here</p>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="king">
          <div className="h-[calc(100vh-220px)] flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <aside className="w-72 shrink-0 border-r border-slate-100 bg-slate-50/40">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Crown className="h-3.5 w-3.5 text-amber-600" />
                  Structure
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setNewFolderVisibility('KING');
                      setNewFolderDomain(kingMode === 'files' ? 'FILE' : 'SECRET');
                      setNewFolderOpen(true);
                    }}
                  >
                    <FolderKanban className="h-4 w-4 text-amber-700" />
                  </Button>
                </div>
              </div>
              <div className="space-y-4 overflow-y-auto p-3">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setKingScope('files:/')}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold uppercase tracking-widest transition',
                      kingMode === 'files' && activeKingPath === '/'
                        ? 'bg-amber-100 text-amber-900'
                        : 'text-slate-400 hover:bg-white hover:text-amber-700'
                    )}
                  >
                    <Database className="h-3.5 w-3.5" />
                    Root
                  </button>
                  <button
                    type="button"
                    onClick={() => setKingScope('secrets:/')}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold uppercase tracking-widest transition',
                      kingMode === 'secrets' && activeKingPath === '/'
                        ? 'bg-amber-100 text-amber-900'
                        : 'text-slate-400 hover:bg-white hover:text-amber-700'
                    )}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Secrets
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Folders</div>
                  {kingFileFolders.map((folder) => {
                    if (folder === '/') return null;
                    const folderRecord = space.folders.find((item) => item.visibility === 'KING' && item.domain === 'FILE' && item.path === folder);
                    return (
                      <div key={`king-file-${folder}`} className="group flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setKingScope(`files:${folder}`)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition',
                            kingMode === 'files' && activeKingPath === folder
                              ? 'bg-amber-100 text-amber-900'
                              : 'text-slate-600 hover:bg-white hover:text-amber-700'
                          )}
                          style={{ paddingLeft: `${8 + Math.max(0, folder.split('/').filter(Boolean).length - 1) * 14}px` }}
                        >
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <span className="truncate">{folder === '/' ? 'Root files' : folder.split('/').pop()}</span>
                        </button>
                        {folderRecord && folder !== '/' ? (
                          <button
                            type="button"
                            className="opacity-0 transition group-hover:opacity-100 text-[10px] font-medium text-rose-600 hover:text-rose-700"
                            onClick={() => setPendingKingFolderVote({ id: folderRecord.id, path: folder })}
                          >
                            Vote against
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Secret folders</div>
                  {kingSecretFolders.map((folder) => {
                    if (folder === '/') return null;
                    const folderRecord = space.folders.find((item) => item.visibility === 'KING' && item.domain === 'SECRET' && item.path === folder);
                    return (
                      <div key={`king-secret-${folder}`} className="group flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setKingScope(`secrets:${folder}`)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition',
                            kingMode === 'secrets' && activeKingPath === folder
                              ? 'bg-amber-100 text-amber-900'
                              : 'text-slate-600 hover:bg-white hover:text-amber-700'
                          )}
                          style={{ paddingLeft: `${8 + Math.max(0, folder.split('/').filter(Boolean).length - 1) * 14}px` }}
                        >
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <span className="truncate">{folder === '/' ? 'Root secrets' : folder.split('/').pop()}</span>
                        </button>
                        {folderRecord && folder !== '/' ? (
                          <button
                            type="button"
                            className="opacity-0 transition group-hover:opacity-100 text-[10px] font-medium text-rose-600 hover:text-rose-700"
                            onClick={() => setPendingKingFolderVote({ id: folderRecord.id, path: folder })}
                          >
                            Vote against
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{space.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <span className="font-medium text-slate-700">King</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <span className="font-semibold text-slate-900">
                    {kingMode === 'files' ? (activeKingPath === '/' ? 'Root' : activeKingPath) : `Secrets ${activeKingPath === '/' ? 'Root' : activeKingPath}`}
                  </span>
                </div>
                <Badge className="border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                  Official {kingMode === 'files' ? 'Files' : 'Secrets'}
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {kingMode === 'files' ? (
                  <div className="grid h-full gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900">Files</h2>
                          <p className="text-xs text-slate-500">Official files in this folder</p>
                        </div>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                          {visibleKingFiles.length}
                        </Badge>
                      </div>
                      <div className="flex-1 space-y-1 overflow-y-auto p-2">
                        {visibleKingFiles.map((file) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => setSelectedKingFileId(file.id)}
                            className={cn(
                              'w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                              selectedKingFileId === file.id
                                ? 'border border-amber-200 bg-amber-50 shadow-sm'
                                : 'border border-transparent hover:border-slate-200 hover:bg-white'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                              <Badge className="border border-amber-200 bg-amber-50 text-[9px] text-amber-800 hover:bg-amber-50">
                                King
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-400">{file.folderPath}</p>
                          </button>
                        ))}
                        {visibleKingFiles.length === 0 && (
                          <p className="px-2 py-4 text-xs italic text-slate-400">No official files in this folder yet</p>
                        )}
                      </div>
                    </div>

                    {selectedKingFile ? (
                      <div className="flex flex-col min-h-0 h-full gap-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shrink-0 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-900">{selectedKingFile.name}</h2>
                                <Badge className="border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">Official</Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">{selectedKingFile.folderPath} · king file</p>
                              <p className="mt-2 text-sm text-slate-500">
                                The official version lives here. Your editable fork remains in the workspace tab.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 shrink-0 shadow-sm"
                              onClick={() => forkOfficialFile(selectedKingFile)}
                              disabled={forkingKingFileId === selectedKingFile.id}
                            >
                              {forkingKingFileId === selectedKingFile.id ? 'Forking...' : 'Fork to workspace'}
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 flex border border-slate-200 rounded-xl overflow-auto bg-white shadow-sm relative">
                          <div 
                            className="w-12 shrink-0 sticky left-0 z-10 bg-amber-50/95 backdrop-blur-sm border-r border-slate-100 text-right pr-3 py-4 select-none"
                            aria-hidden="true"
                          >
                            {(decryptedKingFileMap[selectedKingFile.updatedAt] ?? '').split('\n').map((_, i) => (
                              <div key={i} className={cn(
                                "text-sm leading-[21px] font-mono transition-colors duration-1000",
                                highlightedKingLines.includes(i) ? "text-emerald-600 bg-emerald-50 -mr-3 pr-3" : "text-slate-400"
                              )}>
                                {i + 1}
                              </div>
                            ))}
                          </div>
                          <div className="flex-1 p-4 font-mono text-sm leading-[21px] text-slate-700 whitespace-pre">
                             {!decryptedKingFileMap[selectedKingFile.updatedAt] ? (
                               <div className="text-slate-400 italic font-sans text-sm">
                                 {spaceKey ? 'Official file content' : 'Import your private keys on this device to preview file content.'}
                               </div>
                             ) : (decryptedKingFileMap[selectedKingFile.updatedAt] ?? '').split('\n').map((line, i) => (
                               <div key={i} className={cn(
                                  "transition-colors duration-1000 -mx-4 px-4 min-w-max",
                                  highlightedKingLines.includes(i) ? "bg-emerald-50 text-emerald-900" : "bg-transparent"
                               )}>
                                 {line || '\n'}
                               </div>
                             ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[500px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                        <div className="text-center">
                          <Crown className="mx-auto mb-3 h-8 w-8 text-amber-300" />
                          <p className="text-sm font-medium text-slate-500">
                            {visibleKingFiles.length === 0 ? 'No official files in this folder' : 'Select a king file to preview'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900">Secrets</h2>
                          <p className="text-xs text-slate-500">Official secrets in this folder</p>
                        </div>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                          {visibleKingSecrets.length}
                        </Badge>
                      </div>
                      <div className="max-h-[540px] space-y-1 overflow-y-auto p-2">
                        {visibleKingSecrets.map((secret) => (
                          <button
                            key={secret.id}
                            type="button"
                            onClick={() => setSelectedKingSecretId(secret.id)}
                            className={cn(
                              'w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                              selectedKingSecretId === secret.id
                                ? 'border border-amber-200 bg-amber-50 shadow-sm'
                                : 'border border-transparent hover:border-slate-200 hover:bg-white'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-800">{secret.keyName}</p>
                              <Badge className="border border-amber-200 bg-amber-50 text-[9px] text-amber-800 hover:bg-amber-50">
                                King
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-400">{secret.folderPath}</p>
                          </button>
                        ))}
                        {visibleKingSecrets.length === 0 && (
                          <p className="px-2 py-4 text-xs italic text-slate-400">No official secrets in this folder yet</p>
                        )}
                      </div>
                    </div>

                    {selectedKingSecret ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-900">{selectedKingSecret.keyName}</h2>
                                <Badge className="border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">Official</Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">{selectedKingSecret.folderPath} · king secret</p>
                              <p className="mt-2 text-sm text-slate-500">
                                The official value is read-only here. Create and edit your fork in the workspace tab.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700"
                              onClick={() => forkOfficialSecret(selectedKingSecret)}
                              disabled={forkingKingSecretId === selectedKingSecret.id}
                            >
                              {forkingKingSecretId === selectedKingSecret.id ? 'Forking...' : 'Fork to workspace'}
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={decryptedKingSecretMap[selectedKingSecret.id] ?? ''}
                          readOnly
                          placeholder={spaceKey ? 'Official secret value' : 'Import your private keys on this device to preview secret content.'}
                          className="min-h-[360px] font-mono text-sm rounded-2xl border-slate-200 bg-slate-50"
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-[500px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                        <div className="text-center">
                          <KeyRound className="mx-auto mb-3 h-8 w-8 text-amber-300" />
                          <p className="text-sm font-medium text-slate-500">
                            {visibleKingSecrets.length === 0 ? 'No official secrets in this folder' : 'Select a king secret to preview'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bundles">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
                  <FolderKanban className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">My Bundles</p>
                <span className="text-[10px] text-slate-400">{space.bundles.length}</span>
              </div>
            </div>
            {space.bundles.length === 0 ? (
              <div className="flex items-center justify-center py-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
                    <FolderKanban className="w-6 h-6 text-violet-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No bundles created</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">Bundle your forked files together. Private to you only.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {space.bundles.map((bundle) => {
                  const bundleFiles = bundle.members
                    .map((m) => space.files.find((f) => f.id === m.userFileId))
                    .filter((f): f is SpaceFile => !!f);
                  return (
                    <div key={bundle.id} className="rounded-2xl border border-slate-200 bg-white hover:border-violet-200 hover:shadow-md transition-all duration-200 overflow-hidden group">
                      <div className="px-4 py-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                            <FolderKanban className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-sm font-semibold text-slate-800 truncate">{bundle.name}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteBundle(bundle.id)}>
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-rose-500" />
                        </Button>
                      </div>
                      <div className="p-3 space-y-1.5 min-h-[80px]">
                        {bundleFiles.length > 0 ? (
                          bundleFiles.map((file) => (
                            <div key={file.id} className="flex items-center gap-2 text-xs py-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-violet-300 shrink-0" />
                              <span className="text-slate-700 truncate">{file.name}</span>
                              <span className="text-slate-300 truncate hidden sm:inline">{file.folderPath}</span>
                              <button className="ml-auto text-[9px] text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onClick={() => removeFileFromBundle(bundle.id, file.id)}>
                                Remove
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400 italic py-2">Drop files here</p>
                        )}
                      </div>
                      {selectedFile && !bundle.members.some((m) => m.userFileId === selectedFile.id) && (
                        <div className="px-3 pb-3">
                          <Button size="sm" variant="ghost" className="w-full text-[10px] text-violet-600 hover:text-violet-700 hover:bg-violet-50 h-7"
                            onClick={() => addSelectedFileToBundle(bundle.id)}>
                            <Plus className="w-3 h-3 mr-1" /> Add &quot;{selectedFile.name}&quot;
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="merge-requests">
          {mergeRequests.length === 0 ? (
            <div className="flex items-center justify-center py-24 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <GitPullRequestArrow className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">No merge requests</p>
                <p className="text-xs text-slate-400 mt-1">Propose file or secret changes from your workspace</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] h-[calc(100vh-230px)]">
              <div className="flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
                  <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                    <GitPullRequestArrow className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Requests</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {mergeRequests.map((request) => {
                    const title =
                      request.resourceType === 'FILE'
                        ? request.currentKing && 'name' in request.currentKing
                          ? request.proposedName || request.currentKing.name : request.proposedName || 'File'
                        : request.currentKing && 'keyName' in request.currentKing
                          ? request.currentKing.keyName : request.proposedName || 'Secret';
                    const isSelected = selectedMergeRequestId === request.id;
                    return (
                      <button
                        key={request.id}
                        type="button"
                        onClick={() => { setSelectedMergeRequestId(request.id); setIsRiskExpanded(false); }}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                          isSelected ? 'bg-amber-50 border border-amber-200 shadow-sm' : 'border border-transparent hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                            request.status === 'PENDING' ? 'bg-amber-400' :
                            request.status === 'MERGED' ? 'bg-emerald-400' :
                            request.status === 'REJECTED' ? 'bg-rose-400' : 'bg-slate-300'
                          }`} />
                          <span className="text-[10px] text-slate-500">{request.status}</span>
                          <span className="text-[9px] text-slate-300 ml-auto">{request.approvals.length}/{request.requiredApprovals}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedMergeRequest ? (
                <div className="flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                  <div className="p-6 shrink-0 border-b border-slate-100">
                    {(() => {
                      const approvalCount = selectedMergeRequest.approvals.length;
                      const approvalThreshold = selectedMergeRequest.requiredApprovals;
                      const rejectionCount = selectedMergeRequest.status === 'REJECTED' ? 1 : 0;
                      const folderMoveRequiresVote = !!selectedMergeRequest.currentKing && !!selectedMergeRequestRisk?.stats.folderMoved;
                      const preserveVotes = selectedMergeRequest.approvals.filter((approval) => approval.preserveFolderStructure).length;
                      const preserveThreshold = Math.ceil(Math.max(approvalCount, 1) / 2);

                      return (
                        <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          {selectedMergeRequest.resourceType === 'FILE'
                            ? selectedMergeRequest.proposedName || 'File'
                            : selectedMergeRequest.proposedName || 'Secret'} proposal
                        </h2>
                        <p className="text-xs text-slate-400">
                          by {selectedMergeRequest.requester.user.name || selectedMergeRequest.requester.user.email}
                          <span className="mx-1.5 text-slate-300">·</span>
                          {approvalCount}/{approvalThreshold} approvals
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedMergeRequest.canReject && (
                          <Button size="sm" variant="outline" className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 h-8"
                            onClick={() => reviewMergeRequest('REJECT')} disabled={isReviewingMergeRequest || isElectionActive}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                          </Button>
                        )}
                        {selectedMergeRequest.canApprove && (
                          <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 h-8"
                            onClick={() => reviewMergeRequest('APPROVE')} disabled={isReviewingMergeRequest || isElectionActive}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <span className="font-semibold">Approval threshold</span>
                        <span className="ml-2">{approvalCount}/{approvalThreshold} approved</span>
                      </div>
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                        <span className="font-semibold">Rejections</span>
                        <span className="ml-2">{rejectionCount}</span>
                      </div>
                      {folderMoveRequiresVote && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <span className="font-semibold">Keep current folder</span>
                          <span className="ml-2">{preserveVotes}/{preserveThreshold} votes needed</span>
                        </div>
                      )}
                    </div>
                    {selectedMergeRequest.resourceType === 'FILE' && (
                      selectedMergeRequest.currentKing && 'name' in selectedMergeRequest.currentKing ? (
                        <div className="flex gap-3 text-xs mt-4">
                          <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                            <span className="text-slate-400">King</span>
                            <span className="text-slate-700 font-bold font-mono ml-2">
                              {selectedMergeRequest.currentKing.folderPath === '/' ? '' : selectedMergeRequest.currentKing.folderPath}/{selectedMergeRequest.currentKing.name}
                            </span>
                          </div>
                          <span className="text-slate-300 self-center">→</span>
                          <div className="flex-1 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                            <span className="text-indigo-400">Proposed</span>
                            <span className="text-indigo-700 font-bold font-mono ml-2">
                              {(selectedMergeRequest.proposedFolderPath || selectedMergeRequest.currentKing.folderPath) === '/' ? '' : (selectedMergeRequest.proposedFolderPath || selectedMergeRequest.currentKing.folderPath)}/{selectedMergeRequest.proposedName || selectedMergeRequest.currentKing.name}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs mt-4">
                          <span className="text-emerald-600">New Official File</span>
                          <span className="ml-2 font-bold font-mono text-emerald-800">
                            {(selectedMergeRequest.proposedFolderPath || '/') === '/' ? '' : (selectedMergeRequest.proposedFolderPath || '/')}/{selectedMergeRequest.proposedName || 'Untitled'}
                          </span>
                        </div>
                      )
                    )}
                    {selectedMergeRequest.resourceType === 'SECRET' && !selectedMergeRequest.currentKing && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs mt-4">
                        <span className="text-emerald-600">New Official Secret</span>
                        <span className="ml-2 font-mono text-emerald-800">
                          {selectedMergeRequest.proposedName || 'Unnamed'}
                        </span>
                      </div>
                    )}
                    {selectedMergeRequest.requester.user.id !== userId && selectedMergeRequestRisk && selectedMergeRequestRisk.summaries.length > 0 && (
                      <motion.div 
                        layout 
                        className="mt-4 flex flex-col cursor-pointer relative"
                        onClick={() => setIsRiskExpanded(!isRiskExpanded)}
                      >
                        {selectedMergeRequestRisk.summaries.map((summary, index) => (
                          <motion.div
                            layout
                            key={`${summary.level}-${index}`}
                            className={cn(
                              'rounded-xl border px-4 py-3 origin-top shadow-sm',
                              levelClasses(summary.level),
                              isRiskExpanded ? (index > 0 ? 'mt-2 relative' : 'relative z-10') : (index > 0 ? 'absolute top-0 inset-x-0' : 'relative z-10')
                            )}
                            style={{ zIndex: 10 - index }}
                            initial={false}
                            animate={{
                              scale: !isRiskExpanded && index > 0 ? 1 - index * 0.02 : 1,
                              y: !isRiskExpanded && index > 0 ? index * 8 : 0,
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-widest opacity-80">{summary.level} Priority</p>
                              {index === 0 && selectedMergeRequestRisk.summaries.length > 1 && (
                                <AnimatePresence>
                                  {!isRiskExpanded && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                      <Badge variant="outline" className="bg-white/50 text-slate-500 shadow-none pointer-events-none">
                                        +{selectedMergeRequestRisk.summaries.length - 1} risks
                                      </Badge>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              )}
                            </div>
                            <p className="mt-1 text-sm font-semibold">{summary.title}</p>
                            <p className="mt-1 text-xs leading-relaxed opacity-90">{summary.message}</p>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                    {selectedMergeRequest.currentKing && selectedMergeRequestRisk?.stats.folderMoved && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Preserve Current Folder Structure</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">
                              Approve the content, but cast your vote to keep the king resource in its current folder. If a majority of approvers choose this, the content will merge but the folder move will be ignored.
                            </p>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Current preserve votes: {selectedMergeRequest.approvals.filter((approval) => approval.preserveFolderStructure).length} / {Math.ceil(Math.max(selectedMergeRequest.approvals.length, 1) / 2)}
                            </p>
                          </div>
                          <Switch
                            checked={preserveFolderStructureOnApprove}
                            onCheckedChange={setPreserveFolderStructureOnApprove}
                            aria-label="Preserve current folder structure"
                            disabled={!selectedMergeRequest.canApprove || isReviewingMergeRequest}
                          />
                        </div>
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-h-0 bg-slate-50/50 p-6 overflow-hidden flex flex-col">
                    <div className="flex-1 min-h-0 rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                      <PlaintextDiff
                        original={mergePreview?.kingText ?? ''}
                        modified={mergePreview?.proposedText ?? ''}
                        originalLabel={selectedMergeRequest.currentKing ? 'Current official' : 'No current official file'}
                        modifiedLabel="Proposed change"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                      <GitPullRequestArrow className="w-7 h-7 text-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Select a request</p>
                    <p className="text-xs text-slate-400 mt-1">Review proposed changes side by side</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="sm:max-w-3xl border-indigo-100 shadow-xl shadow-indigo-500/10">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <FilePlus className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Create Local File Draft</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500">
                  Drafts are private to your workspace. You can perfect them locally before proposing an official merge request.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Starter Templates</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FILE_DRAFT_PRESETS.slice(0, 5).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyFileDraftPreset(preset)}
                    className={cn(
                      "rounded-xl border border-slate-200 bg-white p-3 text-left transition-all duration-200 shadow-sm",
                      "hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5",
                      newFileName === preset.name && normalizeClientSpacePath(newFilePath) === normalizeClientSpacePath(preset.folderPath)
                        ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/50" 
                        : ""
                    )}
                  >
                    <p className="text-sm font-bold text-slate-900">{preset.label}</p>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">{preset.description}</p>
                    <p className="mt-2.5 font-mono text-[10px] text-slate-400 font-medium">
                      {preset.folderPath === '/' ? 'Root' : preset.folderPath} / <span className="text-indigo-600 font-bold">{preset.name}</span>
                    </p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsAllTemplatesOpen(true)}
                  className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-3 transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/50 group"
                >
                  <FilePlus className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mb-2 transition-colors" />
                  <p className="text-sm font-bold text-slate-600 group-hover:text-indigo-700">See all templates</p>
                  <p className="mt-1 text-xs text-slate-400 group-hover:text-indigo-500/70">40+ Languages</p>
                </button>
              </div>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">File Name</p>
                <Input
                  placeholder="e.g. .env.local"
                  value={newFileName}
                  onChange={(event) => setNewFileName(event.target.value)}
                  className="font-mono text-sm bg-slate-50 focus-visible:ring-indigo-500 border-slate-200"
                />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Folder Path</p>
                <div className="relative">
                  <Input
                    placeholder="e.g. /config/frontend"
                    value={newFilePath}
                    onChange={(event) => setNewFilePath(event.target.value)}
                    onBlur={() => setNewFilePath((current) => normalizeClientSpacePath(current))}
                    className="font-mono text-sm bg-slate-50 focus-visible:ring-indigo-500 border-slate-200 pl-8"
                  />
                  <FolderKanban className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {personalFileFolders.slice(0, 8).map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setNewFilePath(folder)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
                      normalizeClientSpacePath(newFilePath) === folder
                        ? 'border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'
                    )}
                  >
                    {folder === '/' ? 'Root' : folder}
                  </button>
                ))}
              </div>
              {suggestedPreset && (
                <p className="text-xs text-indigo-600 font-medium flex items-center gap-1.5 mt-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Looks like a {suggestedPreset.label.toLowerCase()} file. Starter content is ready!
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">File Content</p>
              <div className="flex relative border border-slate-200 rounded-md bg-white overflow-hidden shadow-inner focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-200 transition-all min-h-[256px]">
                <div 
                  className="w-10 shrink-0 bg-slate-50 border-r border-slate-100 text-right pr-2 py-3 select-none overflow-hidden"
                  aria-hidden="true"
                >
                  {newFileContent.split('\n').map((_, i) => (
                    <div key={i} className="text-[13px] leading-relaxed font-mono text-slate-400">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  placeholder="Paste or type your configuration here..."
                  className="flex-1 font-mono text-[13px] leading-relaxed bg-transparent border-0 outline-none resize-none p-3 overflow-auto"
                  value={newFileContent}
                  onChange={(event) => setNewFileContent(event.target.value)}
                  wrap="off"
                  spellCheck={false}
                  onScroll={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    if (target.previousElementSibling) {
                      target.previousElementSibling.scrollTop = target.scrollTop;
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 pt-4 mt-2">
            <Button variant="ghost" className="hover:bg-slate-100" onClick={() => setNewFileOpen(false)}>Cancel</Button>
            <Button 
              onClick={createLocalDraft} 
              disabled={!newFileName.trim() || isCreatingDraftFile}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20"
            >
              {isCreatingDraftFile ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                <><FilePlus className="w-4 h-4 mr-2" /> Create Draft</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAllTemplatesOpen} onOpenChange={setIsAllTemplatesOpen}>
        <DialogContent className="sm:max-w-[800px] h-[85vh] flex flex-col p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-600" /> All Starter Templates
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-1">Select a template to start with boilerplate code and standard file paths.</p>
            </div>
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> {FILE_DRAFT_PRESETS.length} Languages
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FILE_DRAFT_PRESETS.map((preset) => (
                <button
                  key={`all-${preset.label}`}
                  type="button"
                  onClick={() => {
                    applyFileDraftPreset(preset);
                    setIsAllTemplatesOpen(false);
                  }}
                  className={cn(
                    "rounded-xl border border-slate-200 bg-white p-3 text-left transition-all duration-200 shadow-sm",
                    "hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5",
                    newFileName === preset.name && normalizeClientSpacePath(newFilePath) === normalizeClientSpacePath(preset.folderPath)
                      ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/50" 
                      : ""
                  )}
                >
                  <p className="text-sm font-bold text-slate-900">{preset.label}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed truncate">{preset.description}</p>
                  <p className="mt-2.5 font-mono text-[10px] text-slate-400 font-medium">
                    {preset.folderPath === '/' ? 'Root' : preset.folderPath} / <span className="text-indigo-600 font-bold truncate">{preset.name}</span>
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-white shrink-0 flex justify-end">
            <Button variant="ghost" onClick={() => setIsAllTemplatesOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newSecretOpen} onOpenChange={setNewSecretOpen}>
        <DialogContent className="sm:max-w-lg border-indigo-100 shadow-xl shadow-indigo-500/10">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Create Local Secret</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-500">
                  Securely store an environment secret locally before proposing it to the council.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Secret Key</p>
              <Input 
                placeholder="e.g. STRIPE_API_KEY" 
                value={newSecretName} 
                onChange={(event) => setNewSecretName(event.target.value)} 
                className="font-mono text-sm bg-slate-50 focus-visible:ring-indigo-500 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Secret Value</p>
              <Textarea 
                placeholder="sk_test_..."
                value={newSecretValue} 
                onChange={(event) => setNewSecretValue(event.target.value)} 
                className="font-mono text-sm min-h-32 bg-slate-50 focus-visible:ring-indigo-500 border-slate-200 resize-none shadow-inner"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 pt-4 mt-2">
            <Button variant="ghost" className="hover:bg-slate-100" onClick={() => setNewSecretOpen(false)}>Cancel</Button>
            <Button 
              onClick={createLocalDraftSecret} 
              disabled={!newSecretName.trim() || isCreatingDraftSecret}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20"
            >
              {isCreatingDraftSecret ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Save Secret</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderOpen} onOpenChange={(open) => {
        if (!open) setNewFolderName('');
        setNewFolderOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", newFolderVisibility === 'KING' ? "bg-amber-100" : "bg-indigo-100")}>
                {newFolderVisibility === 'KING' ? <Crown className="w-5 h-5 text-amber-600" /> : <FolderKanban className="w-5 h-5 text-indigo-600" />}
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {newFolderVisibility === 'KING' ? 'Create King Folder' : 'Create Personal Folder'}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {newFolderVisibility === 'KING'
                    ? 'Official folders are created instantly. If half the members vote against one, it gets undone.'
                    : 'Personal folders help you organize your private drafts and secrets before proposing them.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Folder Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  {newFolderDomain === 'SECRET' ? <KeyRound className="h-4 w-4 text-slate-400" /> : <Database className="h-4 w-4 text-slate-400" />}
                </div>
                <Input 
                  placeholder={newFolderDomain === 'SECRET' ? 'production-keys' : 'src/components'} 
                  value={newFolderName} 
                  onChange={(event) => setNewFolderName(event.target.value)} 
                  className={cn("pl-9 h-11 text-sm bg-slate-50", newFolderVisibility === 'KING' ? "focus-visible:ring-amber-500" : "focus-visible:ring-indigo-500")}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 ml-1">You can create nested folders like <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">backend/api</code></p>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 pt-3 mt-2">
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button 
              className={newFolderVisibility === 'KING' ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}
              onClick={() => {
                createFolder();
                // The cleanup will happen when dialog closes, or manually here if it doesn't close on error
              }} 
              disabled={isSavingFolder || !newFolderName.trim()}
            >
              {isSavingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingKingFolderVote} onOpenChange={(open) => !open && setPendingKingFolderVote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vote Against Folder Creation</DialogTitle>
            <DialogDescription>
              Are you sure you want to vote against creating this king folder?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {pendingKingFolderVote?.path}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingKingFolderVote(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!pendingKingFolderVote) return;
                const folderId = pendingKingFolderVote.id;
                setPendingKingFolderVote(null);
                await voteAgainstKingFolder(folderId);
              }}
            >
              Vote Against
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <datalist id="private-space-folder-suggestions">
        {personalFileFolders.map((folder) => (
          <option key={folder} value={folder} />
        ))}
      </datalist>

      <Dialog open={!!activePeerPayload} onOpenChange={(open) => !open && setActivePeerPayload(null)}>
        <DialogContent className="sm:max-w-6xl w-[95vw]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Peer Diff</DialogTitle>
                <DialogDescription className="mt-1">
                  Compare your current fork with <span className="font-semibold text-indigo-600">{activePeerPayload?.peerLabel ?? 'a peer'}</span> and merge their version into yours if needed.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {activePeerPayload && (
            <div className="space-y-4">
              {activePeerPayload.mine === activePeerPayload.theirs ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border rounded-xl bg-slate-50 border-slate-200">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Contents are Identical</h3>
                  <p className="text-slate-500 mt-2 max-w-md">
                    Both of you have the exact same content in your drafts. There is no need to merge anything!
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/60 w-fit">
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Added</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500" /> Deleted</div>
                    <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Modified</div>
                  </div>
                  <div className="h-[65vh] min-h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-full rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                      <PlaintextDiff
                        original={activePeerPayload.mine}
                        modified={activePeerPayload.theirs}
                        originalLabel="Your draft"
                        modifiedLabel={activePeerPayload.peerLabel}
                      />
                    </div>
                  </div>
                </>
              )}
              <DialogFooter className="border-t border-slate-100 pt-2">
                <Button variant="outline" onClick={() => setActivePeerPayload(null)}>
                  Close
                </Button>
                {activePeerPayload.mine !== activePeerPayload.theirs && (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowMergeConfirm(true)}>
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Merge Into Mine
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!duplicateMergeRequestPrompt}
        onOpenChange={(open) => {
          if (!open && !isReplacingMergeRequest) {
            setDuplicateMergeRequestPrompt(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-6xl w-[95vw]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <GitPullRequestArrow className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Pending Merge Request Already Exists</DialogTitle>
                <DialogDescription className="mt-1">
                  You already have a pending merge request for <strong>{duplicateMergeRequestPrompt?.resourceLabel ?? 'this resource'}</strong>.
                  You can wait for that request to be approved or rejected, or replace it with a new request that includes your latest changes.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {duplicateMergeRequestPrompt && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
                Replacing will freeze the previous pending request and create a new one. Any approvals on the old request will not carry over.
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/60 w-fit">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Added</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500" /> Deleted</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Modified</div>
              </div>
              <div className="h-[60vh] min-h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-full rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                  <PlaintextDiff
                    original={duplicateMergeRequestPrompt.previousText}
                    modified={duplicateMergeRequestPrompt.nextText}
                    originalLabel="Existing pending request"
                    modifiedLabel="Your latest changes"
                  />
                </div>
              </div>
              <DialogFooter className="border-t border-slate-100 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDuplicateMergeRequestPrompt(null)}
                  disabled={isReplacingMergeRequest}
                >
                  Wait For Current Request
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={replacePendingMergeRequest}
                  disabled={isReplacingMergeRequest}
                >
                  {isReplacingMergeRequest ? 'Replacing...' : 'Replace With New Request'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <GitMerge className="w-5 h-5" />
              Merge Peer Changes
            </DialogTitle>
            <DialogDescription>
              This will safely merge {activePeerPayload?.peerLabel}'s changes into your draft. Your existing changes will be preserved unless there is a direct conflict.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeConfirm(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={async () => {
              if (!activePeerPayload) return;
              try {
                const patch = createPatch('file', activePeerPayload.kingText, activePeerPayload.theirs);
                const mergedResult = applyPatch(activePeerPayload.mine, patch);
                
                if (!mergedResult || typeof mergedResult !== 'string') {
                  toast.error("Merge Conflict", { description: "Cannot auto-merge changes. There are overlapping conflicts between your drafts." });
                  setShowMergeConfirm(false);
                  return;
                }

                await saveFileWithContent(mergedResult);
                setActivePeerPayload(null);
                setShowMergeConfirm(false);
                toast.success("Successfully merged peer changes into your draft.");
              } catch (err) {
                toast.error("Merge failed", { description: "An error occurred while merging the changes." });
                setShowMergeConfirm(false);
              }
            }}>Merge Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportProjectToSpaceModal
        open={isImportProjectOpen}
        onOpenChange={setIsImportProjectOpen}
        spaceId={spaceId}
        spaceKey={spaceKey}
        onImported={applyImportedProject}
      />

      <InviteToPrivateSpaceModal
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        spaceId={spaceId}
        spaceKey={spaceKey}
        onInvited={(invite) => {
          const latest = getLatestWorkspaceState();
          if (!latest.space) return;
          syncWorkspace(
            {
              ...latest.space,
              pendingInvites: [
                {
                  id: invite.id,
                  recipientEmail: invite.recipient.email,
                  inviteToken: invite.inviteToken,
                  createdAt: new Date().toISOString(),
                  hasEncryptedSpaceKey: invite.recipient.hasVaultKey,
                  recipientHasVaultKey: invite.recipient.hasVaultKey,
                },
                ...latest.space.pendingInvites,
              ],
            },
            latest.mergeRequests
          );
          queueBackgroundRefresh(2500);
        }}
      />

      <Dialog open={newBundleOpen} onOpenChange={setNewBundleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Private Bundle</DialogTitle>
            <DialogDescription>
              This bundle is private to you. Other members will not see it or be affected by it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Frontend setup"
              value={newBundleName}
              onChange={(event) => setNewBundleName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewBundleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createBundle} disabled={isSavingBundle || !newBundleName.trim()}>
              {isSavingBundle ? 'Creating...' : 'Create Bundle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={officialHistoryOpen} onOpenChange={setOfficialHistoryOpen}>
        <DialogContent className="sm:max-w-6xl w-[95vw]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <History className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Official File History</DialogTitle>
                <DialogDescription className="mt-1">
                  Official history belongs to the king file only. Restoring a revision updates only your draft until you save or propose it.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {isLoadingOfficialHistory ? (
            <div className="flex min-h-[400px] h-[65vh] items-center justify-center text-sm text-slate-500 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <div className="text-center">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-3 animate-spin" />
                <p>Loading official history...</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] h-[65vh] min-h-[400px]">
              <div className="flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
                  <History className="w-4 h-4 text-slate-500" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revisions</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {officialHistory.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => void previewOfficialHistoryEntry(entry)}
                      className={cn(
                        'w-full rounded-xl px-3 py-3 text-left transition-all duration-150',
                        officialHistoryPreview?.revisionId === entry.id
                          ? 'border border-indigo-200 bg-indigo-50 shadow-sm'
                          : 'border border-transparent hover:border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Revision {entry.revisionNumber}</p>
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-500">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </Badge>
                      </div>
                      <p className="mt-1.5 truncate text-[11px] text-slate-500 font-mono bg-white/50 px-2 py-0.5 rounded-md inline-block">
                        {entry.folderPath === '/' ? '' : entry.folderPath}/{entry.name}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(entry.createdAt).toLocaleTimeString()}
                      </p>
                    </button>
                  ))}
                  {officialHistory.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <History className="w-8 h-8 text-slate-200 mb-2" />
                      <p className="text-sm font-medium text-slate-500">No official history yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="p-4 shrink-0 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-700">
                    {officialHistoryPreview
                      ? <span className="flex items-center gap-2"><History className="w-4 h-4 text-slate-400"/> Previewing <strong className="text-indigo-600">Revision {officialHistory.find((entry) => entry.id === officialHistoryPreview.revisionId)?.revisionNumber}</strong></span>
                      : <span className="text-slate-400 italic">Select a revision to preview its content</span>}
                  </div>
                  {officialHistoryPreview && (
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 h-8 shadow-sm"
                      onClick={() => {
                        const entry = officialHistory.find((candidate) => candidate.id === officialHistoryPreview.revisionId);
                        if (entry) {
                          void restoreOfficialHistoryEntry(entry);
                        }
                      }}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Restore Into My Draft
                    </Button>
                  )}
                </div>
                
                {officialHistoryPreview ? (
                  <div className="flex-1 min-h-0 flex bg-white relative">
                    <div 
                      className="w-12 shrink-0 bg-slate-50 border-r border-slate-100 text-right pr-3 py-4 select-none overflow-hidden"
                      aria-hidden="true"
                    >
                      {(officialHistoryPreview.text ?? '').split('\n').map((_, i) => (
                        <div key={i} className="text-sm leading-[21px] text-slate-400 font-mono">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={officialHistoryPreview.text ?? ''}
                      readOnly
                      className="flex-1 p-4 font-mono text-sm leading-[21px] resize-none outline-none bg-transparent overflow-auto text-slate-700"
                      wrap="off"
                      spellCheck={false}
                      onScroll={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        if (target.previousElementSibling) {
                          target.previousElementSibling.scrollTop = target.scrollTop;
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-50/30">
                    <History className="w-12 h-12 text-slate-200" />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showHistoryRestoreConfirm} onOpenChange={(open) => { if (!open) setShowHistoryRestoreConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Overwrite Your Draft
            </DialogTitle>
            <DialogDescription>
              This will replace your entire current draft with official revision v{showHistoryRestoreConfirm?.revisionNumber}. Any unsaved changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryRestoreConfirm(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={confirmHistoryRestore}>
              Yes, Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmFileId} onOpenChange={(open) => { if (!open) setDeleteConfirmFileId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5" />
              Delete File
            </DialogTitle>
            <DialogDescription>
              This will permanently delete this file from your workspace. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmFileId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmFileId) deleteWorkspaceFile(deleteConfirmFileId); }} disabled={isDeletingFile}>
              {isDeletingFile ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeTarget} onOpenChange={(open) => { if (!open) setMergeTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <GitMerge className="w-5 h-5" />
              Merge Copy Into Base
            </DialogTitle>
            <DialogDescription>
              Replace the base file content with {mergeTarget?.sourceName} content. What would you like to do with the copy file?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setMergeTarget(null)}>Cancel</Button>
            <Button variant="outline" className="text-amber-600" onClick={() => { if (mergeTarget) mergeCopyIntoBase(mergeTarget.sourceId, false); }} disabled={isMerging}>
              Keep Copy
            </Button>
            <Button onClick={() => { if (mergeTarget) mergeCopyIntoBase(mergeTarget.sourceId, true); }} disabled={isMerging} className="bg-indigo-600 hover:bg-indigo-700">
              {isMerging ? 'Merging...' : 'Merge & Delete Copy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mustVote}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Election Lockdown</DialogTitle>
            <DialogDescription>
              This space now has 10 or more members. Select exactly three other members for the Iron Throne council.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {votingCandidates.map((candidate) => {
              const selected = selectedVoteMemberIds.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    setSelectedVoteMemberIds((current) => {
                      if (current.includes(candidate.id)) {
                        return current.filter((id) => id !== candidate.id);
                      }
                      if (current.length >= 3) return current;
                      return [...current, candidate.id];
                    });
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-medium text-slate-900">{candidate.user.name || candidate.user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">{candidate.user.email}</p>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <div className="mr-auto flex items-center gap-2 text-sm text-slate-500">
              <ShieldAlert className="h-4 w-4" />
              Pick {3 - selectedVoteMemberIds.length > 0 ? `${3 - selectedVoteMemberIds.length} more` : 'ready to vote'}
            </div>
            <Button onClick={submitElectionVote} disabled={selectedVoteMemberIds.length !== 3 || isSubmittingVote}>
              {isSubmittingVote ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Vote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClonePanel} onOpenChange={setShowClonePanel}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Clone from Peer
            </DialogTitle>
            <DialogDescription>
              Request another member to share their workspace structure or content with you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cloneRequestsReceived.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Requests for you</p>
                <div className="space-y-2">
                  {cloneRequestsReceived.map(req => (
                    <div key={req.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-800">
                        {req.requester?.user.name || req.requester?.user.email} wants to clone your {req.type.toLowerCase()}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7"
                          onClick={() => handleCloneRequestAction(req.id, 'APPROVE')} disabled={isApprovingCloneRequest}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 text-rose-600"
                          onClick={() => handleCloneRequestAction(req.id, 'REJECT')} disabled={isApprovingCloneRequest}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Request from a member</p>
              <div className="space-y-2">
                {space?.members.filter(m => m.id !== space.myMembership.id).map(member => {
                  const existing = cloneRequestsSent.find(r => r.source?.id === member.id && r.status === 'PENDING');
                  return (
                    <div key={member.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{member.user.name || member.user.email}</p>
                        <p className="text-xs text-slate-400">{member.user.email}</p>
                      </div>
                      {existing ? (
                        <Badge className="bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="text-xs h-7"
                            onClick={() => sendCloneRequest(member.id, 'STRUCTURE')} disabled={isSendingCloneRequest}>
                            Structure
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7 text-indigo-600"
                            onClick={() => sendCloneRequest(member.id, 'CONTENT')} disabled={isSendingCloneRequest}>
                            Content
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClonePanel(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!forkConflict} onOpenChange={(open) => { if (!open) setForkConflict(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <GitPullRequestArrow className="w-5 h-5" />
              Smart Merge — King File Changes
            </DialogTitle>
            <DialogDescription>
              The King file has changes for <strong>{forkConflict?.workspaceFile.name}</strong>. You can apply only the King&apos;s changes while keeping your own additions.
            </DialogDescription>
          </DialogHeader>
          {forkConflict && (
            <ForkDiffViewer
              workspaceText={forkConflict.workspaceText}
              kingText={forkConflict.kingText}
              fileName={forkConflict.workspaceFile.name}
              isApplying={isSavingFile}
              isCloning={isCloningFile}
              onApply={async (mergedText) => {
                setForkConflict(null);
                await saveFileWithContent(mergedText);
                toast.success('King changes merged into your workspace');
              }}
              onCancel={() => setForkConflict(null)}
              onOverwrite={() => {
                setForkConflict(null);
                doForkOfficialFile(forkConflict.kingFile);
              }}
              onCloneFirst={async () => {
                if (!forkConflict) return;
                await cloneWorkspaceFile(forkConflict.workspaceFile.id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
